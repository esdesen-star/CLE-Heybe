package main

// Çevrim dışı rota ve yer dizini hazırlığı (09.11.2026, harita 8i).
// Girdi: Geofabrik .osm.pbf (OpenStreetMap, ODbL). Çıktı:
//   <ad>.rota — yol ağı (yaya + araç), ikili dosya, rotayı algoritma hesaplar (dil modeli değil);
//   <ad>.yer  — ad ile arama ve "en yakın hastane / toplanma alanı" için düz metin dizin.
// Bir kez yapılır (kurum ya da kullanıcı, iyi bir bilgisayarda); sonra her şey internetsiz.
// Bilinen sınır (v1): dönüş yasakları (turn restriction) okunmuyor; araç rotası nadiren yasak bir dönüş önerebilir.

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	rotaSihir    = "HEYBEROTA1\n"
	bitYaya      = 1
	bitAracIleri = 2
	bitAracGeri  = 4
	hucreOlcek   = 100 // ızgara hücresi 0,01 derece (~1 km)
)

// yolSinifi: highway değeri → sınıf kodu, araç için varsayılan hız (km/s), yaya/araç izni.
// 09.11: varsayılanlar şehir içine göre (etiketsiz ana yollar çoğu zaman şehirde); şehirlerarası yollarda
// maxspeed etiketi çoğunlukla var. Sürede ayrıca 0,8 katsayısı (harita_rota.go): ortalama hız sınırın altındadır.
type yolSinifi struct {
	kod  uint8
	hiz  uint8
	yaya bool
	arac bool
}

var yolSiniflari = map[string]yolSinifi{
	"motorway":       {1, 110, false, true},
	"motorway_link":  {2, 60, false, true},
	"trunk":          {3, 90, true, true},
	"trunk_link":     {4, 50, true, true},
	"primary":        {5, 60, true, true},
	"primary_link":   {6, 40, true, true},
	"secondary":      {7, 50, true, true},
	"secondary_link": {8, 40, true, true},
	"tertiary":       {9, 40, true, true},
	"tertiary_link":  {10, 30, true, true},
	"unclassified":   {11, 35, true, true},
	"residential":    {12, 25, true, true},
	"living_street":  {13, 10, true, true},
	"service":        {14, 15, true, true},
	"road":           {15, 25, true, true},
	"track":          {16, 0, true, false},
	"pedestrian":     {17, 0, true, false},
	"footway":        {18, 0, true, false},
	"path":           {19, 0, true, false},
	"steps":          {20, 0, true, false},
	"cycleway":       {21, 0, true, false},
	"bridleway":      {22, 0, true, false},
	"corridor":       {23, 0, true, false},
}

// Vapur ve feribot hatları (route=ferry): İstanbul gibi yerlerde yaya için tek bağlantı olabilir.
// Afetten sonra seferler durmuş olabilir: sayfa bu adımı uyarıyla gösterir.
const sinifVapur = 24

func evetMi(v string) bool {
	return v == "yes" || v == "designated" || v == "permissive" || v == "destination"
}
func hayirMi(v string) bool { return v == "no" || v == "private" }

// yolIzinleri: bir yolun yaya / araç-ileri / araç-geri izinleri.
func yolIzinleri(e map[string]string) (bayrak uint8, s yolSinifi, ok bool) {
	if e["route"] == "ferry" && e["highway"] == "" {
		s = yolSinifi{sinifVapur, 20, true, false}
		if evetMi(e["motor_vehicle"]) || evetMi(e["motorcar"]) {
			s.arac = true
		}
		if hayirMi(e["foot"]) {
			s.yaya = false
		}
		if s.yaya {
			bayrak |= bitYaya
		}
		if s.arac {
			bayrak |= bitAracIleri | bitAracGeri
		}
		return bayrak, s, bayrak != 0
	}
	s, ok = yolSiniflari[e["highway"]]
	if !ok {
		return 0, s, false
	}
	if e["area"] == "yes" && e["highway"] != "pedestrian" {
		return 0, s, false
	}
	yaya, arac := s.yaya, s.arac
	if hayirMi(e["access"]) {
		yaya, arac = false, false
	}
	if v := e["foot"]; v != "" {
		if hayirMi(v) {
			yaya = false
		} else if evetMi(v) {
			yaya = true
		}
	}
	for _, k := range []string{"vehicle", "motor_vehicle", "motorcar"} {
		if v := e[k]; v != "" {
			if hayirMi(v) {
				arac = false
			} else if evetMi(v) && s.arac {
				arac = true
			}
		}
	}
	if yaya {
		bayrak |= bitYaya
	}
	if arac {
		tekYon := e["oneway"]
		if tekYon == "" && (e["junction"] == "roundabout" || e["junction"] == "circular" || e["highway"] == "motorway") {
			tekYon = "yes"
		}
		switch tekYon {
		case "yes", "1", "true":
			bayrak |= bitAracIleri
		case "-1", "reverse":
			bayrak |= bitAracGeri
		default:
			bayrak |= bitAracIleri | bitAracGeri
		}
	}
	if bayrak == 0 {
		return 0, s, false
	}
	if ms := azamiHiz(e["maxspeed"]); ms > 0 && s.arac {
		s.hiz = ms
	}
	return bayrak, s, true
}

func azamiHiz(v string) uint8 {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0
	}
	mph := strings.HasSuffix(v, "mph")
	v = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(v, "mph"), "km/h"))
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0
	}
	if mph {
		n = n * 1609 / 1000
	}
	if n > 140 {
		n = 140
	}
	return uint8(n)
}

// yerTuru: dizine girecek nokta türleri. Kod, sayfada dile çevrilir.
func yerTuru(e map[string]string) string {
	if e == nil {
		return ""
	}
	if v := e["emergency"]; v == "assembly_point" {
		return "toplanma"
	}
	switch e["amenity"] {
	case "hospital":
		return "hastane"
	case "clinic", "doctors":
		return "saglik"
	case "pharmacy":
		return "eczane"
	case "police":
		return "polis"
	case "fire_station":
		return "itfaiye"
	case "shelter":
		return "barinak"
	case "drinking_water", "water_point":
		return "su"
	case "school", "university", "college":
		return "okul"
	case "townhall":
		return "belediye"
	case "place_of_worship":
		return "ibadet"
	case "fuel":
		return "akaryakit"
	case "bus_station":
		return "otogar"
	}
	if e["social_facility"] == "shelter" {
		return "barinak"
	}
	if e["shop"] == "supermarket" {
		return "market"
	}
	if e["railway"] == "station" {
		return "istasyon"
	}
	switch e["place"] {
	case "city":
		return "sehir"
	case "town":
		return "kasaba"
	case "village":
		return "koy"
	case "suburb", "quarter":
		return "semt"
	case "neighbourhood":
		return "mahalle"
	case "hamlet", "isolated_dwelling":
		return "mezra"
	}
	return ""
}

// yerAdi: dizinde görünen ad ve aramaya katılan diğer adlar.
func yerAdi(e map[string]string) (ad, ek string) {
	ad = e["name"]
	if ad == "" {
		ad = e["name:tr"]
	}
	if ad == "" {
		ad = e["name:en"]
	}
	var ekler []string
	for _, k := range []string{"name:tr", "name:en", "alt_name", "old_name", "official_name", "short_name"} {
		if v := e[k]; v != "" && v != ad {
			ekler = append(ekler, v)
		}
	}
	return ad, strings.Join(ekler, " ")
}

// aramaNormal: Türkçe büyük-küçük harf ve şapkalar aramayı bozmasın (ı=i, ş=s, â=a …).
func aramaNormal(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(s, "İ", "i"), "I", "ı")) {
		switch r {
		case 'ı', 'i', 'î', 'ì', 'í', 'ï':
			r = 'i'
		case 'ş', 'ș':
			r = 's'
		case 'ğ':
			r = 'g'
		case 'ç':
			r = 'c'
		case 'ö', 'ô', 'ò', 'ó', 'ø', 'õ':
			r = 'o'
		case 'æ': // 09.11: Norveççe/Danca "æ" → "ae"
			b.WriteString("a")
			r = 'e'
		case 'ß':
			b.WriteString("s")
			r = 's'
		case 'ñ':
			r = 'n'
		case 'ü', 'û', 'ù', 'ú':
			r = 'u'
		case 'â', 'à', 'á', 'ä', 'å':
			r = 'a'
		case 'é', 'è', 'ê', 'ë':
			r = 'e'
		case '\t', '\n', '\r':
			r = ' '
		case '̇': // birleşik nokta (İ'nin ToLower artığı)
			continue
		}
		b.WriteRune(r)
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func hucreAnahtar(lat, lon int32) int64 {
	la := int64(math.Floor(float64(lat) / 1e7 * hucreOlcek))
	lo := int64(math.Floor(float64(lon) / 1e7 * hucreOlcek))
	return (la+9000)*100000 + (lo + 18000)
}

func mesafeE7(lat1, lon1, lat2, lon2 int32) float64 {
	const r = 6371000.0
	f1 := float64(lat1) / 1e7 * math.Pi / 180
	f2 := float64(lat2) / 1e7 * math.Pi / 180
	df := f2 - f1
	dl := float64(lon2-lon1) / 1e7 * math.Pi / 180
	a := math.Sin(df/2)*math.Sin(df/2) + math.Cos(f1)*math.Cos(f2)*math.Sin(dl/2)*math.Sin(dl/2)
	return 2 * r * math.Asin(math.Min(1, math.Sqrt(a)))
}

type hazirlikOzet struct {
	Surum      int     `json:"surum"`
	Kaynak     string  `json:"kaynak"`
	Lisans     string  `json:"lisans"`
	Hazirlandi string  `json:"hazirlandi"`
	VeriTarihi string  `json:"veriTarihi"`
	Dugum      int     `json:"dugum"`
	Parca      int     `json:"parca"`
	GeoNokta   int     `json:"geoNokta"`
	Yer        int     `json:"yer"`
	Sure       float64 `json:"sureSn"`
	EnKucukLat float64 `json:"guney"`
	EnKucukLon float64 `json:"bati"`
	EnBuyukLat float64 `json:"kuzey"`
	EnBuyukLon float64 `json:"dogu"`
}

type yerKaydi struct {
	tur, ad, ek string
	lat, lon    int32
	baglam      string
}

// haritaHazirla: pbf → .rota + .yer. veriTarihi: OSM verisinin tarihi (sayfada uyarıyla görünür).
// haritaHazirla: kutu verilirse (batı, güney, doğu, kuzey) yalnız içindeki yollar ve yerler alınır (09.11, §79):
// büyük bir ülkenin dosyasından tek bir şehir (ör. Sandnessjøen) hazırlanabilsin; kurum kendi ilçesini koyabilsin.
func haritaHazirla(pbfYolu, ciktiOnEk, veriTarihi string, gunluk func(string), kutu *[4]float64) (*hazirlikOzet, error) {
	bas := time.Now()
	if gunluk == nil {
		gunluk = func(string) {}
	}
	icinde := func(lat, lon int32) bool { return true }
	icMi := func(id int64) bool { return true }
	if kutu != nil {
		k := [4]int32{int32(kutu[0] * 1e7), int32(kutu[1] * 1e7), int32(kutu[2] * 1e7), int32(kutu[3] * 1e7)}
		icinde = func(lat, lon int32) bool { return lon >= k[0] && lat >= k[1] && lon <= k[2] && lat <= k[3] }
		var ic []int64
		f0, err := os.Open(pbfYolu)
		if err != nil {
			return nil, err
		}
		g0 := &pbfGezgin{Dugum: func(d *osmDugum) {
			if icinde(d.Lat, d.Lon) {
				ic = append(ic, d.ID)
			}
		}}
		err = g0.Gez(f0)
		f0.Close()
		if err != nil {
			return nil, fmt.Errorf("0. geçiş: %w", err)
		}
		sort.Slice(ic, func(i, j int) bool { return ic[i] < ic[j] })
		icMi = func(id int64) bool {
			i := sort.Search(len(ic), func(i int) bool { return ic[i] >= id })
			return i < len(ic) && ic[i] == id
		}
		gunluk(fmt.Sprintf("0. geçiş: kutuda %d düğüm (%.0f sn)", len(ic), time.Since(bas).Seconds()))
		if len(ic) == 0 {
			return nil, errors.New("kutuda hiç düğüm yok")
		}
	}
	// 1. geçiş: yollar ve alan biçimli yerler (hastane binası gibi)
	var refs []int64
	var yolOff []uint32
	var yolBayrak, yolHiz, yolSinif []uint8
	var yolAd []uint32
	adlar := []string{""}
	adNo := map[string]uint32{"": 0}
	var yerler []yerKaydi
	var yerRef []int64 // alan biçimli yerin ilk düğümü; koordinatı 2. geçişte gelir
	var yerRefNo []int
	type sokak struct {
		ad  uint32
		ref int64
	}
	var sokaklar []sokak
	f, err := os.Open(pbfYolu)
	if err != nil {
		return nil, err
	}
	g := &pbfGezgin{Yol: func(y *osmYol) {
		if len(y.Refs) < 2 {
			return
		}
		if kutu != nil { // kutuya hiç değmeyen yol alınmaz; değen yol bütünüyle alınır
			deger := false
			for _, r := range y.Refs {
				if icMi(r) {
					deger = true
					break
				}
			}
			if !deger {
				return
			}
		}
		if b, s, ok := yolIzinleri(y.Etiket); ok {
			yolOff = append(yolOff, uint32(len(refs)))
			refs = append(refs, y.Refs...)
			yolBayrak = append(yolBayrak, b)
			yolHiz = append(yolHiz, s.hiz)
			yolSinif = append(yolSinif, s.kod)
			ad := y.Etiket["name"]
			no, var_ := adNo[ad]
			if !var_ {
				no = uint32(len(adlar))
				adlar = append(adlar, ad)
				adNo[ad] = no
			}
			yolAd = append(yolAd, no)
			if ad != "" && s.kod <= 17 {
				sokaklar = append(sokaklar, sokak{no, y.Refs[len(y.Refs)/2]})
			}
			return
		}
		if t := yerTuru(y.Etiket); t != "" {
			ad, ek := yerAdi(y.Etiket)
			if ad == "" && t != "toplanma" {
				return
			}
			yerRef = append(yerRef, y.Refs[0])
			yerRefNo = append(yerRefNo, len(yerler))
			yerler = append(yerler, yerKaydi{tur: t, ad: ad, ek: ek})
		}
	}}
	if err := g.Gez(f); err != nil {
		f.Close()
		return nil, fmt.Errorf("1. geçiş: %w", err)
	}
	f.Close()
	yolOff = append(yolOff, uint32(len(refs)))
	gunluk(fmt.Sprintf("1. geçiş: %d yol, %d düğüm başvurusu, %d alan biçimli yer, %d sokak adı (%.0f sn)", len(yolBayrak), len(refs), len(yerRef), len(sokaklar), time.Since(bas).Seconds()))
	if len(yolBayrak) == 0 {
		return nil, errors.New("dosyada yol bulunamadı")
	}

	// Kesişimler: iki ya da daha çok kez geçen düğüm ve yol uçları köşe olur.
	sirali := make([]int64, len(refs))
	copy(sirali, refs)
	sort.Slice(sirali, func(i, j int) bool { return sirali[i] < sirali[j] })
	var tekil []int64
	var kosemi []bool
	for i := 0; i < len(sirali); {
		j := i
		for j < len(sirali) && sirali[j] == sirali[i] {
			j++
		}
		tekil = append(tekil, sirali[i])
		kosemi = append(kosemi, j-i >= 2)
		i = j
	}
	sirali = nil
	bul := func(id int64) int {
		k := sort.Search(len(tekil), func(i int) bool { return tekil[i] >= id })
		if k < len(tekil) && tekil[k] == id {
			return k
		}
		return -1
	}
	for w := 0; w+1 < len(yolOff); w++ {
		a, b := yolOff[w], yolOff[w+1]
		kosemi[bul(refs[a])] = true
		kosemi[bul(refs[b-1])] = true
	}
	// yer düğümleri ve sokak ortaları: yol düğümü değilse ayrı tabloda
	var ekIDler []int64
	for _, r := range yerRef {
		if bul(r) < 0 {
			ekIDler = append(ekIDler, r)
		}
	}
	sort.Slice(ekIDler, func(i, j int) bool { return ekIDler[i] < ekIDler[j] })

	// 2. geçiş: düğüm koordinatları + nokta biçimli yerler
	lat := make([]int32, len(tekil))
	lon := make([]int32, len(tekil))
	bulundu := make([]bool, len(tekil))
	ekLat := make([]int32, len(ekIDler))
	ekLon := make([]int32, len(ekIDler))
	ekBul := func(id int64) int {
		k := sort.Search(len(ekIDler), func(i int) bool { return ekIDler[i] >= id })
		if k < len(ekIDler) && ekIDler[k] == id {
			return k
		}
		return -1
	}
	var mLat, mLon, xLat, xLon int32 = math.MaxInt32, math.MaxInt32, math.MinInt32, math.MinInt32
	f, err = os.Open(pbfYolu)
	if err != nil {
		return nil, err
	}
	g = &pbfGezgin{DugumEtiket: true, Dugum: func(d *osmDugum) {
		if k := bul(d.ID); k >= 0 {
			lat[k], lon[k], bulundu[k] = d.Lat, d.Lon, true
			if d.Lat < mLat {
				mLat = d.Lat
			}
			if d.Lat > xLat {
				xLat = d.Lat
			}
			if d.Lon < mLon {
				mLon = d.Lon
			}
			if d.Lon > xLon {
				xLon = d.Lon
			}
		} else if k := ekBul(d.ID); k >= 0 {
			ekLat[k], ekLon[k] = d.Lat, d.Lon
		}
		if d.Etiket != nil && icinde(d.Lat, d.Lon) {
			if t := yerTuru(d.Etiket); t != "" {
				ad, ek := yerAdi(d.Etiket)
				if ad != "" || t == "toplanma" {
					yerler = append(yerler, yerKaydi{tur: t, ad: ad, ek: ek, lat: d.Lat, lon: d.Lon})
				}
			}
		}
	}}
	if err := g.Gez(f); err != nil {
		f.Close()
		return nil, fmt.Errorf("2. geçiş: %w", err)
	}
	f.Close()
	eksik := 0
	for _, v := range bulundu {
		if !v {
			eksik++
		}
	}
	gunluk(fmt.Sprintf("2. geçiş: %d yol düğümü (%d eksik), %d yer (%.0f sn)", len(tekil), eksik, len(yerler), time.Since(bas).Seconds()))
	for i, r := range yerRef {
		n := yerRefNo[i]
		if k := bul(r); k >= 0 {
			yerler[n].lat, yerler[n].lon = lat[k], lon[k]
		} else if k := ekBul(r); k >= 0 {
			yerler[n].lat, yerler[n].lon = ekLat[k], ekLon[k]
		}
	}

	// Köşeleri ızgara hücresine göre sırala (yakın köşe aramada hücre aralığı yeter).
	type kose struct {
		k   int
		hcr int64
	}
	var koseler []kose
	for k := range tekil {
		if kosemi[k] && bulundu[k] {
			koseler = append(koseler, kose{k, hucreAnahtar(lat[k], lon[k])})
		}
	}
	sort.Slice(koseler, func(i, j int) bool {
		if koseler[i].hcr != koseler[j].hcr {
			return koseler[i].hcr < koseler[j].hcr
		}
		return koseler[i].k < koseler[j].k
	})
	koseNo := make([]int32, len(tekil))
	for i := range koseNo {
		koseNo[i] = -1
	}
	V := len(koseler)
	vLat := make([]int32, V)
	vLon := make([]int32, V)
	var hucreler []int64
	var hucreBas []uint32
	for i, c := range koseler {
		koseNo[c.k] = int32(i)
		vLat[i], vLon[i] = lat[c.k], lon[c.k]
		if len(hucreler) == 0 || hucreler[len(hucreler)-1] != c.hcr {
			hucreler = append(hucreler, c.hcr)
			hucreBas = append(hucreBas, uint32(i))
		}
	}
	hucreBas = append(hucreBas, uint32(V))
	koseler = nil

	// Parçalar: iki köşe arası yol; ara noktalar çizim için (dosyanın sonunda, gerektikçe okunur).
	var sA, sB []uint32
	var sUz []float32
	var sBayrak, sHiz, sSinif []uint8
	var sAd []uint32
	var gOff []uint32
	var gLat, gLon []int32
	for w := 0; w+1 < len(yolOff); w++ {
		a, b := int(yolOff[w]), int(yolOff[w+1])
		onceki := -1 // son köşe (refs içindeki sıra)
		var uz float64
		araBas := len(gLat)
		for i := a; i < b; i++ {
			k := bul(refs[i])
			if !bulundu[k] { // eksik düğüm: yolu burada kes
				onceki = -1
				gLat, gLon = gLat[:araBas], gLon[:araBas]
				continue
			}
			if onceki >= 0 {
				pk := bul(refs[i-1])
				uz += mesafeE7(lat[pk], lon[pk], lat[k], lon[k])
			}
			if koseNo[k] >= 0 {
				if onceki >= 0 {
					ka := koseNo[bul(refs[onceki])]
					kb := koseNo[k]
					if ka != kb {
						sA = append(sA, uint32(ka))
						sB = append(sB, uint32(kb))
						sUz = append(sUz, float32(uz))
						sBayrak = append(sBayrak, yolBayrak[w])
						sHiz = append(sHiz, yolHiz[w])
						sSinif = append(sSinif, yolSinif[w])
						sAd = append(sAd, yolAd[w])
						gOff = append(gOff, uint32(araBas))
					} else {
						gLat, gLon = gLat[:araBas], gLon[:araBas]
					}
				}
				onceki = i
				uz = 0
				araBas = len(gLat)
			} else if onceki >= 0 {
				gLat = append(gLat, lat[k])
				gLon = append(gLon, lon[k])
			}
		}
		gLat, gLon = gLat[:araBas], gLon[:araBas]
	}
	gOff = append(gOff, uint32(len(gLat)))
	S := len(sA)
	// Komşuluk (CSR): her köşeden çıkan parça yönleri; izin süzgeci sorguda.
	derece := make([]uint32, V+1)
	for i := 0; i < S; i++ {
		derece[sA[i]+1]++
		derece[sB[i]+1]++
	}
	for i := 1; i <= V; i++ {
		derece[i] += derece[i-1]
	}
	komsu := make([]uint32, derece[V])
	dol := make([]uint32, V)
	copy(dol, derece[:V])
	for i := 0; i < S; i++ {
		komsu[dol[sA[i]]] = uint32(i) << 1
		dol[sA[i]]++
		komsu[dol[sB[i]]] = uint32(i)<<1 | 1
		dol[sB[i]]++
	}
	gunluk(fmt.Sprintf("ağ: %d köşe, %d parça, %d ara nokta (%.0f sn)", V, S, len(gLat), time.Since(bas).Seconds()))

	// Yer bağlamı: en yakın şehir/kasaba ve semt/mahalle/köy.
	for _, s := range sokaklar {
		k := bul(s.ref)
		if k < 0 || !bulundu[k] {
			continue
		}
		yerler = append(yerler, yerKaydi{tur: "sokak", ad: adlar[s.ad], lat: lat[k], lon: lon[k]})
	}
	yerler = yerBaglamVer(yerler)

	ozet := &hazirlikOzet{Surum: 1, Kaynak: "OpenStreetMap (" + pbfYolu[strings.LastIndex(pbfYolu, "/")+1:] + ")",
		Lisans: "© OpenStreetMap katkıcıları — ODbL", Hazirlandi: time.Now().Format("2006-01-02"), VeriTarihi: veriTarihi,
		Dugum: V, Parca: S, GeoNokta: len(gLat), Yer: len(yerler),
		EnKucukLat: float64(mLat) / 1e7, EnKucukLon: float64(mLon) / 1e7, EnBuyukLat: float64(xLat) / 1e7, EnBuyukLon: float64(xLon) / 1e7}

	// .rota yaz
	if err := rotaYaz(ciktiOnEk+".rota", ozet, vLat, vLon, hucreler, hucreBas, derece, komsu, sA, sB, sUz, sBayrak, sHiz, sSinif, sAd, adlar, gOff, gLat, gLon); err != nil {
		return nil, err
	}
	if err := yerYaz(ciktiOnEk+".yer", yerler); err != nil {
		return nil, err
	}
	ozet.Sure = math.Round(time.Since(bas).Seconds())
	return ozet, nil
}

func yerBaglamVer(yerler []yerKaydi) []yerKaydi {
	// Bağlam: "mahalle, ilçe/kasaba, şehir" — aramada "antakya cumhuriyet" gibi üst adla da bulunsun (09.11).
	// İdari sınırlar okunmuyor; en yakın yer adı kullanılır, bu yüzden sınırdaki yerlerde komşu ad çıkabilir.
	type yerNokta struct {
		ad       string
		lat, lon int32
	}
	sehir := map[int64][]yerNokta{}  // 0,1 derece hücre
	kasaba := map[int64][]yerNokta{} // 0,1 derece hücre
	alt := map[int64][]yerNokta{}    // semt, mahalle, köy — 0,01 derece hücre
	h10 := func(lat, lon int32) int64 {
		return (int64(math.Floor(float64(lat)/1e6))+900)*10000 + int64(math.Floor(float64(lon)/1e6)) + 1800
	}
	for _, y := range yerler {
		switch y.tur {
		case "sehir":
			sehir[h10(y.lat, y.lon)] = append(sehir[h10(y.lat, y.lon)], yerNokta{y.ad, y.lat, y.lon})
		case "kasaba":
			kasaba[h10(y.lat, y.lon)] = append(kasaba[h10(y.lat, y.lon)], yerNokta{y.ad, y.lat, y.lon})
		case "semt", "mahalle", "koy":
			alt[hucreAnahtar(y.lat, y.lon)] = append(alt[hucreAnahtar(y.lat, y.lon)], yerNokta{y.ad, y.lat, y.lon})
		}
	}
	enYakin := func(m map[int64][]yerNokta, anahtar func(int32, int32) int64, adim int32, yaricap int, lat, lon int32, haric string) string {
		en, enAd := math.MaxFloat64, ""
		for dy := -yaricap; dy <= yaricap; dy++ {
			for dx := -yaricap; dx <= yaricap; dx++ {
				for _, p := range m[anahtar(lat+int32(dy)*adim, lon+int32(dx)*adim)] {
					if p.ad == haric {
						continue
					}
					if d := mesafeE7(lat, lon, p.lat, p.lon); d < en {
						en, enAd = d, p.ad
					}
				}
			}
		}
		return enAd
	}
	for i := range yerler {
		y := &yerler[i]
		var parca []string
		ekle := func(a string) {
			if a != "" && a != y.ad && (len(parca) == 0 || parca[len(parca)-1] != a) {
				parca = append(parca, a)
			}
		}
		switch y.tur {
		case "sehir":
		case "kasaba":
			ekle(enYakin(sehir, h10, 1000000, 4, y.lat, y.lon, y.ad))
		case "semt", "mahalle", "koy":
			ekle(enYakin(kasaba, h10, 1000000, 1, y.lat, y.lon, y.ad))
			ekle(enYakin(sehir, h10, 1000000, 4, y.lat, y.lon, y.ad))
		default:
			ekle(enYakin(alt, hucreAnahtar, 100000, 1, y.lat, y.lon, ""))
			ekle(enYakin(kasaba, h10, 1000000, 1, y.lat, y.lon, ""))
			ekle(enYakin(sehir, h10, 1000000, 4, y.lat, y.lon, ""))
		}
		y.baglam = strings.Join(parca, ", ")
	}
	// Aynı ad + aynı bağlamdaki sokak tekrarlarını at (uzun caddeler birçok parçadan oluşur).
	gorulen := map[string]bool{}
	out := yerler[:0]
	for _, y := range yerler {
		if y.tur == "sokak" {
			k := y.ad + "\x00" + y.baglam
			if gorulen[k] {
				continue
			}
			gorulen[k] = true
		}
		out = append(out, y)
	}
	return out
}

func yerYaz(yol string, yerler []yerKaydi) error {
	f, err := os.Create(yol + ".part")
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(f, 1<<20)
	temiz := func(s string) string { return strings.NewReplacer("\t", " ", "\n", " ", "\r", " ").Replace(s) }
	for _, y := range yerler {
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d\t%d\n", aramaNormal(y.ad+" "+y.ek+" "+y.baglam), y.tur, temiz(y.ad), temiz(y.baglam), y.lat, y.lon)
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(yol+".part", yol)
}

// rotaYaz: başlık JSON + diziler (küçük-sonlu). Ara noktalar en sonda: sorguda yalnız rota parçaları okunur.
func rotaYaz(yol string, ozet *hazirlikOzet, vLat, vLon []int32, hucreler []int64, hucreBas, derece, komsu, sA, sB []uint32, sUz []float32, sBayrak, sHiz, sSinif []uint8, sAd []uint32, adlar []string, gOff []uint32, gLat, gLon []int32) error {
	f, err := os.Create(yol + ".part")
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(f, 4<<20)
	bj, _ := json.Marshal(ozet)
	w.WriteString(rotaSihir)
	binary.Write(w, binary.LittleEndian, uint32(len(bj)))
	w.Write(bj)
	adBlob := strings.Join(adlar, "\x00")
	sayilar := []uint64{uint64(len(vLat)), uint64(len(hucreler)), uint64(len(komsu)), uint64(len(sA)), uint64(len(adBlob)), uint64(len(gLat))}
	binary.Write(w, binary.LittleEndian, sayilar)
	for _, d := range []any{vLat, vLon, hucreler, hucreBas, derece, komsu, sA, sB, sUz, sBayrak, sHiz, sSinif, sAd, []byte(adBlob), gOff, gLat, gLon} {
		if err := binary.Write(w, binary.LittleEndian, d); err != nil {
			f.Close()
			return err
		}
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(yol+".part", yol)
}

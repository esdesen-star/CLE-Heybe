package main

// Kurumun kendi noktaları (09.11.2026, Özet §77 · K18: Heybe sistemdir, veri kurumun).
// 09.11 bulgusu: Hatay'ın toplanma alanları OpenStreetMap'te yok; "en yakın" 181 km öteden çıktı.
// Kurum (AFAD, belediye, Kızılay) kendi listesini harita/ek/ klasörüne koyar ya da harita sayfasından ekler:
// Excel (.xlsx), CSV/TXT, GeoJSON, KML/KMZ. Sütun adları serbest (enlem/boylam, lat/lon, ad, tür, mahalle, ilçe…).
// Tür sütunu yoksa tür, adın içinden ("… toplanma alanı") ya da dosya adından çıkarılır; çıkmazsa "diğer".
// Her nokta listesinin adıyla görünür: kaynak gösterilir (Heybe'nin ilkesi).

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

type ekNokta struct {
	Tur, Ad, Baglam, Liste string
	Lat, Lon               int32
}

type ekListe struct {
	Dosya    string         `json:"dosya"`
	Nokta    int            `json:"nokta"`
	Turler   map[string]int `json:"turler"`
	Uyarilar []string       `json:"uyarilar,omitempty"`
}

const (
	ekAzamiBoy   = 30 << 20
	ekAzamiNokta = 200000
)

var ekUzanti = map[string]bool{".csv": true, ".txt": true, ".tsv": true, ".xlsx": true, ".geojson": true, ".json": true, ".kml": true, ".kmz": true}

func ekDir() string { return filepath.Join(haritaDir(), "ek") }

// ekTurEsle: serbest yazılmış türü Heybe'nin tür koduna çevirir ("" = tanınmadı).
func ekTurEsle(s string) string {
	n := aramaNormal(s)
	if n == "" {
		return ""
	}
	soz := map[string]bool{}
	for _, w := range strings.FieldsFunc(n, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		soz[w] = true
	}
	icer := func(k ...string) bool {
		for _, x := range k {
			if strings.Contains(n, x) {
				return true
			}
		}
		return false
	}
	switch {
	case icer("toplanma", "assembly", "gathering", "muster"):
		return "toplanma"
	case icer("cadir", "barinma", "barinak", "konteyner", "shelter", "camp", "kamp"):
		return "barinak"
	case icer("hastane", "hospital"):
		return "hastane"
	case icer("eczane", "pharmacy"):
		return "eczane"
	case icer("saglik", "klinik", "clinic", "revir", "ilk yardim", "ilkyardim", "first aid", "medical"):
		return "saglik"
	case soz["su"] || soz["water"] || icer("icme suyu", "cesme", "drinking"):
		return "su"
	case icer("dagitim", "yardim", "gida", "erzak", "kumanya", "asevi", "distribution", "food", "aid"):
		return "dagitim"
	case icer("itfaiye", "fire"):
		return "itfaiye"
	case icer("polis", "jandarma", "police"):
		return "polis"
	}
	if t := yerTuruKod(n); t != "" {
		return t
	}
	return ""
}

// yalnız harita dizininin türleri: kurum listesinde ad olarak sık geçer ("Meydan", "Sokak"), tür kodu sayılmaz (12.11)
var yalnizDizinTuru = map[string]bool{"sokak": true, "meydan": true, "havalimani": true}

// yerTuruKod: zaten Heybe kodu yazılmışsa ("hastane", "toplanma" …) onu kabul et.
func yerTuruKod(n string) string {
	if _, ok := turAgirlik[n]; ok && !yalnizDizinTuru[n] {
		return n
	}
	return ""
}

// buyukHarfDuzelt: "ÇEŞME" → "Çeşme", "HALİL RIFATPAŞA Cd." → "Halil Rıfatpaşa Cd.". Harflerin çoğu (%70) büyükse
// büyük harfli sözcükler düzeltilir; karışık yazılmış metne dokunulmaz ("SGK Hastanesi" kalır). tr: dosya Türkçe (I→ı, İ→i).
// 09.11: Türkçe kararı kelimeye göre verilince "KIRIKHAN" "Kirikhan" oldu; karar dosyanın tamamına göre (ekOku).
func buyukHarfDuzelt(s string, tr bool) string {
	buyuk, kucuk := 0, 0
	for _, r := range s {
		if unicode.IsUpper(r) {
			buyuk++
		} else if unicode.IsLower(r) {
			kucuk++
		}
	}
	if buyuk == 0 || buyuk*10 < (buyuk+kucuk)*7 {
		return s
	}
	kucukKalsin := map[string]bool{"ve": true, "ile": true, "de": true, "da": true, "and": true, "of": true}
	w := strings.Fields(s)
	for i, k := range w {
		tumBuyuk := false
		for _, r := range k {
			if unicode.IsLower(r) {
				tumBuyuk = false
				break
			}
			if unicode.IsUpper(r) {
				tumBuyuk = true
			}
		}
		if !tumBuyuk {
			continue
		}
		if tr {
			k = strings.NewReplacer("I", "ı", "İ", "i").Replace(k)
		}
		k = strings.ToLower(k)
		if i > 0 && kucukKalsin[k] {
			w[i] = k
			continue
		}
		r, n := utf8.DecodeRuneInString(k)
		switch {
		case tr && r == 'i':
			w[i] = "İ" + k[n:]
		case tr && r == 'ı':
			w[i] = "I" + k[n:]
		default:
			w[i] = string(unicode.ToUpper(r)) + k[n:]
		}
	}
	return strings.Join(w, " ")
}

// sütun adları (aramaNormal + harf/rakam dışı atılmış hâli)
var ekSutun = map[string][]string{
	"lat":     {"enlem", "lat", "latitude", "y", "ycoord", "enlemy", "enlemderece", "koordinaty"},
	"lon":     {"boylam", "lon", "lng", "long", "longitude", "x", "xcoord", "boylamx", "boylamderece", "koordinatx"},
	"ad":      {"ad", "adi", "isim", "ismi", "name", "baslik", "title", "alanadi", "tesisadi", "noktaadi", "yeradi", "toplanmaalaniadi"},
	"tur":     {"tur", "turu", "tip", "tipi", "type", "kategori", "category", "cins", "cinsi", "nitelik", "amac"},
	"mahalle": {"mahalle", "mahalleadi", "mah", "neighbourhood", "neighborhood", "koy", "semt"},
	"ilce":    {"ilce", "ilceadi", "district", "county"},
	"il":      {"il", "iladi", "sehir", "city", "province"},
	"yol":     {"yol", "sokak", "cadde", "caddesokak", "yoladi", "adres", "address", "street"},
	"kapi":    {"kapino", "kapi", "kapinumarasi", "housenumber"},
}

func sutunAnahtar(s string) string {
	var b strings.Builder
	for _, r := range aramaNormal(strings.TrimPrefix(s, "\ufeff")) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// sutunBul: başlık satırında her anlamın sütun numarası (-1 = yok).
func sutunBul(baslik []string) map[string]int {
	yer := map[string]int{}
	for k := range ekSutun {
		yer[k] = -1
	}
	for i, h := range baslik {
		a := sutunAnahtar(h)
		for k, adlar := range ekSutun {
			if yer[k] >= 0 {
				continue
			}
			for _, x := range adlar {
				if a == x || ((k == "lat" || k == "lon") && len(x) > 3 && strings.HasPrefix(a, x)) {
					yer[k] = i
					break
				}
			}
		}
	}
	return yer
}

func koordOku(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	if !strings.Contains(s, ".") && strings.Count(s, ",") == 1 {
		s = strings.Replace(s, ",", ".", 1) // Türkçe Excel: 38,3597
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, false
	}
	return v, true
}

type ekKutu struct{ guney, bati, kuzey, dogu float64 }

func (k *ekKutu) icinde(lat, lon float64) bool {
	return k != nil && lat >= k.guney-1 && lat <= k.kuzey+1 && lon >= k.bati-1 && lon <= k.dogu+1
}

// ekToplayici: dosya türünden bağımsız; her satır/nesne buraya gelir.
type ekToplayici struct {
	liste     string
	dosyaTuru string // dosya adından çıkan tür
	kutu      *ekKutu
	noktalar  []ekNokta
	bozuk     int
	takas     int
	disarida  int
	derece    int // derece olmayan (UTM gibi) koordinat
	tanimsiz  map[string]int
	turSutunu bool
	sayfali   string // sayfalı kaynakta alınan/toplam
}

func (t *ekToplayici) ekle(lat, lon float64, latOk, lonOk bool, ad, tur, baglam string) {
	if len(t.noktalar) >= ekAzamiNokta {
		return
	}
	if !latOk || !lonOk {
		t.bozuk++
		return
	}
	if math.Abs(lat) > 90 || math.Abs(lon) > 180 {
		if math.Abs(lat) > 1000 || math.Abs(lon) > 1000 {
			t.derece++
			return
		}
		if math.Abs(lon) <= 90 && math.Abs(lat) <= 180 { // enlem/boylam yer değiştirmiş
			lat, lon = lon, lat
			t.takas++
		} else {
			t.bozuk++
			return
		}
	} else if t.kutu != nil && !t.kutu.icinde(lat, lon) && t.kutu.icinde(lon, lat) {
		lat, lon = lon, lat
		t.takas++
	}
	if t.kutu != nil && !t.kutu.icinde(lat, lon) {
		t.disarida++
	}
	ad = strings.TrimSpace(ad)
	kod := ""
	if tur != "" {
		kod = ekTurEsle(tur)
		if kod == "" {
			if t.tanimsiz == nil {
				t.tanimsiz = map[string]int{}
			}
			t.tanimsiz[strings.TrimSpace(tur)]++
		}
	}
	if kod == "" && !t.turSutunu {
		kod = ekTurEsle(ad)
	}
	if kod == "" {
		kod = t.dosyaTuru
	}
	if kod == "" {
		kod = "diger"
	}
	t.noktalar = append(t.noktalar, ekNokta{Tur: kod, Ad: ad, Baglam: baglam, Liste: t.liste,
		Lat: int32(math.Round(lat * 1e7)), Lon: int32(math.Round(lon * 1e7))})
}

func (t *ekToplayici) uyarilar() []string {
	var u []string
	if t.bozuk > 0 {
		u = append(u, fmt.Sprintf("bozuk-koordinat:%d", t.bozuk))
	}
	if t.derece > 0 {
		u = append(u, fmt.Sprintf("derece-degil:%d", t.derece))
	}
	if t.takas > 0 {
		u = append(u, fmt.Sprintf("enlem-boylam-takas:%d", t.takas))
	}
	if t.disarida > 0 {
		u = append(u, fmt.Sprintf("harita-disinda:%d", t.disarida))
	}
	if t.sayfali != "" {
		u = append(u, "sayfali:"+t.sayfali)
	}
	if len(t.tanimsiz) > 0 {
		var adlar []string
		for k := range t.tanimsiz {
			adlar = append(adlar, k)
		}
		sort.Strings(adlar)
		if len(adlar) > 5 {
			adlar = adlar[:5]
		}
		u = append(u, "taninmayan-tur:"+strings.Join(adlar, ", "))
	}
	diger := 0
	for _, n := range t.noktalar {
		if n.Tur == "diger" {
			diger++
		}
	}
	if diger > 0 {
		u = append(u, fmt.Sprintf("tur-yok:%d", diger))
	}
	return u
}

// tablodan: başlık + satırlar (CSV ya da Excel).
func (t *ekToplayici) tablodan(satirlar [][]string) error {
	bas := -1
	var s map[string]int
	for i := 0; i < len(satirlar) && i < 20; i++ { // başlık ilk satır olmayabilir (üstte bir başlık yazısı)
		s = sutunBul(satirlar[i])
		if s["lat"] >= 0 && s["lon"] >= 0 {
			bas = i
			break
		}
	}
	if bas < 0 {
		return errors.New("enlem-boylam-yok")
	}
	t.turSutunu = s["tur"] >= 0
	al := func(r []string, k string) string {
		if i := s[k]; i >= 0 && i < len(r) {
			return strings.TrimSpace(r[i])
		}
		return ""
	}
	for _, r := range satirlar[bas+1:] {
		bos := true
		for _, h := range r {
			if strings.TrimSpace(h) != "" {
				bos = false
				break
			}
		}
		if bos {
			continue
		}
		lat, ok1 := koordOku(al(r, "lat"))
		lon, ok2 := koordOku(al(r, "lon"))
		yol := al(r, "yol")
		if k := al(r, "kapi"); k != "" && yol != "" {
			yol += " " + k
		}
		var parca []string
		for _, p := range []string{yol, al(r, "mahalle"), al(r, "ilce"), al(r, "il")} {
			if p != "" && (len(parca) == 0 || parca[len(parca)-1] != p) {
				parca = append(parca, p)
			}
		}
		t.ekle(lat, lon, ok1, ok2, al(r, "ad"), al(r, "tur"), strings.Join(parca, ", "))
	}
	return nil
}

// cp1254: eski Türkçe Excel CSV'si UTF-8 değil Windows-1254 kaydeder.
var cp1254 = [128]rune{
	'€', '\u0081', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u008d', '\u008e', '\u008f',
	'\u0090', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u009d', '\u009e', 'Ÿ',
	'\u00a0', '¡', '¢', '£', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '\u00ad', '®', '¯',
	'°', '±', '²', '³', '´', 'µ', '¶', '·', '¸', '¹', 'º', '»', '¼', '½', '¾', '¿',
	'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï',
	'Ğ', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', '×', 'Ø', 'Ù', 'Ú', 'Û', 'Ü', 'İ', 'Ş', 'ß',
	'à', 'á', 'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï',
	'ğ', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', '÷', 'ø', 'ù', 'ú', 'û', 'ü', 'ı', 'ş', 'ÿ',
}

func metneCevir(b []byte) string {
	b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
	if utf8.Valid(b) {
		return string(b)
	}
	var s strings.Builder
	for _, c := range b {
		if c < 0x80 {
			s.WriteByte(c)
		} else {
			s.WriteRune(cp1254[c-0x80])
		}
	}
	return s.String()
}

func csvOku(t *ekToplayici, b []byte) error {
	metin := metneCevir(b)
	ilk := metin
	if i := strings.IndexByte(metin, '\n'); i >= 0 {
		ilk = metin[:i]
	}
	ayrac, enCok := ',', -1
	for _, a := range []rune{';', ',', '\t', '|'} {
		if n := strings.Count(ilk, string(a)); n > enCok {
			ayrac, enCok = a, n
		}
	}
	r := csv.NewReader(strings.NewReader(metin))
	r.Comma = ayrac
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	satirlar, err := r.ReadAll()
	if err != nil {
		return errors.New("okunamadi")
	}
	return t.tablodan(satirlar)
}

func zipDosya(z *zip.Reader, ad string) ([]byte, error) {
	for _, f := range z.File {
		if f.Name == ad {
			if f.UncompressedSize64 > 200<<20 {
				return nil, errors.New("cok-buyuk")
			}
			r, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer r.Close()
			return io.ReadAll(io.LimitReader(r, 200<<20))
		}
	}
	return nil, os.ErrNotExist
}

func sutunNo(ref string) int {
	n := 0
	for _, r := range ref {
		if r < 'A' || r > 'Z' {
			break
		}
		n = n*26 + int(r-'A'+1)
	}
	return n - 1
}

func xlsxOku(t *ekToplayici, b []byte) error {
	z, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return errors.New("okunamadi")
	}
	var ortak []string
	if sb, err := zipDosya(z, "xl/sharedStrings.xml"); err == nil {
		var sst struct {
			SI []struct {
				T string `xml:"t"`
				R []struct {
					T string `xml:"t"`
				} `xml:"r"`
			} `xml:"si"`
		}
		if xml.Unmarshal(sb, &sst) == nil {
			for _, si := range sst.SI {
				s := si.T
				for _, r := range si.R {
					s += r.T
				}
				ortak = append(ortak, s)
			}
		}
	}
	sayfa := "xl/worksheets/sheet1.xml"
	if _, err := zipDosya(z, sayfa); err != nil {
		sayfa = ""
		for _, f := range z.File {
			if strings.HasPrefix(f.Name, "xl/worksheets/") && strings.HasSuffix(f.Name, ".xml") {
				sayfa = f.Name
				break
			}
		}
	}
	sb, err := zipDosya(z, sayfa)
	if err != nil {
		return errors.New("sayfa-yok")
	}
	d := xml.NewDecoder(bytes.NewReader(sb))
	var satirlar [][]string
	for {
		tok, err := d.Token()
		if err != nil {
			break
		}
		bas, ok := tok.(xml.StartElement)
		if !ok || bas.Name.Local != "row" {
			continue
		}
		var row struct {
			C []struct {
				R  string `xml:"r,attr"`
				T  string `xml:"t,attr"`
				V  string `xml:"v"`
				Is struct {
					T string `xml:"t"`
					R []struct {
						T string `xml:"t"`
					} `xml:"r"`
				} `xml:"is"`
			} `xml:"c"`
		}
		if d.DecodeElement(&row, &bas) != nil {
			continue
		}
		var satir []string
		for i, c := range row.C {
			k := i
			if c.R != "" {
				k = sutunNo(c.R)
			}
			if k < 0 || k > 500 {
				continue
			}
			for len(satir) <= k {
				satir = append(satir, "")
			}
			deger := c.V
			switch c.T {
			case "s":
				if n, err := strconv.Atoi(c.V); err == nil && n >= 0 && n < len(ortak) {
					deger = ortak[n]
				}
			case "inlineStr":
				deger = c.Is.T
				for _, r := range c.Is.R {
					deger += r.T
				}
			}
			satir[k] = deger
		}
		satirlar = append(satirlar, satir)
	}
	return t.tablodan(satirlar)
}

func ozellikMetni(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case json.Number:
		return x.String()
	}
	return ""
}

// ozellikten: GeoJSON/KML özelliklerini sütun gibi oku.
func (t *ekToplayici) ozellikten(lat, lon float64, oz map[string]string, yedekAd string) {
	ad, tur := "", ""
	var mah, ilce, il, yol string
	for k, v := range oz {
		a := sutunAnahtar(k)
		for anlam, adlar := range ekSutun {
			for _, x := range adlar {
				if a != x {
					continue
				}
				switch anlam {
				case "ad":
					if ad == "" {
						ad = v
					}
				case "tur":
					if tur == "" {
						tur = v
					}
				case "mahalle":
					mah = v
				case "ilce":
					ilce = v
				case "il":
					il = v
				case "yol":
					yol = v
				}
			}
		}
		if (a == "amenity" || a == "emergency" || a == "socialfacility") && tur == "" {
			tur = v
		}
	}
	if ad == "" {
		ad = yedekAd
	}
	if tur != "" {
		t.turSutunu = true
	}
	var parca []string
	for _, p := range []string{yol, mah, ilce, il} {
		if strings.TrimSpace(p) != "" {
			parca = append(parca, strings.TrimSpace(p))
		}
	}
	t.ekle(lat, lon, true, true, ad, tur, strings.Join(parca, ", "))
}

func geoMerkez(g map[string]any) (float64, float64, bool) {
	var toplaLat, toplaLon float64
	n := 0
	var gez func(v any)
	gez = func(v any) {
		dizi, ok := v.([]any)
		if !ok {
			return
		}
		if len(dizi) >= 2 {
			lo, ok1 := dizi[0].(float64)
			la, ok2 := dizi[1].(float64)
			if ok1 && ok2 {
				toplaLat += la
				toplaLon += lo
				n++
				return
			}
		}
		for _, x := range dizi {
			gez(x)
		}
	}
	gez(g["coordinates"])
	if n == 0 {
		return 0, 0, false
	}
	return toplaLat / float64(n), toplaLon / float64(n), true
}

func geojsonOku(t *ekToplayici, b []byte) error {
	var fc struct {
		Features []struct {
			Geometry   map[string]any `json:"geometry"`
			Properties map[string]any `json:"properties"`
		} `json:"features"`
	}
	b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
	if err := json.Unmarshal(b, &fc); err != nil || len(fc.Features) == 0 {
		return jsonTabloOku(t, b) // GeoJSON değilse: nesne dizisi (ör. belediyelerin açık veri adresleri)
	}
	for _, f := range fc.Features {
		la, lo, ok := geoMerkez(f.Geometry)
		if !ok {
			t.bozuk++
			continue
		}
		oz := map[string]string{}
		for k, v := range f.Properties {
			if s := ozellikMetni(v); s != "" {
				oz[k] = s
			}
		}
		t.ozellikten(la, lo, oz, "")
	}
	return nil
}

// jsonTabloOku: [{"ADI":…,"ENLEM":…}, …] ya da {"…":[{…}]} biçimi; anahtarlar sütun adı sayılır.
// Sayfalı adreslerde (İzmir açık veri adresi 10'ar kayıt verir) toplam sayı alınandan büyükse uyarılır.
func jsonTabloOku(t *ekToplayici, b []byte) error {
	var kok any
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if d.Decode(&kok) != nil {
		return errors.New("okunamadi")
	}
	var dizi []any
	toplam := 0.0
	switch x := kok.(type) {
	case []any:
		dizi = x
	case map[string]any:
		for k, v := range x {
			if a, ok := v.([]any); ok && len(a) > 0 {
				if _, nesne := a[0].(map[string]any); nesne && len(a) > len(dizi) {
					dizi = a
				}
			}
			ak := sutunAnahtar(k)
			if n, ok := v.(json.Number); ok && (strings.Contains(ak, "kayit") || strings.Contains(ak, "total") || strings.Contains(ak, "count")) {
				if f, err := n.Float64(); err == nil && f > toplam {
					toplam = f
				}
			}
		}
	}
	if len(dizi) == 0 {
		return errors.New("enlem-boylam-yok")
	}
	var baslik []string
	sira := map[string]int{}
	for _, o := range dizi {
		if m, ok := o.(map[string]any); ok {
			for k := range m {
				if _, var_ := sira[k]; !var_ {
					sira[k] = len(baslik)
					baslik = append(baslik, k)
				}
			}
		}
	}
	satirlar := [][]string{baslik}
	for _, o := range dizi {
		m, ok := o.(map[string]any)
		if !ok {
			continue
		}
		r := make([]string, len(baslik))
		for k, v := range m {
			r[sira[k]] = ozellikMetni(v)
		}
		satirlar = append(satirlar, r)
	}
	if toplam > float64(len(dizi)) {
		t.sayfali = fmt.Sprintf("%d/%.0f", len(dizi), toplam)
	}
	return t.tablodan(satirlar)
}

func kmlOku(t *ekToplayici, b []byte) error {
	d := xml.NewDecoder(bytes.NewReader(b))
	d.Strict = false
	bulundu := 0
	for {
		tok, err := d.Token()
		if err != nil {
			break
		}
		bas, ok := tok.(xml.StartElement)
		if !ok || bas.Name.Local != "Placemark" {
			continue
		}
		var p struct {
			Name string `xml:"name"`
			Desc string `xml:"description"`
			Data []struct {
				Name  string `xml:"name,attr"`
				Value string `xml:"value"`
			} `xml:"ExtendedData>Data"`
			Simple []struct {
				Name  string `xml:"name,attr"`
				Value string `xml:",chardata"`
			} `xml:"ExtendedData>SchemaData>SimpleData"`
			Nokta  []string `xml:"Point>coordinates"`
			Alan   []string `xml:"Polygon>outerBoundaryIs>LinearRing>coordinates"`
			CNokta []string `xml:"MultiGeometry>Point>coordinates"`
			CAlan  []string `xml:"MultiGeometry>Polygon>outerBoundaryIs>LinearRing>coordinates"`
		}
		if d.DecodeElement(&p, &bas) != nil {
			t.bozuk++
			continue
		}
		bulundu++
		var koord string
		for _, k := range [][]string{p.Nokta, p.CNokta, p.Alan, p.CAlan} {
			if len(k) > 0 {
				koord = k[0]
				break
			}
		}
		var tLat, tLon float64
		n := 0
		for _, ucluk := range strings.Fields(koord) {
			c := strings.Split(ucluk, ",")
			if len(c) < 2 {
				continue
			}
			lo, e1 := strconv.ParseFloat(c[0], 64)
			la, e2 := strconv.ParseFloat(c[1], 64)
			if e1 == nil && e2 == nil {
				tLat += la
				tLon += lo
				n++
			}
		}
		if n == 0 {
			t.bozuk++
			continue
		}
		oz := map[string]string{}
		for _, x := range p.Data {
			oz[x.Name] = x.Value
		}
		for _, x := range p.Simple {
			oz[x.Name] = x.Value
		}
		if oz["name"] == "" && p.Name != "" {
			oz["name"] = p.Name
		}
		t.ozellikten(tLat/float64(n), tLon/float64(n), oz, p.Name)
	}
	if bulundu == 0 {
		return errors.New("enlem-boylam-yok")
	}
	return nil
}

// ekOku: tek dosyayı okur. kutu: haritanın sınırları (enlem/boylam yer değiştirmişse anlamak için), nil olabilir.
func ekOku(dosya string, b []byte, kutu *ekKutu) ([]ekNokta, ekListe, error) {
	uz := strings.ToLower(filepath.Ext(dosya))
	liste := strings.TrimSuffix(filepath.Base(dosya), filepath.Ext(dosya))
	t := &ekToplayici{liste: strings.ReplaceAll(strings.ReplaceAll(liste, "_", " "), "-", " "), kutu: kutu}
	t.dosyaTuru = ekTurEsle(t.liste)
	var err error
	switch uz {
	case ".csv", ".txt", ".tsv":
		err = csvOku(t, b)
	case ".xlsx":
		err = xlsxOku(t, b)
	case ".geojson", ".json":
		err = geojsonOku(t, b)
	case ".kml":
		err = kmlOku(t, b)
	case ".kmz":
		z, zerr := zip.NewReader(bytes.NewReader(b), int64(len(b)))
		if zerr != nil {
			return nil, ekListe{Dosya: dosya}, errors.New("okunamadi")
		}
		var kml []byte
		for _, f := range z.File {
			if strings.HasSuffix(strings.ToLower(f.Name), ".kml") {
				kml, err = zipDosya(z, f.Name)
				break
			}
		}
		if kml == nil {
			return nil, ekListe{Dosya: dosya}, errors.New("okunamadi")
		}
		err = kmlOku(t, kml)
	default:
		return nil, ekListe{Dosya: dosya}, errors.New("bicim")
	}
	// Büyük harfle yazılmış adlar ve yerler düzeltilir; Türkçe kuralı dosyada ı/İ/ş/ğ varsa.
	tr := false
	for _, n := range t.noktalar {
		if strings.ContainsAny(n.Ad+n.Baglam, "ıİşŞğĞ") {
			tr = true
			break
		}
	}
	for i := range t.noktalar {
		n := &t.noktalar[i]
		n.Ad = buyukHarfDuzelt(n.Ad, tr)
		parca := strings.Split(n.Baglam, ", ")
		for k := range parca {
			parca[k] = buyukHarfDuzelt(parca[k], tr)
		}
		n.Baglam = strings.Join(parca, ", ")
	}
	ozet := ekListe{Dosya: dosya, Nokta: len(t.noktalar), Turler: map[string]int{}, Uyarilar: t.uyarilar()}
	for _, n := range t.noktalar {
		ozet.Turler[n.Tur]++
	}
	if err != nil {
		return nil, ozet, err
	}
	if len(t.noktalar) == 0 {
		if t.derece > 0 {
			return nil, ozet, errors.New("derece-degil")
		}
		return nil, ozet, errors.New("nokta-yok")
	}
	return t.noktalar, ozet, nil
}

// Bellekte: harita/ek/ klasörünün okunmuş hâli; dosyalar değişince yeniden okunur.
var ekBellek struct {
	mu       sync.Mutex
	imza     string
	noktalar []ekNokta
	listeler []ekListe
}

func haritaKutusu() *ekKutu {
	ad := haritaBul()
	if ad == "" {
		return nil
	}
	oz, err := rotaOzetOku(filepath.Join(haritaDir(), ad+".rota"))
	if err != nil {
		return nil
	}
	return &ekKutu{oz.EnKucukLat, oz.EnKucukLon, oz.EnBuyukLat, oz.EnBuyukLon}
}

func ekDosyalari() []os.DirEntry {
	gir, _ := os.ReadDir(ekDir())
	var out []os.DirEntry
	for _, g := range gir {
		if !g.IsDir() && !strings.HasPrefix(g.Name(), ".") && ekUzanti[strings.ToLower(filepath.Ext(g.Name()))] {
			out = append(out, g)
		}
	}
	return out
}

func ekNoktalar() ([]ekNokta, []ekListe) {
	gir := ekDosyalari()
	var imza strings.Builder
	imza.WriteString(ekDir() + "\n") // başka bir kökün aynı adlı dosyası karışmasın
	for _, g := range gir {
		if bilgi, err := g.Info(); err == nil {
			fmt.Fprintf(&imza, "%s|%d|%d\n", g.Name(), bilgi.Size(), bilgi.ModTime().UnixNano())
		}
	}
	ekBellek.mu.Lock()
	defer ekBellek.mu.Unlock()
	if ekBellek.imza == imza.String() && (ekBellek.noktalar != nil || len(gir) == 0) {
		return ekBellek.noktalar, ekBellek.listeler
	}
	kutu := haritaKutusu()
	var hepsi []ekNokta
	listeler := []ekListe{}
	for _, g := range gir {
		b, err := os.ReadFile(filepath.Join(ekDir(), g.Name()))
		if err != nil || len(b) > ekAzamiBoy {
			listeler = append(listeler, ekListe{Dosya: g.Name(), Uyarilar: []string{"okunamadi"}})
			continue
		}
		n, oz, err := ekOku(g.Name(), b, kutu)
		if err != nil {
			oz.Uyarilar = append(oz.Uyarilar, err.Error())
		}
		listeler = append(listeler, oz)
		hepsi = append(hepsi, n...)
	}
	if hepsi == nil {
		hepsi = []ekNokta{}
	}
	ekBellek.imza, ekBellek.noktalar, ekBellek.listeler = imza.String(), hepsi, listeler
	return hepsi, listeler
}

func ekSonuc(n ekNokta) yerSonuc {
	return yerSonuc{Tur: n.Tur, Ad: n.Ad, Baglam: n.Baglam, Liste: n.Liste, Lat: float64(n.Lat) / 1e7, Lon: float64(n.Lon) / 1e7}
}

// ekYakin: kurum listelerinden bir türün en yakınları (türün yürünebilir sınırı içinde).
func ekYakin(tur string, lat, lon float64, n int) []yerSonuc {
	noktalar, _ := ekNoktalar()
	a0, o0 := int32(math.Round(lat*1e7)), int32(math.Round(lon*1e7))
	sinir := turSiniri(tur)
	var out []yerSonuc
	for _, p := range noktalar {
		if p.Tur != tur {
			continue
		}
		if d := mesafeE7(a0, o0, p.Lat, p.Lon); d <= sinir {
			y := ekSonuc(p)
			y.M = math.Round(d)
			out = append(out, y)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].M < out[j].M })
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// ekAra: kurum listelerinde ad araması (her sözcük bir sözcüğün başı); kurum kaydı biraz öne çıkar.
func ekAra(q string, lat, lon float64, konumVar bool) []yerSonuc {
	sozcukler := strings.Fields(aramaNormal(q))
	if len(sozcukler) == 0 {
		return nil
	}
	noktalar, _ := ekNoktalar()
	a0, o0 := int32(math.Round(lat*1e7)), int32(math.Round(lon*1e7))
	var out []yerSonuc
	for _, p := range noktalar {
		norm := " " + aramaNormal(p.Ad+" "+p.Baglam+" "+p.Liste)
		uydu := true
		for _, s := range sozcukler {
			if !strings.Contains(norm, " "+s) {
				uydu = false
				break
			}
		}
		if !uydu {
			continue
		}
		y := ekSonuc(p)
		y.puan = turAgirlik[p.Tur] + 10
		if konumVar {
			y.M = math.Round(mesafeE7(a0, o0, p.Lat, p.Lon))
			y.puan -= 12 * math.Log10(1+y.M/1000)
		}
		out = append(out, y)
	}
	return out
}

// Kapılar
func apiHaritaEk(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		_, listeler := ekNoktalar()
		jsonYaz(w, 200, map[string]any{"listeler": listeler})
	case http.MethodPost:
		ham := r.URL.Query().Get("ad")
		ad := filepath.Base(ham)
		uz := strings.ToLower(filepath.Ext(ad))
		if ad != ham || strings.HasPrefix(ad, ".") || !ekUzanti[uz] || strings.ContainsAny(ad, "\\/:*?\"<>|") {
			jsonYaz(w, 400, map[string]string{"hata": "bicim"})
			return
		}
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, ekAzamiBoy))
		if err != nil {
			jsonYaz(w, 413, map[string]string{"hata": "cok-buyuk"})
			return
		}
		_, oz, err := ekOku(ad, b, haritaKutusu())
		if err != nil {
			jsonYaz(w, 422, map[string]any{"hata": err.Error(), "ozet": oz})
			return
		}
		if err := ekYaz(ad, b); err != nil {
			jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
			return
		}
		jsonYaz(w, 200, oz)
	default:
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
	}
}

func apiHaritaEkSil(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	var g struct {
		Dosya string `json:"dosya"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&g) != nil {
		jsonYaz(w, 400, map[string]string{"hata": "istek"})
		return
	}
	ad := filepath.Base(g.Dosya)
	if ad != g.Dosya || strings.HasPrefix(ad, ".") || !ekUzanti[strings.ToLower(filepath.Ext(ad))] {
		jsonYaz(w, 400, map[string]string{"hata": "dosya"})
		return
	}
	if err := os.Remove(filepath.Join(ekDir(), ad)); err != nil {
		jsonYaz(w, 404, map[string]string{"hata": "yok"})
		return
	}
	os.Remove(filepath.Join(ekDir(), "._"+ad)) // exFAT'ta macOS'un eşlik dosyası
	jsonYaz(w, 200, map[string]bool{"tamam": true})
}

// apiHaritaEkGeo: kurum noktaları haritada gösterilsin diye GeoJSON.
func apiHaritaEkGeo(w http.ResponseWriter, r *http.Request) {
	noktalar, _ := ekNoktalar()
	type ozellik struct {
		Tur    string `json:"tur"`
		Ad     string `json:"ad"`
		Baglam string `json:"baglam"`
		Liste  string `json:"liste"`
	}
	type oge struct {
		Type     string         `json:"type"`
		Geometry map[string]any `json:"geometry"`
		Ozellik  ozellik        `json:"properties"`
	}
	ogeler := make([]oge, 0, len(noktalar))
	for _, n := range noktalar {
		ogeler = append(ogeler, oge{"Feature", map[string]any{"type": "Point", "coordinates": []float64{float64(n.Lon) / 1e7, float64(n.Lat) / 1e7}},
			ozellik{n.Tur, n.Ad, n.Baglam, n.Liste}})
	}
	jsonYaz(w, 200, map[string]any{"type": "FeatureCollection", "features": ogeler})
}

// apiHaritaEkBag: kurumun listesini bir bağlantıdan indir (internet varken). Önce okunur; okunamıyorsa kaydedilmez.
// Bağlantı kullanıcının yapıştırdığıdır; Heybe kendiliğinden hiçbir yere gitmez.
func apiHaritaEkBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	var g struct {
		Adres string `json:"adres"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&g) != nil {
		jsonYaz(w, 400, map[string]string{"hata": "istek"})
		return
	}
	u, err := url.Parse(strings.TrimSpace(g.Adres))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		jsonYaz(w, 400, map[string]string{"hata": "adres"})
		return
	}
	istemci := &http.Client{Timeout: 90 * time.Second}
	ist, _ := http.NewRequestWithContext(r.Context(), "GET", u.String(), nil)
	ist.Header.Set("User-Agent", "CLE-Heybe")
	y, err := istemci.Do(ist)
	if err != nil {
		jsonYaz(w, 502, map[string]string{"hata": "baglanti"})
		return
	}
	defer y.Body.Close()
	if y.StatusCode != 200 {
		jsonYaz(w, 502, map[string]string{"hata": "baglanti"})
		return
	}
	b, err := io.ReadAll(io.LimitReader(y.Body, ekAzamiBoy+1))
	if err != nil {
		jsonYaz(w, 502, map[string]string{"hata": "baglanti"})
		return
	}
	if len(b) > ekAzamiBoy {
		jsonYaz(w, 413, map[string]string{"hata": "cok-buyuk"})
		return
	}
	ad := ekBagDosyaAdi(u, y.Header, b)
	_, oz, err := ekOku(ad, b, haritaKutusu())
	if err != nil {
		jsonYaz(w, 422, map[string]any{"hata": err.Error(), "ozet": oz})
		return
	}
	if err := ekYaz(ad, b); err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	jsonYaz(w, 200, oz)
}

// ekBagDosyaAdi: bağlantıdan dosya adı; uzantı yoksa içerik türünden ya da içeriğin kendisinden.
func ekBagDosyaAdi(u *url.URL, h http.Header, b []byte) string {
	ad := ""
	if _, p, err := mime.ParseMediaType(h.Get("Content-Disposition")); err == nil && p["filename"] != "" {
		ad = filepath.Base(p["filename"])
	}
	if ad == "" {
		ad = filepath.Base(u.Path)
	}
	ad = strings.Map(func(r rune) rune {
		if strings.ContainsRune("\\/:*?\"<>|", r) || r < 32 {
			return '_'
		}
		return r
	}, strings.TrimLeft(ad, "."))
	if ad == "" || ad == "_" {
		ad = u.Host
	}
	if ekUzanti[strings.ToLower(filepath.Ext(ad))] {
		return ad
	}
	tur := strings.ToLower(h.Get("Content-Type"))
	bas := bytes.TrimSpace(bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")))
	switch {
	case strings.Contains(tur, "kml"):
		return ad + ".kml"
	case strings.Contains(tur, "spreadsheet") || bytes.HasPrefix(b, []byte("PK")):
		if bytes.Contains(b[:min(len(b), 4096)], []byte("xl/")) {
			return ad + ".xlsx"
		}
		return ad + ".kmz"
	case strings.Contains(tur, "json") || bytes.HasPrefix(bas, []byte("{")) || bytes.HasPrefix(bas, []byte("[")):
		return ad + ".json"
	case bytes.HasPrefix(bas, []byte("<")):
		return ad + ".kml"
	}
	return ad + ".csv"
}

func ekYaz(ad string, b []byte) error {
	if err := os.MkdirAll(ekDir(), 0o755); err != nil {
		return err
	}
	hedef := filepath.Join(ekDir(), ad)
	if err := os.WriteFile(hedef+".part", b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(hedef+".part", hedef); err != nil {
		os.Remove(hedef + ".part")
		return err
	}
	return nil
}

// apiHaritaEkNokta: kullanıcı kendi noktasını haritada işaretler (ör. e-Devlet'ten öğrendiği toplanma alanı).
// "Benim noktalarım.csv" listesine eklenir; liste öteki kurum listeleri gibi görünür ve kaldırılabilir.
const benimListe = "Benim noktalarım.csv"

func apiHaritaEkNokta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	var g struct {
		Tur string  `json:"tur"`
		Ad  string  `json:"ad"`
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&g) != nil || math.Abs(g.Lat) > 90 || math.Abs(g.Lon) > 180 ||
		(g.Lat == 0 && g.Lon == 0) {
		jsonYaz(w, 400, map[string]string{"hata": "istek"})
		return
	}
	if _, ok := turAgirlik[g.Tur]; !ok || yalnizDizinTuru[g.Tur] { // kural tek yerde (yerTuruKod ile aynı)
		g.Tur = "diger"
	}
	g.Ad = strings.TrimSpace(strings.NewReplacer("\n", " ", "\r", " ").Replace(g.Ad))
	if len(g.Ad) > 200 {
		g.Ad = g.Ad[:200]
	}
	yol := filepath.Join(ekDir(), benimListe)
	eski, err := os.ReadFile(yol)
	if err != nil {
		eski = []byte("ad,tür,enlem,boylam\n")
	}
	var buf bytes.Buffer
	buf.Write(eski)
	cw := csv.NewWriter(&buf)
	cw.Write([]string{g.Ad, g.Tur, strconv.FormatFloat(g.Lat, 'f', 6, 64), strconv.FormatFloat(g.Lon, 'f', 6, 64)})
	cw.Flush()
	if err := ekYaz(benimListe, buf.Bytes()); err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	jsonYaz(w, 200, map[string]bool{"tamam": true})
}

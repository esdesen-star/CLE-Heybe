package main

// Çevrim dışı rota (09.11.2026, harita 8i): .rota dosyası üzerinde A* araması.
// Rotayı algoritma hesaplar, doğrulanabilir; dil modeli rota uydurmaz.
// Bellekte: köşeler, komşuluk, parçalar ve ara noktalar (Türkiye ~700 MB, 09.11 ölçümü).
// 09.11: ara noktalar önce diskte bırakılmıştı; harici diskte (exFAT) parça parça okuma bir rotayı 14 sn'ye çıkardı.
// Artık dosya açılışta tek seferde okunur: açılış birkaç saniye, sonra her rota milisaniyeler.

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strings"
	"sync"
)

type rotaAg struct {
	Ozet     hazirlikOzet
	vLat     []int32
	vLon     []int32
	hucreler []int64
	hucreBas []uint32
	derece   []uint32
	komsu    []uint32
	sA, sB   []uint32
	sUz      []float32
	sBayrak  []uint8
	sHiz     []uint8
	sSinif   []uint8
	sAd      []uint32
	adlar    []string
	gOff     []uint32
	gLat     []int32
	gLon     []int32

	mu      sync.Mutex
	maliyet []float32
	onceki  []uint32
	nesil   []uint32
	n       uint32
}

type sayacOkuyucu struct {
	r io.Reader
	n int64
}

func (s *sayacOkuyucu) Read(p []byte) (int, error) {
	k, err := s.r.Read(p)
	s.n += int64(k)
	return k, err
}

// rotaOzetOku: yalnız başlık (tarih, sınırlar). Sayfa haritayı hemen açsın, yol ağı arka planda yüklensin (09.11).
func rotaOzetOku(yol string) (hazirlikOzet, error) {
	var oz hazirlikOzet
	f, err := os.Open(yol)
	if err != nil {
		return oz, err
	}
	defer f.Close()
	b := make([]byte, len(rotaSihir)+4)
	if _, err := io.ReadFull(f, b); err != nil || string(b[:len(rotaSihir)]) != rotaSihir {
		return oz, errors.New("rota dosyası tanınmadı")
	}
	n := binary.LittleEndian.Uint32(b[len(rotaSihir):])
	if n > 1<<20 {
		return oz, errors.New("rota başlığı bozuk")
	}
	bj := make([]byte, n)
	if _, err := io.ReadFull(f, bj); err != nil {
		return oz, err
	}
	return oz, json.Unmarshal(bj, &oz)
}

func rotaAc(yol string) (*rotaAg, error) {
	f, err := os.Open(yol)
	if err != nil {
		return nil, err
	}
	sr := &sayacOkuyucu{r: bufio.NewReaderSize(f, 4<<20)}
	sihir := make([]byte, len(rotaSihir))
	if _, err := io.ReadFull(sr, sihir); err != nil || string(sihir) != rotaSihir {
		f.Close()
		return nil, errors.New("rota dosyası tanınmadı")
	}
	var bj uint32
	if err := binary.Read(sr, binary.LittleEndian, &bj); err != nil || bj > 1<<20 {
		f.Close()
		return nil, errors.New("rota başlığı bozuk")
	}
	b := make([]byte, bj)
	if _, err := io.ReadFull(sr, b); err != nil {
		f.Close()
		return nil, err
	}
	defer f.Close()
	ag := &rotaAg{}
	if err := json.Unmarshal(b, &ag.Ozet); err != nil {
		return nil, err
	}
	sayilar := make([]uint64, 6)
	if err := binary.Read(sr, binary.LittleEndian, sayilar); err != nil {
		return nil, err
	}
	V, H, K, S, A, G := sayilar[0], sayilar[1], sayilar[2], sayilar[3], sayilar[4], sayilar[5]
	if V > 1<<31 || S > 1<<30 || K > 1<<31 || G > 1<<31 || A > 1<<31 || H > 1<<31 {
		return nil, errors.New("rota sayıları akıl dışı")
	}
	ag.vLat, ag.vLon = make([]int32, V), make([]int32, V)
	ag.hucreler, ag.hucreBas = make([]int64, H), make([]uint32, H+1)
	ag.derece, ag.komsu = make([]uint32, V+1), make([]uint32, K)
	ag.sA, ag.sB, ag.sUz = make([]uint32, S), make([]uint32, S), make([]float32, S)
	ag.sBayrak, ag.sHiz, ag.sSinif, ag.sAd = make([]uint8, S), make([]uint8, S), make([]uint8, S), make([]uint32, S)
	adBlob := make([]byte, A)
	ag.gOff = make([]uint32, S+1)
	for _, d := range []any{ag.vLat, ag.vLon, ag.hucreler, ag.hucreBas, ag.derece, ag.komsu, ag.sA, ag.sB, ag.sUz, ag.sBayrak, ag.sHiz, ag.sSinif, ag.sAd, adBlob, ag.gOff} {
		if err := binary.Read(sr, binary.LittleEndian, d); err != nil {
			return nil, fmt.Errorf("rota dosyası eksik: %w", err)
		}
	}
	ag.adlar = strings.Split(string(adBlob), "\x00")
	if st, err := f.Stat(); err != nil || st.Size() != sr.n+int64(G)*8 {
		return nil, errors.New("rota dosyasının boyu tutmuyor (yarım kopyalanmış olabilir)")
	}
	if uint64(ag.gOff[S]) != G || uint64(ag.derece[V]) != K {
		return nil, errors.New("rota dosyası iç tutarlılık denetiminden geçmedi")
	}
	ag.gLat, ag.gLon = make([]int32, G), make([]int32, G)
	if err := binary.Read(sr, binary.LittleEndian, ag.gLat); err != nil {
		return nil, fmt.Errorf("rota dosyası eksik: %w", err)
	}
	if err := binary.Read(sr, binary.LittleEndian, ag.gLon); err != nil {
		return nil, fmt.Errorf("rota dosyası eksik: %w", err)
	}
	return ag, nil
}

// Kapat: dosya açılışta okunup kapandı; bellek çöp toplayıcıya kalır. (Eski çağrılar bozulmasın diye duruyor.)
func (ag *rotaAg) Kapat() {}

const (
	yayaHiz   = 1.3       // m/sn (~4,7 km/s): enkaz ve kalabalıkta gerçekçi
	yayaAzami = 20 / 3.6  // A* üst sınırı yaya için: vapur yürüyüşten hızlı
	aracAzami = 130 / 3.6 // A* için üst sınır
)

// gecer: komşuluk girdisi (parça<<1 | yön) bu kipte kullanılabilir mi.
func (ag *rotaAg) gecer(e uint32, arac bool) bool {
	b := ag.sBayrak[e>>1]
	if !arac {
		return b&bitYaya != 0
	}
	if e&1 == 0 {
		return b&bitAracIleri != 0
	}
	return b&bitAracGeri != 0
}

func (ag *rotaAg) parcaSure(s uint32, arac bool) float32 {
	if !arac && ag.sSinif[s] != sinifVapur {
		return ag.sUz[s] / yayaHiz
	}
	h := float32(ag.sHiz[s])
	if h < 5 {
		h = 5
	}
	if ag.sSinif[s] != sinifVapur {
		h *= 0.8 // ortalama hız, sınırın altında: kavşak, ışık, yavaşlama (Ankara–İstanbul ≈ 4,5 sa ile tutarlı)
	}
	return ag.sUz[s] / (h / 3.6)
}

// yakinKose: verilen noktaya en yakın, bu kipte kullanılabilir köşe ve uzaklığı (m).
func (ag *rotaAg) yakinKose(lat, lon int32, arac bool, cikis bool) (int, float64) {
	cla := int64(math.Floor(float64(lat) / 1e7 * hucreOlcek))
	clo := int64(math.Floor(float64(lon) / 1e7 * hucreOlcek))
	en, enK := math.MaxFloat64, -1
	kullan := func(v int) bool {
		for i := ag.derece[v]; i < ag.derece[v+1]; i++ {
			e := ag.komsu[i]
			if cikis && ag.gecer(e, arac) {
				return true
			}
			if !cikis && ag.gecer(e^1, arac) { // varış: bu köşeye giren yön
				return true
			}
		}
		return false
	}
	bulunduHalka := -1
	for r := int64(0); r <= 40; r++ {
		for dy := -r; dy <= r; dy++ {
			for dx := -r; dx <= r; dx++ {
				if dy != -r && dy != r && dx != -r && dx != r {
					continue // yalnız halkanın kenarı
				}
				anahtar := (cla+dy+9000)*100000 + (clo + dx + 18000)
				h := sort.Search(len(ag.hucreler), func(i int) bool { return ag.hucreler[i] >= anahtar })
				if h >= len(ag.hucreler) || ag.hucreler[h] != anahtar {
					continue
				}
				for v := ag.hucreBas[h]; v < ag.hucreBas[h+1]; v++ {
					d := mesafeE7(lat, lon, ag.vLat[v], ag.vLon[v])
					if d < en && kullan(int(v)) {
						en, enK = d, int(v)
					}
				}
			}
		}
		if enK >= 0 && bulunduHalka < 0 {
			bulunduHalka = int(r)
		}
		if bulunduHalka >= 0 && int(r) >= bulunduHalka+1 {
			break // bir halka daha bakıldı: köşegen komşu kaçmasın
		}
	}
	return enK, en
}

type rotaAdim struct {
	Yon string  `json:"yon"` // basla, duz, hafifsag, hafifsol, sag, sol, keskinsag, keskinsol, geri
	Ad  string  `json:"ad"`
	Tur uint8   `json:"tur"` // yol sınıfı kodu (adı olmayan yol için sayfa "patika", "merdiven" der)
	M   float64 `json:"m"`
}

type rotaSonuc struct {
	Tamam      bool         `json:"tamam"`
	Hata       string       `json:"hata,omitempty"`
	Metre      float64      `json:"m"`
	Saniye     float64      `json:"sn"`
	Geo        [][2]float64 `json:"geo"`
	Adimlar    []rotaAdim   `json:"adimlar"`
	BasSapma   float64      `json:"basSapma"`
	VarSapma   float64      `json:"varSapma"`
	Gezilen    int          `json:"gezilen"`
	VeriTarihi string       `json:"veriTarihi"`
}

type yigin struct {
	f []float32
	v []uint32
}

func (y *yigin) it(f float32, v uint32) {
	y.f = append(y.f, f)
	y.v = append(y.v, v)
	i := len(y.f) - 1
	for i > 0 {
		p := (i - 1) / 2
		if y.f[p] <= y.f[i] {
			break
		}
		y.f[p], y.f[i] = y.f[i], y.f[p]
		y.v[p], y.v[i] = y.v[i], y.v[p]
		i = p
	}
}

func (y *yigin) al() (float32, uint32) {
	f, v := y.f[0], y.v[0]
	n := len(y.f) - 1
	y.f[0], y.v[0] = y.f[n], y.v[n]
	y.f, y.v = y.f[:n], y.v[:n]
	i := 0
	for {
		l, r, k := 2*i+1, 2*i+2, i
		if l < n && y.f[l] < y.f[k] {
			k = l
		}
		if r < n && y.f[r] < y.f[k] {
			k = r
		}
		if k == i {
			break
		}
		y.f[k], y.f[i] = y.f[i], y.f[k]
		y.v[k], y.v[i] = y.v[i], y.v[k]
		i = k
	}
	return f, v
}

// Rota: iki nokta arası (derece). kip: "yaya" ya da "arac".
func (ag *rotaAg) Rota(lat1, lon1, lat2, lon2 float64, kip string) rotaSonuc {
	arac := kip == "arac"
	sonuc := rotaSonuc{VeriTarihi: ag.Ozet.VeriTarihi}
	a1, o1 := int32(math.Round(lat1*1e7)), int32(math.Round(lon1*1e7))
	a2, o2 := int32(math.Round(lat2*1e7)), int32(math.Round(lon2*1e7))
	bas, bSap := ag.yakinKose(a1, o1, arac, true)
	son, vSap := ag.yakinKose(a2, o2, arac, false)
	if bas < 0 || son < 0 {
		sonuc.Hata = "yol-yok"
		return sonuc
	}
	sonuc.BasSapma, sonuc.VarSapma = math.Round(bSap), math.Round(vSap)
	ag.mu.Lock()
	defer ag.mu.Unlock()
	V := len(ag.vLat)
	if ag.maliyet == nil {
		ag.maliyet = make([]float32, V)
		ag.onceki = make([]uint32, V)
		ag.nesil = make([]uint32, V)
	}
	ag.n++
	if ag.n == 0 { // taşma: sıfırla
		for i := range ag.nesil {
			ag.nesil[i] = 0
		}
		ag.n = 1
	}
	hiz := float64(yayaAzami)
	if arac {
		hiz = aracAzami
	}
	tLat, tLon := ag.vLat[son], ag.vLon[son]
	sezgi := func(v uint32) float32 { return float32(mesafeE7(ag.vLat[v], ag.vLon[v], tLat, tLon) / hiz) }
	const yok = ^uint32(0)
	ag.nesil[bas], ag.maliyet[bas], ag.onceki[bas] = ag.n, 0, yok
	y := &yigin{}
	y.it(sezgi(uint32(bas)), uint32(bas))
	gezilen := 0
	bulundu := false
	for len(y.f) > 0 {
		f, v := y.al()
		g := ag.maliyet[v]
		if f > g+sezgi(v)+0.001 { // eski girdi
			continue
		}
		gezilen++
		if int(v) == son {
			bulundu = true
			break
		}
		if gezilen > 20_000_000 {
			break
		}
		for i := ag.derece[v]; i < ag.derece[v+1]; i++ {
			e := ag.komsu[i]
			if !ag.gecer(e, arac) {
				continue
			}
			s := e >> 1
			w := ag.sB[s]
			if e&1 == 1 {
				w = ag.sA[s]
			}
			ng := g + ag.parcaSure(s, arac)
			if ag.nesil[w] != ag.n || ng < ag.maliyet[w] {
				ag.nesil[w], ag.maliyet[w], ag.onceki[w] = ag.n, ng, e
				y.it(ng+sezgi(w), w)
			}
		}
	}
	sonuc.Gezilen = gezilen
	if !bulundu {
		sonuc.Hata = "rota-yok"
		return sonuc
	}
	// Geri yürü: parçalar sondan başa.
	var yol []uint32
	for v := uint32(son); int(v) != bas; {
		e := ag.onceki[v]
		yol = append(yol, e)
		s := e >> 1
		if e&1 == 0 {
			v = ag.sA[s]
		} else {
			v = ag.sB[s]
		}
		if len(yol) > 5_000_000 {
			sonuc.Hata = "rota-bozuk"
			return sonuc
		}
	}
	for i, j := 0, len(yol)-1; i < j; i, j = i+1, j-1 {
		yol[i], yol[j] = yol[j], yol[i]
	}
	sonuc.Saniye = math.Round(float64(ag.maliyet[son]))
	// Çizgi ve adımlar
	nokta := func(lat, lon int32) [2]float64 {
		return [2]float64{math.Round(float64(lon)/10) / 1e6, math.Round(float64(lat)/10) / 1e6}
	}
	geo := [][2]float64{nokta(ag.vLat[bas], ag.vLon[bas])}
	type grup struct {
		ad     uint32
		sinif  uint8
		m      float64
		basGeo int
		sonGeo int
	}
	var gruplar []grup
	for _, e := range yol {
		s := e >> 1
		ara := ag.araNoktalar(s)
		if e&1 == 1 {
			for i, j := 0, len(ara)-1; i < j; i, j = i+1, j-1 {
				ara[i], ara[j] = ara[j], ara[i]
			}
		}
		ilk := len(geo) - 1
		geo = append(geo, ara...)
		w := ag.sB[s]
		if e&1 == 1 {
			w = ag.sA[s]
		}
		geo = append(geo, nokta(ag.vLat[w], ag.vLon[w]))
		m := float64(ag.sUz[s])
		sonuc.Metre += m
		ad, sinif := ag.sAd[s], ag.sSinif[s]
		if n := len(gruplar); n > 0 && gruplar[n-1].ad == ad && (ad != 0 || gruplar[n-1].sinif == sinif) {
			gruplar[n-1].m += m
			gruplar[n-1].sonGeo = len(geo) - 1
		} else {
			gruplar = append(gruplar, grup{ad, sinif, m, ilk, len(geo) - 1})
		}
	}
	sonuc.Metre = math.Round(sonuc.Metre)
	sonuc.Geo = geo
	// Sade tarif: 40 m'den kısa adsız parçalar (kaldırım, geçit) komşu adıma katılır; aynı adlı ardışıklar birleşir.
	kucuk := func(g grup) bool { return g.ad == 0 && g.m < 40 && g.sinif != sinifVapur }
	var sade []grup
	for _, gr := range gruplar {
		n := len(sade)
		if n == 1 && kucuk(sade[0]) && !kucuk(gr) { // ilk adım küçükse sonrakine katılır
			gr.m += sade[0].m
			gr.basGeo = sade[0].basGeo
			sade[0] = gr
			continue
		}
		if n > 0 && (kucuk(gr) || (gr.ad != 0 && sade[n-1].ad == gr.ad)) {
			sade[n-1].m += gr.m
			sade[n-1].sonGeo = gr.sonGeo
			continue
		}
		sade = append(sade, gr)
	}
	gruplar = sade
	for i, gr := range gruplar {
		yon := "basla"
		if i > 0 {
			onc := gruplar[i-1]
			yon = donusYonu(geo, onc.sonGeo, gr.basGeo)
		}
		ad := ""
		if int(gr.ad) < len(ag.adlar) {
			ad = ag.adlar[gr.ad]
		}
		sonuc.Adimlar = append(sonuc.Adimlar, rotaAdim{Yon: yon, Ad: ad, Tur: gr.sinif, M: math.Round(gr.m)})
	}
	sonuc.Tamam = true
	return sonuc
}

func (ag *rotaAg) araNoktalar(s uint32) [][2]float64 {
	a, b := ag.gOff[s], ag.gOff[s+1]
	if a == b {
		return nil
	}
	out := make([][2]float64, b-a)
	for i := a; i < b; i++ {
		out[i-a] = [2]float64{math.Round(float64(ag.gLon[i])/10) / 1e6, math.Round(float64(ag.gLat[i])/10) / 1e6}
	}
	return out
}

func yonAcisi(a, b [2]float64) float64 {
	f1, f2 := a[1]*math.Pi/180, b[1]*math.Pi/180
	dl := (b[0] - a[0]) * math.Pi / 180
	y := math.Sin(dl) * math.Cos(f2)
	x := math.Cos(f1)*math.Sin(f2) - math.Sin(f1)*math.Cos(f2)*math.Cos(dl)
	return math.Atan2(y, x) * 180 / math.Pi
}

func noktaMesafe(a, b [2]float64) float64 {
	return mesafeE7(int32(a[1]*1e7), int32(a[0]*1e7), int32(b[1]*1e7), int32(b[0]*1e7))
}

// donusYonu: kavşakta önceki gidişle yeni gidiş arasındaki açı. Kaldırım kıvrımı yanıltmasın diye
// kavşaktan ~25 m geri ve ileri bakılır.
func donusYonu(geo [][2]float64, kavsak, yeniBas int) string {
	k := kavsak
	if k <= 0 || k+1 >= len(geo) {
		return "duz"
	}
	once := k - 1
	for once > 0 && noktaMesafe(geo[once], geo[k]) < 25 {
		once--
	}
	sonra := k + 1
	for sonra < len(geo)-1 && noktaMesafe(geo[k], geo[sonra]) < 25 {
		sonra++
	}
	if geo[once] == geo[k] || geo[sonra] == geo[k] {
		return "duz"
	}
	d := yonAcisi(geo[k], geo[sonra]) - yonAcisi(geo[once], geo[k])
	for d > 180 {
		d -= 360
	}
	for d < -180 {
		d += 360
	}
	switch {
	case d > -25 && d < 25:
		return "duz"
	case d >= 25 && d < 60:
		return "hafifsag"
	case d <= -25 && d > -60:
		return "hafifsol"
	case d >= 60 && d < 140:
		return "sag"
	case d <= -60 && d > -140:
		return "sol"
	case d >= 140 && d < 170:
		return "keskinsag"
	case d <= -140 && d > -170:
		return "keskinsol"
	}
	return "geri"
}

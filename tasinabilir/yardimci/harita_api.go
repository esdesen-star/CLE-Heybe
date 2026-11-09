package main

// Çevrim dışı harita: sayfaya açılan kapılar ve deneme komutu (09.11.2026, harita 8i).
// Harita dosyaları belleğin harita/ klasöründe: <ad>.pmtiles (görüntü), <ad>.rota (yol ağı), <ad>.yer (ad dizini).
// Hangi bölgenin yükleneceği kurumun ya da kullanıcının seçimi (K18: Heybe sistemdir, veri kullanıcınındır).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var harita struct {
	mu  sync.Mutex
	ad  string // yüklü .rota'nın adı (uzantısız)
	ag  *rotaAg
	hat string // son açma hatası
}

func haritaDir() string { return filepath.Join(kok, "harita") }

// haritaBul: klasördeki ilk .rota (adına göre sıralı). Yoksa "".
func haritaBul() string {
	gir, err := os.ReadDir(haritaDir())
	if err != nil {
		return ""
	}
	var adlar []string
	for _, g := range gir {
		if !g.IsDir() && strings.HasSuffix(g.Name(), ".rota") && !strings.HasPrefix(g.Name(), ".") {
			adlar = append(adlar, strings.TrimSuffix(g.Name(), ".rota"))
		}
	}
	sort.Strings(adlar)
	if len(adlar) == 0 {
		return ""
	}
	return adlar[0]
}

// haritalar: klasördeki haritaların adları (görüntüsü ya da yol ağı olan). 09.11 (§78): birden çok bölge indirilebilir.
func haritalar() []string {
	gir, _ := os.ReadDir(haritaDir())
	gor := map[string]bool{}
	var adlar []string
	for _, g := range gir {
		n := g.Name()
		if g.IsDir() || strings.HasPrefix(n, ".") {
			continue
		}
		for _, uz := range []string{".pmtiles", ".rota"} {
			if strings.HasSuffix(n, uz) {
				ad := strings.TrimSuffix(n, uz)
				if !gor[ad] {
					gor[ad] = true
					adlar = append(adlar, ad)
				}
			}
		}
	}
	sort.Strings(adlar)
	return adlar
}

// haritaSec: istekte "harita" adı verilmişse o (yalnız klasördeki adlardan), yoksa ilk yol ağı olan, o da yoksa ilk harita.
func haritaSec(r *http.Request) string {
	istenen := r.URL.Query().Get("harita")
	hepsi := haritalar()
	for _, a := range hepsi {
		if a == istenen {
			return a
		}
	}
	if a := haritaBul(); a != "" {
		return a
	}
	if len(hepsi) > 0 {
		return hepsi[0]
	}
	return ""
}

func dosyaVar(ad, uz string) bool {
	_, err := os.Stat(filepath.Join(haritaDir(), ad+uz))
	return err == nil
}

// haritaOzet: yol ağı varsa onun başlığı; yalnız görüntü varsa indirmede yazılan bilgi dosyası (<ad>.json).
func haritaOzet(ad string) (hazirlikOzet, bool) {
	if oz, err := rotaOzetOku(filepath.Join(haritaDir(), ad+".rota")); err == nil {
		return oz, true
	}
	var b struct {
		Tarih string     `json:"tarih"`
		Kutu  [4]float64 `json:"kutu"`
	}
	v, err := os.ReadFile(filepath.Join(haritaDir(), ad+".json"))
	if err != nil || json.Unmarshal(v, &b) != nil {
		return hazirlikOzet{EnKucukLat: -60, EnKucukLon: -180, EnBuyukLat: 75, EnBuyukLon: 180}, false
	}
	return hazirlikOzet{VeriTarihi: b.Tarih, EnKucukLon: b.Kutu[0], EnKucukLat: b.Kutu[1], EnBuyukLon: b.Kutu[2], EnBuyukLat: b.Kutu[3]}, false
}

func haritaAg(ad string) (*rotaAg, string, error) {
	harita.mu.Lock()
	defer harita.mu.Unlock()
	if ad == "" || !dosyaVar(ad, ".rota") {
		return nil, "", fmt.Errorf("harita yok")
	}
	if harita.ag != nil && harita.ad == ad {
		return harita.ag, ad, nil
	}
	if harita.ag != nil {
		harita.ag.Kapat()
		harita.ag = nil
	}
	ag, err := rotaAc(filepath.Join(haritaDir(), ad+".rota"))
	if err != nil {
		harita.hat = err.Error()
		return nil, ad, err
	}
	harita.ag, harita.ad = ag, ad
	return ag, ad, nil
}

type yerSonuc struct {
	Tur    string  `json:"tur"`
	Ad     string  `json:"ad"`
	Baglam string  `json:"baglam"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	M      float64 `json:"m,omitempty"`
	Liste  string  `json:"liste,omitempty"` // kurum listesinden geldiyse listenin adı (kaynak)
	puan   float64
}

var turAgirlik = map[string]float64{
	"sehir": 100, "kasaba": 80, "semt": 62, "mahalle": 58, "koy": 55, "hastane": 50, "toplanma": 50,
	"saglik": 42, "eczane": 40, "itfaiye": 40, "polis": 40, "barinak": 45, "su": 38, "belediye": 38,
	"otogar": 38, "istasyon": 38, "okul": 34, "sokak": 32, "market": 30, "ibadet": 30, "akaryakit": 28, "mezra": 22,
	"dagitim": 45, "diger": 25, // kurum listelerinden (harita_ek.go)
}

// yerTara: .yer dizinini satır satır gezer. Dizin ilk kullanımda bir kez belleğe alınır (Türkiye ~47 MB):
// yavaş harici diskte her aramada dosyayı okumak ilk aramayı 10 saniyeyi aşırıyordu (09.11 ölçümü: 3,6 MB/sn).
var yerBellek struct {
	mu    sync.Mutex
	yol   string
	boy   int64
	zaman time.Time
	veri  []byte
}

func yerVeri(yol string) ([]byte, error) {
	st, err := os.Stat(yol)
	if err != nil {
		return nil, err
	}
	yerBellek.mu.Lock()
	defer yerBellek.mu.Unlock()
	if yerBellek.veri != nil && yerBellek.yol == yol && yerBellek.boy == st.Size() && yerBellek.zaman.Equal(st.ModTime()) {
		return yerBellek.veri, nil
	}
	v, err := os.ReadFile(yol)
	if err != nil {
		return nil, err
	}
	yerBellek.yol, yerBellek.boy, yerBellek.zaman, yerBellek.veri = yol, st.Size(), st.ModTime(), v
	return v, nil
}

func yerTara(yol string, f func(norm, tur, ad, baglam string, lat, lon int32)) error {
	v, err := yerVeri(yol)
	if err != nil {
		return err
	}
	for len(v) > 0 {
		i := bytes.IndexByte(v, '\n')
		satir := v
		if i >= 0 {
			satir, v = v[:i], v[i+1:]
		} else {
			v = nil
		}
		p := strings.SplitN(string(satir), "\t", 6)
		if len(p) != 6 {
			continue
		}
		la, e1 := strconv.ParseInt(p[4], 10, 32)
		lo, e2 := strconv.ParseInt(p[5], 10, 32)
		if e1 != nil || e2 != nil {
			continue
		}
		f(p[0], p[1], p[2], p[3], int32(la), int32(lo))
	}
	return nil
}

// yerAra: ad ile arama. Her sözcük, kaydın bir sözcüğünün başı olmalı ("kadık" → "Kadıköy").
// Konum verilirse yakın olan öne çıkar.
func yerAra(yol, q string, lat, lon float64, konumVar bool, n int) ([]yerSonuc, error) {
	sozcukler := strings.Fields(aramaNormal(q))
	if len(sozcukler) == 0 {
		return nil, nil
	}
	qn := strings.Join(sozcukler, " ")
	a0, o0 := int32(math.Round(lat*1e7)), int32(math.Round(lon*1e7))
	var bulunan []yerSonuc
	err := yerTara(yol, func(norm, tur, ad, baglam string, la, lo int32) {
		bosluklu := " " + norm
		for _, s := range sozcukler {
			if !strings.Contains(bosluklu, " "+s) {
				return
			}
		}
		puan := turAgirlik[tur]
		an := aramaNormal(ad)
		switch {
		case an == qn:
			puan += 60
		case strings.HasPrefix(an, qn):
			puan += 35
		case strings.HasPrefix(an, sozcukler[0]):
			puan += 15
		}
		y := yerSonuc{Tur: tur, Ad: ad, Baglam: baglam, Lat: float64(la) / 1e7, Lon: float64(lo) / 1e7}
		if konumVar {
			y.M = math.Round(mesafeE7(a0, o0, la, lo))
			puan -= 12 * math.Log10(1+y.M/1000) // 10 km ≈ -12, 100 km ≈ -24
		}
		y.puan = puan
		bulunan = append(bulunan, y)
		if len(bulunan) > 20000 { // çok genel sorgu: en iyileri tut
			sort.Slice(bulunan, func(i, j int) bool { return bulunan[i].puan > bulunan[j].puan })
			bulunan = bulunan[:200]
		}
	})
	sort.SliceStable(bulunan, func(i, j int) bool { return bulunan[i].puan > bulunan[j].puan })
	if len(bulunan) > n {
		bulunan = bulunan[:n]
	}
	return bulunan, err
}

// yerYakinSinir: "en yakın" bu uzaklıktan ötesini vermez. 09.11: Antakya'dan "en yakın toplanma alanı"
// 181 km ötedeki Mersin'den çıktı (Hatay'ın toplanma alanları OpenStreetMap'te yok) ve 296 km yürüyüş önerildi.
// Uzaktakini göstermek yanıltır; sayfa "yakında yok, haritada kayıt eksik olabilir" der.
const yerYakinSinir = 50000

// Türe göre gerçekçi sınır (m): suya ya da toplanma alanına onlarca km yürünmez.
var yerYakinTurSinir = map[string]float64{"su": 10000, "toplanma": 15000, "eczane": 25000, "barinak": 25000, "saglik": 25000}

func turSiniri(tur string) float64 {
	if v, ok := yerYakinTurSinir[tur]; ok {
		return v
	}
	return yerYakinSinir
}

// yerYakin: bir türden en yakın n yer (ör. hastane, toplanma alanı), en çok yerYakinSinir uzaklıkta.
func yerYakin(yol, tur string, lat, lon float64, n int) ([]yerSonuc, error) {
	a0, o0 := int32(math.Round(lat*1e7)), int32(math.Round(lon*1e7))
	sinir := turSiniri(tur)
	var bulunan []yerSonuc
	err := yerTara(yol, func(norm, t, ad, baglam string, la, lo int32) {
		if t != tur {
			return
		}
		d := mesafeE7(a0, o0, la, lo)
		if d > sinir {
			return
		}
		bulunan = append(bulunan, yerSonuc{Tur: t, Ad: ad, Baglam: baglam, Lat: float64(la) / 1e7, Lon: float64(lo) / 1e7, M: math.Round(d)})
	})
	sort.Slice(bulunan, func(i, j int) bool { return bulunan[i].M < bulunan[j].M })
	if len(bulunan) > n {
		bulunan = bulunan[:n]
	}
	return bulunan, err
}

func noktaOku(s string) (float64, float64, bool) {
	p := strings.Split(s, ",")
	if len(p) != 2 {
		return 0, 0, false
	}
	la, e1 := strconv.ParseFloat(strings.TrimSpace(p[0]), 64)
	lo, e2 := strconv.ParseFloat(strings.TrimSpace(p[1]), 64)
	if e1 != nil || e2 != nil || la < -90 || la > 90 || lo < -180 || lo > 180 || math.IsNaN(la) || math.IsNaN(lo) {
		return 0, 0, false
	}
	return la, lo, true
}

// apiHarita: hangi haritalar var; seçilenin tarihi, sınırları, yol tarifi olup olmadığı.
func apiHarita(w http.ResponseWriter, r *http.Request) {
	ad := haritaSec(r)
	cevap := map[string]any{"var": false, "haritalar": []map[string]any{}}
	var liste []map[string]any
	for _, a := range haritalar() {
		_, yol := haritaOzet(a)
		oge := map[string]any{"ad": a, "yol": yol, "goruntu": dosyaVar(a, ".pmtiles")}
		var bilgi struct {
			Bolge string `json:"bolge"`
			Iso   string `json:"iso"`
			Isim  string `json:"isim"`
		}
		if v, err := os.ReadFile(filepath.Join(haritaDir(), a+".json")); err == nil && json.Unmarshal(v, &bilgi) == nil {
			oge["bolge"], oge["iso"], oge["isim"] = bilgi.Bolge, bilgi.Iso, bilgi.Isim
		}
		liste = append(liste, oge)
	}
	if liste != nil {
		cevap["haritalar"] = liste
	}
	if ad == "" || !dosyaVar(ad, ".pmtiles") {
		jsonYaz(w, 200, cevap)
		return
	}
	oz, yol := haritaOzet(ad)
	cevap["var"], cevap["ad"], cevap["ozet"], cevap["yolVar"] = true, ad, oz, yol
	cevap["pmtiles"] = "/harita/" + ad + ".pmtiles"
	cevap["yer"] = dosyaVar(ad, ".yer")
	if !yol {
		jsonYaz(w, 200, cevap)
		return
	}
	// Yol ağı (Türkiye ~470 MB) belleğe arka planda alınır; yavaş diskte yarım dakika sürebilir.
	// TryLock: yükleme sürerken kilit tutulur; sayfa beklemesin, ikinci yükleme de başlamasın.
	hazir, yukleniyor := false, true
	if harita.mu.TryLock() {
		hazir, yukleniyor = harita.ag != nil && harita.ad == ad, false
		harita.mu.Unlock()
	}
	cevap["agHazir"] = hazir
	if !hazir && !yukleniyor {
		go haritaAg(ad)
		go yerVeri(filepath.Join(haritaDir(), ad+".yer"))
	}
	jsonYaz(w, 200, cevap)
}

func apiRota(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	la1, lo1, ok1 := noktaOku(q.Get("a"))
	la2, lo2, ok2 := noktaOku(q.Get("b"))
	if !ok1 || !ok2 {
		jsonYaz(w, 400, map[string]string{"hata": "nokta"})
		return
	}
	ag, _, err := haritaAg(haritaSec(r))
	if err != nil {
		jsonYaz(w, 404, map[string]string{"hata": "harita-yok"})
		return
	}
	kip := "yaya"
	if q.Get("kip") == "arac" {
		kip = "arac"
	}
	jsonYaz(w, 200, ag.Rota(la1, lo1, la2, lo2, kip))
}

func apiYer(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ad := haritaSec(r) // yalnız görüntüsü olan haritada .yer yoktur: kurum listeleri yine aranır
	la, lo, konum := noktaOku(q.Get("konum"))
	yol := filepath.Join(haritaDir(), ad+".yer")
	var sonuc []yerSonuc
	var err error
	if tur := q.Get("tur"); tur != "" {
		if !konum {
			jsonYaz(w, 400, map[string]string{"hata": "konum"})
			return
		}
		if dosyaVar(ad, ".yer") {
			sonuc, err = yerYakin(yol, tur, la, lo, 5)
		}
		// kurumun listesi de (09.11, §77): uzaklığa göre birlikte sıralanır, kaynak adıyla görünür
		sonuc = append(sonuc, ekYakin(tur, la, lo, 5)...)
		sort.SliceStable(sonuc, func(i, j int) bool { return sonuc[i].M < sonuc[j].M })
		if len(sonuc) > 5 {
			sonuc = sonuc[:5]
		}
	} else {
		if dosyaVar(ad, ".yer") {
			sonuc, err = yerAra(yol, q.Get("q"), la, lo, konum, 12)
		}
		sonuc = append(sonuc, ekAra(q.Get("q"), la, lo, konum)...)
		sort.SliceStable(sonuc, func(i, j int) bool { return sonuc[i].puan > sonuc[j].puan })
		if len(sonuc) > 12 {
			sonuc = sonuc[:12]
		}
	}
	if err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "dizin"})
		return
	}
	if sonuc == nil {
		sonuc = []yerSonuc{}
	}
	jsonYaz(w, 200, sonuc)
}

// haritaKomut: komut satırından hazırlık ve deneme.
func kutuOku(s string) (*[4]float64, error) {
	if s == "" {
		return nil, nil
	}
	p := strings.Split(s, ",")
	if len(p) != 4 {
		return nil, errors.New("kutu: batı,güney,doğu,kuzey")
	}
	var k [4]float64
	for i := range p {
		v, err := strconv.ParseFloat(strings.TrimSpace(p[i]), 64)
		if err != nil {
			return nil, errors.New("kutu: sayı okunamadı")
		}
		k[i] = v
	}
	if k[0] >= k[2] || k[1] >= k[3] || k[1] < -90 || k[3] > 90 || k[0] < -180 || k[2] > 180 {
		return nil, errors.New("kutu: batı < doğu, güney < kuzey olmalı")
	}
	return &k, nil
}

func haritaKomut(pbf, cikti, tarih, dene, kutuMetni, kes string) int {
	kutu, err := kutuOku(kutuMetni)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if kes != "" {
		if kutu == nil || cikti == "" {
			fmt.Fprintln(os.Stderr, "-harita-kes için -harita-kutu ve -harita-cikti gerekli")
			return 2
		}
		ctx := context.Background()
		if kes == "son" {
			if kes, _, err = sonYapim(ctx); err != nil {
				fmt.Fprintln(os.Stderr, err)
				return 1
			}
		}
		k := &httpPmKaynak{adres: kes, istemci: &http.Client{Timeout: 10 * time.Minute}}
		p, err := pmPlanla(ctx, k, kutu[0], kutu[1], kutu[2], kutu[3], 15)
		if err != nil {
			fmt.Fprintln(os.Stderr, "kesme planı:", err)
			return 1
		}
		fmt.Printf("kaynak %s · %d döşeme · indirilecek %.1f MB\n", kes, p.Baslik.Adresli, float64(p.IndirilecekBoy())/1e6)
		if err := pmIndir(ctx, k, p, cikti+".pmtiles", nil); err != nil {
			fmt.Fprintln(os.Stderr, "indirme:", err)
			return 1
		}
		fmt.Println("bitti:", cikti+".pmtiles")
		return 0
	}
	if pbf != "" {
		if cikti == "" {
			fmt.Fprintln(os.Stderr, "-harita-cikti gerekli (ör. harita/turkiye)")
			return 2
		}
		if tarih == "" {
			if st, err := os.Stat(pbf); err == nil {
				tarih = st.ModTime().Format("2006-01-02")
			}
		}
		if err := os.MkdirAll(filepath.Dir(cikti), 0o755); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		oz, err := haritaHazirla(pbf, cikti, tarih, func(s string) { fmt.Println(time.Now().Format("15:04:05"), s) }, kutu)
		if err != nil {
			fmt.Fprintln(os.Stderr, "hazırlık durdu:", err)
			return 1
		}
		fmt.Printf("bitti: %d köşe, %d parça, %d yer, %.0f sn\n", oz.Dugum, oz.Parca, oz.Yer, oz.Sure)
		return 0
	}
	if strings.HasPrefix(dene, "ara:") {
		sonuc, err := yerAra(cikti+".yer", strings.TrimPrefix(dene, "ara:"), 0, 0, false, 10)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		for _, y := range sonuc {
			fmt.Printf("%-9s %-40s %-35s %.5f,%.5f\n", y.Tur, y.Ad, y.Baglam, y.Lat, y.Lon)
		}
		return 0
	}
	p := strings.Split(dene, ";")
	if len(p) < 2 {
		fmt.Fprintln(os.Stderr, "biçim: enlem,boylam;enlem,boylam;yaya|arac")
		return 2
	}
	la1, lo1, ok1 := noktaOku(p[0])
	la2, lo2, ok2 := noktaOku(p[1])
	if !ok1 || !ok2 {
		fmt.Fprintln(os.Stderr, "nokta okunamadı")
		return 2
	}
	kip := "yaya"
	if len(p) > 2 {
		kip = p[2]
	}
	t0 := time.Now()
	ag, err := rotaAc(cikti + ".rota")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer ag.Kapat()
	t1 := time.Now()
	s := ag.Rota(la1, lo1, la2, lo2, kip)
	t2 := time.Now()
	fmt.Printf("açılış %.2f sn · rota %.3f sn · gezilen %d köşe\n", t1.Sub(t0).Seconds(), t2.Sub(t1).Seconds(), s.Gezilen)
	if !s.Tamam {
		fmt.Println("rota yok:", s.Hata)
		return 1
	}
	fmt.Printf("%s: %.1f km, %.0f dk · başlangıç sapması %.0f m, varış sapması %.0f m · %d nokta\n", kip, s.Metre/1000, s.Saniye/60, s.BasSapma, s.VarSapma, len(s.Geo))
	for i, a := range s.Adimlar {
		if i >= 25 {
			fmt.Printf("… %d adım daha\n", len(s.Adimlar)-i)
			break
		}
		ad := a.Ad
		if ad == "" {
			ad = fmt.Sprintf("(adsız, sınıf %d)", a.Tur)
		}
		fmt.Printf("  %-9s %-40s %6.0f m\n", a.Yon, ad, a.M)
	}
	return 0
}

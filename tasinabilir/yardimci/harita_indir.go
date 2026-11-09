package main

// Bölge haritası indirme (09.11.2026, Özet §78 · Ercan: "Kullanıcı istediği ülkenin veya bölgenin haritasını
// (tüm dünya da olabilir) otomatik indirme seçeneği olacak mı?").
// Bölgeler Geofabrik kataloğundan (OpenStreetMap özetleri, ülke ve alt bölge). Bir bölge için:
//  1. harita görüntüsü: Protomaps'in son dünya yapımından bölge kesilir (harita_kes.go),
//  2. yol verisi: Geofabrik .osm.pbf (MD5 sağlamalı, kaldığı yerden sürer),
//  3. hazırlık: yardımcı kendini ayrı bir süreç olarak çalıştırır (-harita-hazirla) — bellek yetmezse
//     yalnız o süreç düşer, Heybe açık kalır; bitince .pbf silinir.
// Dünya: yalnız görüntü (yol tarifi dünya için sıradan bilgisayarda hazırlanamaz): "genel" (ayrıntı düşük) ya da "tam" (~139 GB).
// İndirme yalnız kullanıcı onaylayınca başlar; Heybe kendiliğinden internete çıkmaz.

import (
	"bufio"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	geofabrikKok      = "https://download.geofabrik.de/"
	geofabrikKatalog  = "https://download.geofabrik.de/index-v1.json"
	protomapsYapimlar = "https://build-metadata.protomaps.dev/builds.json"
	protomapsAdres    = "https://build.protomaps.com/"
	haritaIstemci     = &http.Client{Timeout: 0} // büyük indirmeler: süre sınırı bağlamla
)

type bolge struct {
	ID   string     `json:"id"`
	Ad   string     `json:"ad"`
	Ust  string     `json:"ust,omitempty"`
	Iso  string     `json:"iso,omitempty"`
	Pbf  string     `json:"pbf,omitempty"`
	Kutu [4]float64 `json:"kutu"` // batı, güney, doğu, kuzey
}

const (
	dunyaGenel = "dunya-genel"
	dunyaTam   = "dunya-tam"
)

func katalogYolu() string { return filepath.Join(haritaDir(), "katalog.json") }

// katalogGetir: önce bellekteki kopya (internet yokken de liste görünsün); "tazele" ise Geofabrik'ten.
func katalogGetir(ctx context.Context, tazele bool) ([]bolge, string, error) {
	if !tazele {
		if b, err := os.ReadFile(katalogYolu()); err == nil {
			var k struct {
				Tarih    string  `json:"tarih"`
				Bolgeler []bolge `json:"bolgeler"`
			}
			if json.Unmarshal(b, &k) == nil && len(k.Bolgeler) > 0 {
				return k.Bolgeler, k.Tarih, nil
			}
		}
	}
	ist, _ := http.NewRequestWithContext(ctx, "GET", geofabrikKatalog, nil)
	ist.Header.Set("User-Agent", "CLE-Heybe")
	y, err := (&http.Client{Timeout: 2 * time.Minute}).Do(ist)
	if err != nil {
		return nil, "", errors.New("internet-yok")
	}
	defer y.Body.Close()
	if y.StatusCode != 200 {
		return nil, "", errors.New("katalog-alinamadi")
	}
	var fc struct {
		Features []struct {
			Properties struct {
				ID     string            `json:"id"`
				Parent string            `json:"parent"`
				Name   string            `json:"name"`
				Iso    []string          `json:"iso3166-1:alpha2"`
				Urls   map[string]string `json:"urls"`
			} `json:"properties"`
			Geometry map[string]any `json:"geometry"`
		} `json:"features"`
	}
	if err := json.NewDecoder(io.LimitReader(y.Body, 64<<20)).Decode(&fc); err != nil {
		return nil, "", errors.New("katalog-alinamadi")
	}
	var bolgeler []bolge
	for _, f := range fc.Features {
		p := f.Properties
		kutu, ok := geoKutu(f.Geometry)
		if !ok || p.Urls["pbf"] == "" || !strings.HasPrefix(p.Urls["pbf"], geofabrikKok) {
			continue
		}
		b := bolge{ID: p.ID, Ad: p.Name, Ust: p.Parent, Pbf: p.Urls["pbf"], Kutu: kutu}
		if len(p.Iso) == 1 {
			b.Iso = p.Iso[0]
		}
		bolgeler = append(bolgeler, b)
	}
	if len(bolgeler) == 0 {
		return nil, "", errors.New("katalog-alinamadi")
	}
	sort.Slice(bolgeler, func(i, j int) bool { return bolgeler[i].Ad < bolgeler[j].Ad })
	tarih := time.Now().Format("2006-01-02")
	if b, err := json.Marshal(map[string]any{"tarih": tarih, "kaynak": geofabrikKatalog, "bolgeler": bolgeler}); err == nil {
		os.MkdirAll(haritaDir(), 0o755)
		os.WriteFile(katalogYolu(), b, 0o644)
	}
	return bolgeler, tarih, nil
}

func geoKutu(g map[string]any) ([4]float64, bool) {
	k := [4]float64{math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)}
	n := 0
	var gez func(v any)
	gez = func(v any) {
		d, ok := v.([]any)
		if !ok {
			return
		}
		if len(d) >= 2 {
			lo, a := d[0].(float64)
			la, b := d[1].(float64)
			if a && b {
				k[0], k[1], k[2], k[3] = math.Min(k[0], lo), math.Min(k[1], la), math.Max(k[2], lo), math.Max(k[3], la)
				n++
				return
			}
		}
		for _, x := range d {
			gez(x)
		}
	}
	gez(g["coordinates"])
	return k, n > 0
}

// İndirme işi: aynı anda bir tane.
type haritaIsi struct {
	Bolge   string  `json:"bolge"`
	Ad      string  `json:"ad"`
	Asama   string  `json:"asama"` // plan, harita, yol, hazirlik, bitti, hata, durdu
	Inen    uint64  `json:"inen"`
	Toplam  uint64  `json:"toplam"`
	Hata    string  `json:"hata,omitempty"`
	Bilgi   string  `json:"bilgi,omitempty"`
	Basladi string  `json:"basladi"`
	Oran    float64 `json:"oran"`
}

var hIs struct {
	mu    sync.Mutex
	is    *haritaIsi
	iptal context.CancelFunc
	plan  map[string]*haritaTeklif // onaydan önce hesaplanan (bölge → teklif)
}

type haritaTeklif struct {
	Bolge      string  `json:"bolge"`
	Ad         string  `json:"ad"`
	HaritaMB   float64 `json:"haritaMB"`
	EnCokZ     uint8   `json:"enCokZ"`
	Ayrinti    bool    `json:"ayrintiDusuk"`
	YolMB      float64 `json:"yolMB"`
	YolVar     bool    `json:"yolVar"`
	BellekGB   float64 `json:"bellekGB"`
	GerekGB    float64 `json:"gerekGB"`
	BosGB      float64 `json:"bosGB"`
	Sigar      bool    `json:"sigar"`
	BuyukDosya bool    `json:"buyukDosyaSorunu"`
	plan       *pmPlan
	kaynak     string
	bolge      bolge
	pbfBoy     int64
}

func sonYapim(ctx context.Context) (string, uint64, error) {
	ist, _ := http.NewRequestWithContext(ctx, "GET", protomapsYapimlar, nil)
	ist.Header.Set("User-Agent", "CLE-Heybe")
	y, err := (&http.Client{Timeout: time.Minute}).Do(ist)
	if err != nil {
		return "", 0, errors.New("internet-yok")
	}
	defer y.Body.Close()
	var yapimlar []struct {
		Key  string `json:"key"`
		Size uint64 `json:"size"`
	}
	if err := json.NewDecoder(io.LimitReader(y.Body, 16<<20)).Decode(&yapimlar); err != nil || len(yapimlar) == 0 {
		return "", 0, errors.New("harita-kaynagi-yok")
	}
	sort.Slice(yapimlar, func(i, j int) bool { return yapimlar[i].Key < yapimlar[j].Key })
	son := yapimlar[len(yapimlar)-1]
	if !regexp.MustCompile(`^\d{8}\.pmtiles$`).MatchString(son.Key) {
		return "", 0, errors.New("harita-kaynagi-yok")
	}
	return protomapsAdres + son.Key, son.Size, nil
}

func basBoy(ctx context.Context, adres string) (int64, error) {
	ist, _ := http.NewRequestWithContext(ctx, "HEAD", adres, nil)
	ist.Header.Set("User-Agent", "CLE-Heybe")
	y, err := (&http.Client{Timeout: time.Minute}).Do(ist)
	if err != nil {
		return 0, err
	}
	y.Body.Close()
	if y.StatusCode != 200 || y.ContentLength <= 0 {
		return 0, fmt.Errorf("boy alınamadı (%d)", y.StatusCode)
	}
	return y.ContentLength, nil
}

func haritaAdi(id string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return '-'
	}, strings.ToLower(id))
}

// haritaTeklifHazirla: indirmeden önce ne kadar yer ve bellek gerektiğini hesaplar (internet gerekir).
func haritaTeklifHazirla(ctx context.Context, id string) (*haritaTeklif, error) {
	var b bolge
	switch id {
	case dunyaGenel, dunyaTam:
		b = bolge{ID: id, Ad: id, Kutu: [4]float64{-180, -85, 180, 85}}
	default:
		bolgeler, _, err := katalogGetir(ctx, false)
		if err != nil {
			return nil, err
		}
		for _, x := range bolgeler {
			if x.ID == id {
				b = x
			}
		}
		if b.ID == "" {
			return nil, errors.New("bolge-yok")
		}
	}
	kaynak, yapimBoy, err := sonYapim(ctx)
	if err != nil {
		return nil, err
	}
	t := &haritaTeklif{Bolge: b.ID, Ad: haritaAdi(b.ID), kaynak: kaynak, bolge: b}
	if id == dunyaTam {
		t.HaritaMB, t.EnCokZ = float64(yapimBoy)/1e6, 15
	} else {
		k := &httpPmKaynak{adres: kaynak, istemci: &http.Client{Timeout: 5 * time.Minute}}
		enCok := uint8(15)
		if id == dunyaGenel {
			enCok = 8 // dünya genel görünüm: şehirler ve ana yollar
		}
		z := pmEnCokZSec(0, enCok, b.Kutu[0], b.Kutu[1], b.Kutu[2], b.Kutu[3])
		p, err := pmPlanla(ctx, k, b.Kutu[0], b.Kutu[1], b.Kutu[2], b.Kutu[3], z)
		if err != nil {
			return nil, err
		}
		t.plan, t.EnCokZ, t.Ayrinti = p, p.Baslik.EnCokZ, p.Baslik.EnCokZ < enCok
		t.HaritaMB = float64(len(p.OnEk)+int(p.Baslik.VeriBoy)) / 1e6
	}
	if b.Pbf != "" {
		boy, err := basBoy(ctx, b.Pbf)
		if err != nil {
			return nil, errors.New("yol-verisi-alinamadi")
		}
		t.pbfBoy, t.YolVar = boy, true
		t.YolMB = float64(boy) / 1e6
		// 09.11 ölçümü: Türkiye .pbf 653 MB → hazırlık tepe belleği 3,1 GB (~4,8 kat); çıktı ~0,8 kat
		t.BellekGB = math.Ceil(float64(boy)*5/1e8) / 10
	}
	gerek := t.HaritaMB + t.YolMB*1.9 // pbf + .rota + .yer, pbf sonra silinir
	t.GerekGB = math.Ceil(gerek/100) / 10
	os.MkdirAll(haritaDir(), 0o755)
	if d, err := diskDurumu(haritaDir()); err == nil {
		t.BosGB = math.Floor(float64(d.bos)/1e8) / 10
		t.Sigar = float64(d.bos) > gerek*1e6*1.05
		t.BuyukDosya = !d.buyukDosya && (t.HaritaMB > 4000 || t.YolMB > 4000)
	} else {
		t.Sigar = true
	}
	return t, nil
}

func haritaIsiYaz(f func(i *haritaIsi)) {
	hIs.mu.Lock()
	defer hIs.mu.Unlock()
	if hIs.is != nil {
		f(hIs.is)
	}
}

func haritaIndirBaslat(t *haritaTeklif) {
	ctx, iptal := context.WithCancel(context.Background())
	hIs.is = &haritaIsi{Bolge: t.Bolge, Ad: t.Ad, Asama: "harita", Basladi: time.Now().Format(time.RFC3339)}
	hIs.iptal = iptal
	go func() {
		err := haritaIndirCalis(ctx, t)
		haritaIsiYaz(func(i *haritaIsi) {
			switch {
			case err == nil:
				i.Asama, i.Oran = "bitti", 1
			case ctx.Err() != nil:
				i.Asama = "durdu"
			default:
				i.Asama, i.Hata = "hata", err.Error()
			}
		})
		if err != nil {
			log.Printf("harita indirme %s: %v", t.Bolge, err)
		}
	}()
}

func haritaIndirCalis(ctx context.Context, t *haritaTeklif) error {
	dir := haritaDir()
	hedef := filepath.Join(dir, t.Ad+".pmtiles")
	k := &httpPmKaynak{adres: t.kaynak, istemci: &http.Client{Timeout: 10 * time.Minute}}
	ilerle := func(inen, toplam uint64) {
		haritaIsiYaz(func(i *haritaIsi) { i.Inen, i.Toplam = inen, toplam; i.Oran = float64(inen) / float64(max(toplam, 1)) })
	}
	plan := t.plan
	if t.Bolge == dunyaTam {
		boy, err := basBoy(ctx, t.kaynak)
		if err != nil {
			return errors.New("harita-kaynagi-yok")
		}
		plan = tamKopyaPlani(t.kaynak, uint64(boy))
	}
	if err := pmIndir(ctx, k, plan, hedef, ilerle); err != nil {
		return err
	}
	bilgi := map[string]any{"ad": t.Ad, "bolge": t.Bolge, "iso": t.bolge.Iso, "isim": t.bolge.Ad, "kaynak": t.kaynak, "tarih": yapimTarihi(t.kaynak),
		"kutu": t.bolge.Kutu, "enCokZ": t.EnCokZ, "yol": t.YolVar, "indirildi": time.Now().Format("2006-01-02")}
	if b, err := json.Marshal(bilgi); err == nil {
		os.WriteFile(filepath.Join(dir, t.Ad+".json"), b, 0o644)
	}
	if !t.YolVar {
		return nil
	}
	haritaIsiYaz(func(i *haritaIsi) { i.Asama, i.Inen, i.Toplam, i.Oran = "yol", 0, uint64(t.pbfBoy), 0 })
	pbf := filepath.Join(dir, t.Ad+".osm.pbf")
	tarih, err := pbfIndir(ctx, t.bolge.Pbf, pbf, ilerle)
	if err != nil {
		return err
	}
	haritaIsiYaz(func(i *haritaIsi) { i.Asama, i.Oran = "hazirlik", 0 })
	err = haritaHazirlaCalistir(ctx, pbf, filepath.Join(dir, t.Ad), tarih, func(satir string) {
		haritaIsiYaz(func(i *haritaIsi) {
			i.Bilgi = satir
			switch {
			case strings.Contains(satir, "1. geçiş"):
				i.Oran = 0.3
			case strings.Contains(satir, "2. geçiş"):
				i.Oran = 0.7
			case strings.Contains(satir, "ağ:"):
				i.Oran = 0.9
			}
		})
	})
	if err != nil {
		return err
	}
	os.Remove(pbf)
	harita.mu.Lock() // yeni ağ ilk rotada açılsın
	if harita.ag != nil && harita.ad == t.Ad {
		harita.ag = nil
	}
	harita.mu.Unlock()
	return nil
}

// haritaHazirlaCalistir: hazırlık ayrı süreçte (bellek yetmezse yalnız o düşer). Sınavda süreç içinde çalıştırılır.
var haritaHazirlaCalistir = func(ctx context.Context, pbf, cikti, tarih string, satir func(string)) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, exe, "-harita-hazirla", pbf, "-harita-cikti", cikti, "-harita-tarih", tarih)
	gizle(cmd)
	cikis, _ := cmd.StdoutPipe()
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return err
	}
	sc := bufio.NewScanner(cikis)
	for sc.Scan() {
		satir(sc.Text())
	}
	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.New("hazirlik-durdu") // çoğu zaman bellek yetmedi
	}
	return nil
}

func yapimTarihi(adres string) string {
	m := regexp.MustCompile(`(\d{4})(\d{2})(\d{2})\.pmtiles$`).FindStringSubmatch(adres)
	if m == nil {
		return ""
	}
	return m[1] + "-" + m[2] + "-" + m[3]
}

// tamKopyaPlani: dosyanın tamamı (dünya, ~139 GB), 32 MB'lık parçalarla, kaldığı yerden sürer.
func tamKopyaPlani(adres string, boy uint64) *pmPlan {
	p := &pmPlan{Imza: "tam:" + adres + fmt.Sprint(boy)}
	p.Baslik.VeriBoy = boy
	for bas := uint64(0); bas < boy; bas += pmParcaBoy {
		son := min(bas+pmParcaBoy, boy)
		p.Parcalar = append(p.Parcalar, pmParca{Bas: bas, Son: son, Bloklar: []pmBlok{{bas, uint32(son - bas)}}})
	}
	return p
}

// pbfIndir: Geofabrik .osm.pbf, kaldığı yerden sürer, MD5 sağlaması tutmazsa siler. Verinin tarihini döndürür.
func pbfIndir(ctx context.Context, adres, hedef string, ilerle func(inen, toplam uint64)) (string, error) {
	// "-latest" adresi günlük adla yönlendirir; aynı dosyayı sürdürmek için günlük adı kullan
	ist, _ := http.NewRequestWithContext(ctx, "HEAD", adres, nil)
	ist.Header.Set("User-Agent", "CLE-Heybe")
	y, err := (&http.Client{Timeout: time.Minute}).Do(ist)
	if err != nil {
		return "", errors.New("internet-yok")
	}
	y.Body.Close()
	gercek := y.Request.URL.String()
	boy := y.ContentLength
	tarih := time.Now().Format("2006-01-02")
	if t, err := http.ParseTime(y.Header.Get("Last-Modified")); err == nil {
		tarih = t.Format("2006-01-02")
	}
	part := hedef + ".part"
	if b, err := os.ReadFile(part + ".adres"); err != nil || string(b) != gercek {
		os.Remove(part)
		os.WriteFile(part+".adres", []byte(gercek), 0o644)
	}
	for deneme := 0; ; deneme++ {
		f, err := os.OpenFile(part, os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return "", err
		}
		once, _ := f.Seek(0, io.SeekEnd)
		if once >= boy {
			f.Close()
			break
		}
		ist, _ := http.NewRequestWithContext(ctx, "GET", gercek, nil)
		ist.Header.Set("User-Agent", "CLE-Heybe")
		ist.Header.Set("Range", fmt.Sprintf("bytes=%d-", once))
		y, err := haritaIstemci.Do(ist)
		if err == nil && y.StatusCode != http.StatusPartialContent {
			y.Body.Close()
			err = fmt.Errorf("aralık verilmedi (%d)", y.StatusCode)
		}
		if err == nil {
			buf := make([]byte, 1<<20)
			inen := once
			for {
				n, rerr := y.Body.Read(buf)
				if n > 0 {
					if _, werr := f.Write(buf[:n]); werr != nil {
						err = werr
						break
					}
					inen += int64(n)
					ilerle(uint64(inen), uint64(boy))
				}
				if rerr != nil {
					if rerr != io.EOF {
						err = rerr
					}
					break
				}
			}
			y.Body.Close()
		}
		f.Close()
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		if err == nil {
			continue
		}
		if deneme >= 8 {
			return "", err
		}
		time.Sleep(time.Duration(deneme+1) * 3 * time.Second)
	}
	// sağlama
	ist2, _ := http.NewRequestWithContext(ctx, "GET", gercek+".md5", nil)
	ist2.Header.Set("User-Agent", "CLE-Heybe")
	y2, err := (&http.Client{Timeout: time.Minute}).Do(ist2)
	if err != nil {
		return "", errors.New("saglama-alinamadi")
	}
	b, _ := io.ReadAll(io.LimitReader(y2.Body, 4096))
	y2.Body.Close()
	alanlar := strings.Fields(string(b))
	if y2.StatusCode != 200 || len(alanlar) == 0 || len(alanlar[0]) != 32 {
		return "", errors.New("saglama-alinamadi")
	}
	f, err := os.Open(part)
	if err != nil {
		return "", err
	}
	h := md5.New()
	_, err = io.Copy(h, f)
	f.Close()
	if err != nil {
		return "", err
	}
	if hex.EncodeToString(h.Sum(nil)) != strings.ToLower(alanlar[0]) {
		os.Remove(part)
		return "", errors.New("saglama-tutmadi")
	}
	if err := os.Rename(part, hedef); err != nil {
		return "", err
	}
	os.Remove(part + ".adres")
	return tarih, nil
}

// Kapılar
func apiHaritaKatalog(w http.ResponseWriter, r *http.Request) {
	bolgeler, tarih, err := katalogGetir(r.Context(), r.URL.Query().Get("tazele") == "1")
	if err != nil {
		jsonYaz(w, 503, map[string]string{"hata": err.Error()})
		return
	}
	jsonYaz(w, 200, map[string]any{"tarih": tarih, "bolgeler": bolgeler})
}

func apiHaritaIndir(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		hIs.mu.Lock()
		defer hIs.mu.Unlock()
		if hIs.is == nil {
			jsonYaz(w, 200, map[string]any{"asama": ""})
			return
		}
		jsonYaz(w, 200, hIs.is)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	var g struct {
		Bolge string `json:"bolge"`
		Onay  bool   `json:"onay"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&g) != nil || g.Bolge == "" {
		jsonYaz(w, 400, map[string]string{"hata": "istek"})
		return
	}
	hIs.mu.Lock()
	suruyor := hIs.is != nil && (hIs.is.Asama == "harita" || hIs.is.Asama == "yol" || hIs.is.Asama == "hazirlik")
	t := hIs.plan[g.Bolge]
	hIs.mu.Unlock()
	if suruyor {
		jsonYaz(w, 409, map[string]string{"hata": "suruyor"})
		return
	}
	if !g.Onay || t == nil {
		yeni, err := haritaTeklifHazirla(r.Context(), g.Bolge)
		if err != nil {
			kod := 502
			if err == errBolgeBuyuk {
				kod = 422
			}
			jsonYaz(w, kod, map[string]string{"hata": err.Error()})
			return
		}
		hIs.mu.Lock()
		if hIs.plan == nil {
			hIs.plan = map[string]*haritaTeklif{}
		}
		hIs.plan[g.Bolge] = yeni
		hIs.mu.Unlock()
		if !g.Onay {
			jsonYaz(w, 200, yeni)
			return
		}
		t = yeni
	}
	if !t.Sigar || t.BuyukDosya {
		jsonYaz(w, 507, map[string]any{"hata": "yer-yok", "teklif": t})
		return
	}
	hIs.mu.Lock()
	haritaIndirBaslat(t)
	delete(hIs.plan, g.Bolge)
	hIs.mu.Unlock()
	jsonYaz(w, 200, map[string]bool{"basladi": true})
}

func apiHaritaIndirDur(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	hIs.mu.Lock()
	if hIs.iptal != nil {
		hIs.iptal()
	}
	hIs.mu.Unlock()
	jsonYaz(w, 200, map[string]bool{"tamam": true})
}

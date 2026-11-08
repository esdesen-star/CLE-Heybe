// CLE Heybe — yardımcı program (06.11.2026, Özet §27).
//
// Belleğin kökünden çalışır ve kullanıcıya tek adres verir: http://127.0.0.1:8888
//
//	/            → heybe/index.html (arkadaşın sayfası)
//	/kiwix/...   → kütüphane sunucusu (kiwix-serve, 8889, --urlRootLocation /kiwix)
//	/sohbet/...  → sohbet modeli (8080) · /gomme/... → anlam modeli (8081)
//	/cevirmen/... → çevirmen modeli, TranslateGemma (8082) — dil köprüsü (06.11, K17–K18)
//	/benim/...   → kullanıcının kendi dosyaları (heybe/benim/)
//	/api/...     → kitap indirme, dosya yükleme, durum
//
// Heybe bir klasördür (K13): kutuphane/ klasörüne düşen her .zim kitaplığa eklenir; kullanıcının
// seçtiği kitap Kiwix'ten indirilir, imzası doğrulanır, sonra eklenir. Yalnız bu bilgisayardan
// erişilir (127.0.0.1). Belleğe yalnız kutuphane/ ve heybe/benim/ altına yazar.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const surum = "1.5 (07.11.2026, bu cevap yanlış)"

var (
	kok, kutuphaneDir, kutuphaneXML, benimDir, kiwixManage string
	port                                                   int
	izinliHost                                             map[string]bool
)

func programKlasoru() string {
	switch runtime.GOOS {
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return "macos-arm64"
		}
		return "macos-x86_64"
	case "windows":
		return "windows-x86_64"
	default:
		return "linux-" + runtime.GOARCH
	}
}

func main() {
	exe, _ := os.Executable()
	varsayilanKok := filepath.Clean(filepath.Join(filepath.Dir(exe), "..", ".."))
	flag.StringVar(&kok, "kok", varsayilanKok, "belleğin kökü")
	flag.IntVar(&port, "port", 8888, "kullanıcının adresi")
	kiwixPort := flag.Int("kiwix", 8889, "kütüphane sunucusu")
	sohbetPort := flag.Int("sohbet", 8080, "sohbet modeli")
	gommePort := flag.Int("gomme", 8081, "anlam modeli")
	cevirmenPort := flag.Int("cevirmen", 8082, "çevirmen modeli (dil köprüsü)")
	// 08.11 (Özet §59): Linux takılı belleği çoğu zaman program çalıştırma izni olmadan bağlar; Linux başlatıcısı
	// programları bilgisayara kopyalar ve kopyanın klasörünü verir. Boşsa belleğin program/<işletim> klasörü.
	programDir := flag.String("program", "", "programların klasörü (boşsa belleğin program/<işletim> klasörü)")
	flag.Parse()

	kutuphaneDir = filepath.Join(kok, "kutuphane")
	kutuphaneXML = filepath.Join(kutuphaneDir, "kutuphane.xml")
	benimDir = filepath.Join(kok, "heybe", "benim")
	ad := "kiwix-manage"
	if runtime.GOOS == "windows" {
		ad += ".exe"
	}
	kiwixManage = filepath.Join(kok, "program", programKlasoru(), ad)
	if *programDir != "" {
		kiwixManage = filepath.Join(*programDir, ad)
	}
	izinliHost = map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", port): true,
		fmt.Sprintf("localhost:%d", port): true,
	}

	for _, d := range []string{kutuphaneDir, filepath.Join(benimDir, "dosyalar")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			log.Fatalf("klasör açılamadı: %v", err)
		}
	}
	if err := kutuphaneyiHazirla(); err != nil {
		log.Printf("kütüphane listesi: %v", err)
	}
	go listeyiKendiligindenUygula() // kullanıcı seçtiyse listedeki kitaplar internet varken iner ve güncellenir (Ö11)
	go func() {                     // kullanıcı Heybe açıkken klasöre .zim kopyalarsa da görünsün
		for range time.Tick(10 * time.Second) {
			if err := kutuphaneyiHazirla(); err != nil {
				log.Printf("kütüphane listesi: %v", err)
			}
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/kiwix/", vekil(*kiwixPort, ""))
	mux.Handle("/sohbet/", vekil(*sohbetPort, "/sohbet"))
	mux.Handle("/gomme/", vekil(*gommePort, "/gomme"))
	mux.Handle("/cevirmen/", vekil(*cevirmenPort, "/cevirmen"))
	cevirmen.port = *cevirmenPort
	sohbetPortu, gommePortu = *sohbetPort, *gommePort // ilk kurulumda inen modeller bu kapılarda açılır (model.go)
	kapanistaCevirmeniKapat()
	mux.Handle("/benim/", http.StripPrefix("/benim/", dosyaSun(benimDir, true)))
	mux.Handle("/heybe/", http.StripPrefix("/heybe/", dosyaSun(filepath.Join(kok, "heybe"), false)))
	mux.HandleFunc("/api/durum", apiDurum)
	mux.HandleFunc("/api/katalog", apiKatalog)
	mux.HandleFunc("/api/indir", apiIndir)
	mux.HandleFunc("/api/indirmeler", apiIndirmeler)
	mux.HandleFunc("/api/iptal", apiIptal)
	mux.HandleFunc("/api/kaldir", apiKaldir)
	mux.HandleFunc("/api/yukle", apiYukle)
	mux.HandleFunc("/api/benim-sil", apiBenimSil)
	mux.HandleFunc("/api/cevirmen", apiCevirmen)      // çevirmen gerekince açılır (06.11)
	mux.HandleFunc("/api/acil-kart", apiAcilKart)     // açılışta görünen acil kart (Ö14, 06.11)
	mux.HandleFunc("/api/liste", apiListe)            // kullanıcının kitap listesi (Ö11, 07.11)
	mux.HandleFunc("/api/liste-durum", apiListeDurum) // listedekiler bellekte mi, yeni sürüm var mı (internet gerekir)
	mux.HandleFunc("/api/liste-uygula", apiListeUygula)
	mux.HandleFunc("/api/baglanti", apiBaglanti)            // Kiwix dışı .zim / .meta4 bağlantısından kitap (Ercan 07.11)
	mux.HandleFunc("/api/baglanti-dosya", apiBaglantiDosya) // bağlantıdan PDF, metin, resim: sayfanın dosya formuna gelir
	mux.HandleFunc("/api/yanlis", apiYanlis)                // "bu cevap yanlış" kayıtları (Ö18, 07.11): bellekte kalır
	mux.HandleFunc("/api/ayar", apiAyar)                    // açılış dili (07.11 gece): bellekte, bilgisayardan bağımsız
	mux.HandleFunc("/api/modeller", apiModeller)            // ilk kurulum (08.11): eksik modelleri indirir ve açar
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, filepath.Join(kok, "heybe", "index.html"))
	})

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		log.Fatalf("adres kullanımda (%d): %v", port, err)
	}
	log.Printf("Heybe yardımcısı %s · kök %s · http://127.0.0.1:%d/", surum, kok, port)
	srv := &http.Server{Handler: guvenlik(mux), ReadHeaderTimeout: 20 * time.Second}
	log.Fatal(srv.Serve(ln))
}

// ---- güvenlik: yalnız bu bilgisayardaki Heybe sayfası yazabilir ----

func guvenlik(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// başka bir sitenin adını bu bilgisayara yönlendirme hilesine (DNS rebinding) karşı
		if !izinliHost[r.Host] {
			http.Error(w, "izin yok", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if o := r.Header.Get("Origin"); o != "" && !izinliHost[strings.TrimPrefix(o, "http://")] {
				http.Error(w, "izin yok", http.StatusForbidden)
				return
			}
			// özel başlık: başka sitelerin sayfaları bunu soru sormadan gönderemez
			if strings.HasPrefix(r.URL.Path, "/api/") && r.Header.Get("X-Heybe") != "1" {
				http.Error(w, "izin yok", http.StatusForbidden)
				return
			}
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func vekil(hedefPort int, onek string) http.Handler {
	hedef := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", hedefPort)}
	p := httputil.NewSingleHostReverseProxy(hedef)
	icHost := hedef.Host
	eskiYon := p.Director
	p.Director = func(r *http.Request) {
		eskiYon(r)
		r.Host = icHost
		r.Header.Del("Origin")
		if onek != "" {
			r.URL.Path = strings.TrimPrefix(r.URL.Path, onek)
			r.URL.RawPath = ""
		}
	}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "sunucu henüz hazır değil", http.StatusBadGateway)
	}
	return p
}

var izinliUzanti = map[string]string{
	".pdf": "pdf", ".txt": "metin", ".md": "metin",
	".jpg": "resim", ".jpeg": "resim", ".png": "resim", ".gif": "resim", ".webp": "resim",
	".mp4": "video", ".webm": "video", ".m4v": "video", ".mov": "video",
}

// dosyaSun: yalnız dosya verir, klasör listelemez. benim=true ise yalnız izinli türler.
func dosyaSun(dizin string, benim bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		yol := filepath.Join(dizin, filepath.FromSlash(filepath.Clean("/"+r.URL.Path)))
		if !strings.HasPrefix(yol, dizin+string(os.PathSeparator)) {
			http.NotFound(w, r)
			return
		}
		bilgi, err := os.Stat(yol)
		if err != nil || bilgi.IsDir() {
			http.NotFound(w, r)
			return
		}
		uz := strings.ToLower(filepath.Ext(yol))
		if benim && uz != ".json" && izinliUzanti[uz] == "" {
			http.NotFound(w, r)
			return
		}
		if uz == ".txt" || uz == ".md" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, yol)
	})
}

func jsonYaz(w http.ResponseWriter, kod int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(kod)
	_ = json.NewEncoder(w).Encode(v)
}

func hata(w http.ResponseWriter, kod int, mesaj string) {
	jsonYaz(w, kod, map[string]string{"hata": mesaj})
}

func yalnizPost(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost {
		hata(w, http.StatusMethodNotAllowed, "POST gerekli")
		return false
	}
	return true
}

// ---- kütüphane listesi (kiwix-manage) ----

type kitapKaydi struct {
	ID    string `xml:"id,attr"`
	Path  string `xml:"path,attr"`
	Title string `xml:"title,attr"`
	Name  string `xml:"name,attr"`
	Lang  string `xml:"language,attr"`
	Size  int64  `xml:"size,attr"`
}

type kitaplikXML struct {
	Books []kitapKaydi `xml:"book"`
}

var kutuphaneKilit sync.Mutex

func kitaplariOku() ([]kitapKaydi, error) {
	b, err := os.ReadFile(kutuphaneXML)
	if err != nil {
		return nil, err
	}
	var k kitaplikXML
	if err := xml.Unmarshal(b, &k); err != nil {
		return nil, err
	}
	return k.Books, nil
}

func manage(args ...string) error {
	cmd := exec.Command(kiwixManage, append([]string{"kutuphane.xml"}, args...)...)
	cmd.Dir = kutuphaneDir
	gizle(cmd)
	cikti, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("kiwix-manage %v: %v %s", args, err, strings.TrimSpace(string(cikti)))
	}
	return nil
}

// kutuphaneyiHazirla: liste yoksa boş liste açar; klasörde olup listede olmayan .zim'leri ekler.
func kutuphaneyiHazirla() error {
	kutuphaneKilit.Lock()
	defer kutuphaneKilit.Unlock()
	if _, err := os.Stat(kutuphaneXML); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(kutuphaneXML, []byte("<library version=\"20110515\">\n</library>\n"), 0o644); err != nil {
			return err
		}
	}
	kitaplar, err := kitaplariOku()
	if err != nil {
		return err
	}
	var listede = map[string]bool{}
	for _, k := range kitaplar {
		listede[strings.ToLower(filepath.Base(filepath.FromSlash(k.Path)))] = true
	}
	girdiler, err := os.ReadDir(kutuphaneDir)
	if err != nil {
		return err
	}
	for _, g := range girdiler {
		ad := g.Name()
		if g.IsDir() || strings.HasPrefix(ad, ".") || !strings.HasSuffix(strings.ToLower(ad), ".zim") || listede[strings.ToLower(ad)] {
			continue
		}
		if indiriliyor(ad) {
			continue
		}
		if err := manage("add", ad); err != nil {
			log.Printf("eklenemedi %s: %v", ad, err)
			continue
		}
		log.Printf("kütüphaneye eklendi: %s", ad)
	}
	return nil
}

// ---- durum ----

func apiDurum(w http.ResponseWriter, r *http.Request) {
	d, err := diskDurumu(kok)
	cevap := map[string]any{"surum": surum, "isletim": runtime.GOOS}
	if err == nil {
		cevap["bos"] = d.bos
		cevap["toplam"] = d.toplam
		cevap["dosyaSistemi"] = d.dosyaSistemi
		if u := urunSurumu(); u != "" { // ürün sürümü tek yerde (06.11); okuyan tek işlev (07.11, yanlis.go)
			cevap["surum"] = u
		}
		cevap["buyukDosya"] = d.buyukDosya
	} else {
		cevap["diskHata"] = err.Error()
	}
	if kitaplar, err := kitaplariOku(); err == nil {
		liste := []map[string]any{}
		for _, k := range kitaplar {
			liste = append(liste, map[string]any{"id": k.ID, "dosya": filepath.Base(filepath.FromSlash(k.Path)), "baslik": k.Title,
				"seri": k.Name, "dil": k.Lang, "boyut": k.Size * 1024})
		}
		cevap["kitaplar"] = liste
	}
	cevap["disKaynak"] = disKaynakOku()        // Kiwix dışı kitaplar: dosya → {adres, imzali}
	cevap["modelEksik"] = len(eksikModeller()) // ilk kurulum (08.11): sayfa kurulum kartını gösterir
	jsonYaz(w, 200, cevap)
}

// ---- Kiwix kataloğu (internet varken) ----

// yönlendirme yerel ağa gidemez (Kiwix aynaları ve "bağlantıdan ekle" aynı kuralla — 07.11)
var istemci = &http.Client{Timeout: 25 * time.Second, CheckRedirect: guvenliYonlendirme}

func guvenliYonlendirme(r *http.Request, via []*http.Request) error {
	if len(via) > 8 {
		return errors.New("çok fazla yönlendirme")
	}
	return adresGuvenli(r.URL)
}

func apiKatalog(w http.ResponseWriter, r *http.Request) {
	q := url.Values{}
	for _, a := range []string{"lang", "q", "start", "count", "category", "name"} {
		if v := r.URL.Query().Get(a); v != "" {
			q.Set(a, v)
		}
	}
	if q.Get("count") == "" {
		q.Set("count", "60")
	}
	yanit, err := istemci.Get("https://opds.library.kiwix.org/catalog/v2/entries?" + q.Encode())
	if err != nil {
		hata(w, http.StatusServiceUnavailable, "internet yok ya da Kiwix kataloğuna ulaşılamadı")
		return
	}
	defer yanit.Body.Close()
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(yanit.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(yanit.Body, 20<<20))
}

// ---- indirme ----

type indirme struct {
	Ad        string  `json:"ad"`
	Boyut     int64   `json:"boyut"`
	Inen      int64   `json:"inen"`
	Durum     string  `json:"durum"` // hazirlaniyor · iniyor · dogrulaniyor · ekleniyor · bitti · durdu · hata
	Hata      string  `json:"hata,omitempty"`
	Hiz       float64 `json:"hiz"` // bayt/sn
	iptal     context.CancelFunc
	meta4     string
	kilit     sync.Mutex
	sil       bool   // vazgeçildi: yarım dosya da silinsin
	eski      string // güncelleme: yenisi doğrulanıp eklenince kaldırılacak eski kitap dosyası (Ö11)
	dis       bool   // Kiwix dışı bağlantı (Ercan 07.11): kitaplıkta ve cevapta "Kiwix dışı" diye görünür
	dogrudan  bool   // .zim'in kendisine bağlantı: metalink ve imza yok
	parcaYolu string // model indirmesi (08.11, model.go): yarım dosya kütüphanede değil model klasöründe
}

var (
	indirmeler   = map[string]*indirme{}
	indirmeKilit sync.Mutex
	zimAdi       = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*\.zim$`)
)

func indiriliyor(dosya string) bool {
	indirmeKilit.Lock()
	defer indirmeKilit.Unlock()
	for _, i := range indirmeler {
		if strings.EqualFold(i.Ad, dosya) && i.Durum != "bitti" && i.Durum != "hata" && i.Durum != "durdu" {
			return true
		}
	}
	return false
}

func (i *indirme) yaz(f func(*indirme)) {
	i.kilit.Lock()
	f(i)
	i.kilit.Unlock()
}

type metalink struct {
	Files []struct {
		Name   string `xml:"name,attr"`
		Size   int64  `xml:"size"`
		Hashes []struct {
			Type  string `xml:"type,attr"`
			Value string `xml:",chardata"`
		} `xml:"hash"`
		URLs []struct {
			Priority int    `xml:"priority,attr"`
			Value    string `xml:",chardata"`
		} `xml:"url"`
	} `xml:"file"`
}

func kiwixAdresi(s string) (*url.URL, bool) {
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "https" {
		return nil, false
	}
	h := strings.ToLower(u.Hostname())
	return u, h == "kiwix.org" || strings.HasSuffix(h, ".kiwix.org")
}

func apiIndir(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		Meta4 string `json:"meta4"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&istek); err != nil {
		hata(w, 400, "istek okunamadı")
		return
	}
	ad, kod, err := indirmeBaslat(istek.Meta4, "")
	if err != nil {
		hata(w, kod, err.Error())
		return
	}
	jsonYaz(w, 200, map[string]string{"ad": ad})
}

// indirmeBaslat: sayfanın "İndir" düğmesi ve liste (Ö11) aynı yoldan indirir — kural tek yerde.
// eski verilirse yeni kitap imzası tutup kitaplığa eklenince eski dosya kaldırılır (güncelleme).
func indirmeBaslat(meta4, eski string) (string, int, error) {
	if _, ok := kiwixAdresi(meta4); !ok || !strings.HasSuffix(meta4, ".meta4") {
		return "", 400, errors.New("yalnız Kiwix'in kendi adresinden indirilir")
	}
	return indirmeKur(meta4, eski, false, false)
}

func indirmeKur(meta4, eski string, dis, dogrudan bool) (string, int, error) {
	u, _ := url.Parse(meta4)
	ad := strings.TrimSuffix(filepath.Base(u.Path), ".meta4")
	if !zimAdi.MatchString(ad) {
		return "", 400, errors.New("geçersiz dosya adı")
	}
	indirmeKilit.Lock()
	defer indirmeKilit.Unlock()
	if onceki, var_ := indirmeler[ad]; var_ && onceki.Durum != "bitti" && onceki.Durum != "hata" && onceki.Durum != "durdu" {
		return "", 409, errors.New("bu kitap zaten iniyor")
	}
	ctx, iptal := context.WithCancel(context.Background())
	i := &indirme{Ad: ad, Durum: "hazirlaniyor", iptal: iptal, meta4: meta4, eski: eski, dis: dis, dogrudan: dogrudan}
	indirmeler[ad] = i
	go indir(ctx, i)
	return ad, 200, nil
}

func apiIndirmeler(w http.ResponseWriter, r *http.Request) {
	type ozet struct {
		Ad    string  `json:"ad"`
		Boyut int64   `json:"boyut"`
		Inen  int64   `json:"inen"`
		Durum string  `json:"durum"`
		Hata  string  `json:"hata,omitempty"`
		Hiz   float64 `json:"hiz"`
		Meta4 string  `json:"meta4"`
	}
	indirmeKilit.Lock()
	liste := []ozet{}
	for _, i := range indirmeler {
		i.kilit.Lock()
		liste = append(liste, ozet{i.Ad, i.Boyut, i.Inen, i.Durum, i.Hata, i.Hiz, i.meta4})
		i.kilit.Unlock()
	}
	indirmeKilit.Unlock()
	sort.Slice(liste, func(a, b int) bool { return liste[a].Ad < liste[b].Ad })
	jsonYaz(w, 200, liste)
}

func apiIptal(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		Ad  string `json:"ad"`
		Sil bool   `json:"sil"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&istek)
	indirmeKilit.Lock()
	i := indirmeler[istek.Ad]
	indirmeKilit.Unlock()
	if i == nil {
		hata(w, 404, "böyle bir indirme yok")
		return
	}
	if istek.Sil && i.Durum == "durdu" { // zaten durmuş: yarım dosyayı sil
		parca := filepath.Join(kutuphaneDir, i.Ad+".part")
		if i.parcaYolu != "" {
			parca = i.parcaYolu
		}
		os.Remove(parca)
		i.yaz(func(i *indirme) { i.Inen = 0 })
	}
	i.yaz(func(i *indirme) { i.sil = istek.Sil })
	i.iptal()
	jsonYaz(w, 200, map[string]string{"durum": "durduruluyor"})
}

func indir(ctx context.Context, i *indirme) {
	fail := func(m string) {
		i.yaz(func(i *indirme) { i.Durum, i.Hata = "hata", m })
		log.Printf("indirme hatası %s: %s", i.Ad, m)
	}
	// 1. boyut, imza, aynalar: Kiwix'in metalink'inden; Kiwix dışı doğrudan .zim bağlantısında yalnız boyut (imza yok)
	var boyut int64
	imza := ""
	var aynalar []string
	if i.dogrudan {
		bas, err := istemci.Head(i.meta4)
		if err != nil {
			fail("bağlantıya ulaşılamadı")
			return
		}
		bas.Body.Close()
		if bas.StatusCode != http.StatusOK || bas.ContentLength <= 0 {
			fail(fmt.Sprintf("bağlantı dosyanın boyutunu vermiyor (HTTP %d)", bas.StatusCode))
			return
		}
		boyut, aynalar = bas.ContentLength, []string{i.meta4}
	} else {
		yanit, err := istemci.Get(i.meta4)
		if err != nil {
			fail("internet yok ya da Kiwix'e ulaşılamadı")
			return
		}
		govde, _ := io.ReadAll(io.LimitReader(yanit.Body, 1<<20))
		yanit.Body.Close()
		var m metalink
		if err := xml.Unmarshal(govde, &m); err != nil || len(m.Files) != 1 {
			fail("indirme bilgisi okunamadı")
			return
		}
		f := m.Files[0]
		if f.Name != i.Ad || f.Size <= 0 {
			fail("indirme bilgisi beklenen kitapla uyuşmuyor")
			return
		}
		for _, h := range f.Hashes {
			if h.Type == "sha-256" {
				imza = strings.ToLower(strings.TrimSpace(h.Value))
			}
		}
		if len(imza) != 64 {
			fail("kitabın imzası (sha-256) yok; doğrulanamayacak dosya indirilmez")
			return
		}
		sort.SliceStable(f.URLs, func(a, b int) bool { return f.URLs[a].Priority < f.URLs[b].Priority })
		for _, u := range f.URLs {
			if p, err := url.Parse(strings.TrimSpace(u.Value)); err == nil && p.Scheme == "https" {
				aynalar = append(aynalar, p.String())
			}
		}
		boyut = f.Size
	}
	if len(aynalar) == 0 {
		fail("güvenli indirme adresi yok")
		return
	}
	f := struct{ Size int64 }{boyut}
	hedef := filepath.Join(kutuphaneDir, i.Ad)
	parca := hedef + ".part"
	if _, err := os.Stat(hedef); err == nil {
		fail("bu kitap zaten kütüphanede")
		return
	}
	// 2. yer var mı, dosya sistemi büyük dosya alır mı
	var once int64
	if b, err := os.Stat(parca); err == nil {
		once = b.Size()
	}
	if d, err := diskDurumu(kutuphaneDir); err == nil {
		if f.Size >= 4<<30 && !d.buyukDosya {
			fail(fmt.Sprintf("Bellek %s biçiminde: 4 GB'tan büyük dosya alamaz. Belleği exFAT biçimlendirmek gerekir.", d.dosyaSistemi))
			return
		}
		if uint64(f.Size-once)+(200<<20) > d.bos {
			fail(fmt.Sprintf("Yer yetmiyor: %s gerekli, %s boş.", insanca(f.Size-once), insanca(int64(d.bos))))
			return
		}
	}
	i.yaz(func(i *indirme) { i.Boyut, i.Inen, i.Durum = f.Size, once, "iniyor" })

	// 3. indir (kesilirse kaldığı yerden; ayna bozuksa sıradakine geç)
	var sonHata error
	for deneme := 0; deneme < 2*len(aynalar); deneme++ {
		if ctx.Err() != nil {
			break
		}
		sonHata = parcaIndir(ctx, aynalar[deneme%len(aynalar)], parca, f.Size, i)
		if sonHata == nil {
			break
		}
		log.Printf("indirme kesildi (%s): %v", i.Ad, sonHata)
		select {
		case <-ctx.Done():
		case <-time.After(3 * time.Second):
		}
	}
	if ctx.Err() != nil {
		if b, err := os.Stat(parca); err == nil {
			i.yaz(func(i *indirme) { i.Inen = b.Size() })
		}
		i.kilit.Lock()
		sil := i.sil
		i.kilit.Unlock()
		if sil {
			os.Remove(parca)
			i.yaz(func(i *indirme) { i.Inen = 0 })
		}
		i.yaz(func(i *indirme) { i.Durum = "durdu"; i.Hiz = 0 })
		return
	}
	if sonHata != nil {
		fail("indirme tamamlanamadı: " + sonHata.Error())
		return
	}
	// 4. imza (Kiwix dışı doğrudan bağlantıda imza yok: kitaplığa eklenebiliyorsa geçerli ZIM'dir, "imzasız" diye işaretlenir)
	i.yaz(func(i *indirme) { i.Durum = "dogrulaniyor"; i.Hiz = 0 })
	if h, err := dosyaImzasi(parca); err != nil || (!i.dogrudan && h != imza) {
		os.Remove(parca)
		fail("dosyanın imzası tutmadı; bozuk dosya silindi, yeniden indirilmeli")
		return
	}
	if err := os.Rename(parca, hedef); err != nil {
		fail("dosya yerine konamadı: " + err.Error())
		return
	}
	// 5. kitaplığa ekle (kiwix-serve -M listeyi izliyor, kendiliğinden görür)
	i.yaz(func(i *indirme) { i.Durum = "ekleniyor" })
	kutuphaneKilit.Lock()
	err := manage("add", i.Ad)
	kutuphaneKilit.Unlock()
	if err != nil {
		if i.dogrudan { // geçerli bir ZIM değil: sil
			os.Remove(hedef)
		}
		fail("kitaplığa eklenemedi: " + err.Error())
		return
	}
	if i.dis {
		disKaynakYaz(i.Ad, i.meta4, !i.dogrudan)
	}
	i.yaz(func(i *indirme) { i.Durum = "bitti"; i.Inen = i.Boyut })
	log.Printf("indirildi ve eklendi: %s", i.Ad)
	if i.eski != "" && i.eski != i.Ad { // güncelleme: yenisi imzasıyla yerinde → eskisi kaldırılır (K5, Ö11)
		if durum, err := kitapKaldirDosya(i.eski); err != nil {
			log.Printf("eski sürüm kaldırılamadı %s: %v", i.eski, err)
		} else {
			log.Printf("eski sürüm: %s — %s", i.eski, durum)
		}
	}
}

func parcaIndir(ctx context.Context, adres, parca string, boyut int64, i *indirme) error {
	dosya, err := os.OpenFile(parca, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer dosya.Close()
	once, err := dosya.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}
	if once >= boyut {
		if once > boyut {
			return errors.New("dosya beklenenden büyük")
		}
		return nil
	}
	istek, _ := http.NewRequestWithContext(ctx, http.MethodGet, adres, nil)
	if once > 0 {
		istek.Header.Set("Range", fmt.Sprintf("bytes=%d-", once))
	}
	uzun := &http.Client{Timeout: 0, CheckRedirect: guvenliYonlendirme, Transport: &http.Transport{ResponseHeaderTimeout: 30 * time.Second,
		Proxy: http.ProxyFromEnvironment}}
	yanit, err := uzun.Do(istek)
	if err != nil {
		return err
	}
	defer yanit.Body.Close()
	switch {
	case once > 0 && yanit.StatusCode == http.StatusPartialContent:
	case yanit.StatusCode == http.StatusOK:
		if once > 0 { // ayna kaldığı yerden vermiyor: baştan
			if err := dosya.Truncate(0); err != nil {
				return err
			}
			if _, err := dosya.Seek(0, io.SeekStart); err != nil {
				return err
			}
			once = 0
		}
	default:
		return fmt.Errorf("ayna %d döndü", yanit.StatusCode)
	}
	i.yaz(func(i *indirme) { i.Inen = once })
	tampon := make([]byte, 1<<20)
	yazici := bufio.NewWriterSize(dosya, 4<<20)
	pencereBas, pencereInen := time.Now(), once
	for {
		n, okErr := yanit.Body.Read(tampon)
		if n > 0 {
			if _, err := yazici.Write(tampon[:n]); err != nil {
				return err
			}
			once += int64(n)
			if gecen := time.Since(pencereBas); gecen > time.Second {
				hiz := float64(once-pencereInen) / gecen.Seconds()
				pencereBas, pencereInen = time.Now(), once
				i.yaz(func(i *indirme) { i.Inen, i.Hiz = once, hiz })
			}
		}
		if okErr == io.EOF {
			break
		}
		if okErr != nil {
			yazici.Flush()
			return okErr
		}
	}
	if err := yazici.Flush(); err != nil {
		return err
	}
	if err := dosya.Sync(); err != nil {
		return err
	}
	i.yaz(func(i *indirme) { i.Inen = once })
	if once != boyut {
		return fmt.Errorf("eksik indi: %d / %d", once, boyut)
	}
	return nil
}

func dosyaImzasi(yol string) (string, error) {
	f, err := os.Open(yol)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.CopyBuffer(h, f, make([]byte, 4<<20)); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func insanca(b int64) string {
	switch {
	case b >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(b)/(1<<30))
	case b >= 1<<20:
		return fmt.Sprintf("%.0f MB", float64(b)/(1<<20))
	default:
		return fmt.Sprintf("%d KB", b/1024)
	}
}

// ---- kitap kaldırma (kullanıcının kendi eli; sayfa önce onay ister) ----

func apiKaldir(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&istek)
	durum, kod, err := kitapKaldir(func(k kitapKaydi) bool { return k.ID == istek.ID })
	if err != nil {
		hata(w, kod, err.Error())
		return
	}
	jsonYaz(w, 200, map[string]string{"durum": durum})
}

// kitapKaldirDosya: güncellemede eski sürümü dosya adıyla kaldırır (aynı yol: kitapKaldir). Eski sürüm listede yoksa
// (07.11 sınavı: aynı kimlikli iki dosyada kütüphane kaydı yenisine geçmişti) dosyası yine silinir; yoksa klasör
// izleyicisi onu 10 saniyede geri ekler.
func kitapKaldirDosya(dosya string) (string, error) {
	durum, kod, err := kitapKaldir(func(k kitapKaydi) bool {
		return strings.EqualFold(filepath.Base(filepath.FromSlash(k.Path)), dosya)
	})
	if kod == 404 {
		yol := filepath.Join(kutuphaneDir, filepath.Base(dosya))
		if strings.HasSuffix(strings.ToLower(yol), ".zim") {
			if e := os.Remove(yol); e == nil {
				return "listede yoktu; dosyası silindi", nil
			}
		}
	}
	return durum, err
}

// kitapKaldir: kitabı kütüphane listesinden çıkarır, sonra dosyasını siler — sayfanın "Kaldır"ı ve güncelleme ortak
func kitapKaldir(secilen func(kitapKaydi) bool) (string, int, error) {
	kutuphaneKilit.Lock()
	defer kutuphaneKilit.Unlock()
	kitaplar, err := kitaplariOku()
	if err != nil {
		return "", 500, errors.New("kütüphane listesi okunamadı")
	}
	var bulunan *kitapKaydi
	for k := range kitaplar {
		if secilen(kitaplar[k]) {
			bulunan = &kitaplar[k]
		}
	}
	if bulunan == nil {
		return "", 404, errors.New("böyle bir kitap yok")
	}
	dosya := filepath.Join(kutuphaneDir, filepath.Base(filepath.FromSlash(bulunan.Path)))
	if !strings.HasSuffix(strings.ToLower(dosya), ".zim") {
		return "", 400, errors.New("yalnız kütüphane kitapları kaldırılır")
	}
	if err := manage("remove", bulunan.ID); err != nil {
		return "", 500, err
	}
	// kütüphane sunucusu listeyi yenileyip dosyayı bırakana kadar bekle (Windows açık dosyayı silmez)
	var silErr error
	for k := 0; k < 20; k++ {
		if silErr = os.Remove(dosya); silErr == nil || errors.Is(silErr, os.ErrNotExist) {
			silErr = nil
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if silErr != nil {
		return "listeden çıkarıldı; dosya Heybe kapanınca silinebilir", 200, nil
	}
	return "kaldırıldı", 200, nil
}

// ---- kullanıcının kendi dosyaları ----

type paragraf struct {
	Bolum string `json:"bolum"`
	Metin string `json:"metin"`
}

type benimDosya struct {
	ID          string     `json:"id"`
	Baslik      string     `json:"baslik"`
	Aciklama    string     `json:"aciklama"`
	Dil         string     `json:"dil"`
	Tur         string     `json:"tur"`
	Dosya       string     `json:"dosya"`
	Boyut       int64      `json:"boyut"`
	Tarih       string     `json:"tarih"`
	Paragraflar []paragraf `json:"paragraflar"`
}

type benimDizin struct {
	Surum    int          `json:"surum"`
	Dosyalar []benimDosya `json:"dosyalar"`
}

var benimKilit sync.Mutex

func dizinOku() benimDizin {
	d := benimDizin{Surum: 1, Dosyalar: []benimDosya{}}
	if b, err := os.ReadFile(filepath.Join(benimDir, "dizin.json")); err == nil {
		_ = json.Unmarshal(b, &d)
	}
	if d.Dosyalar == nil {
		d.Dosyalar = []benimDosya{}
	}
	return d
}

// dizinYaz: kullanıcının dosya dizinini güvenli yazar
func dizinYaz(d benimDizin) error {
	b, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		return err
	}
	return guvenliYaz(filepath.Join(benimDir, "dizin.json"), b)
}

// guvenliYaz: güvenli yazma (Ö1) — geçici dosya + diske zorlama + bir önceki sürüm yedek + yerine koyma.
// Dizin ve acil kart aynı yoldan yazılır (kural tek yerde, 06.11).
func guvenliYaz(yol string, b []byte) error {
	gecici := yol + ".yeni"
	f, err := os.Create(gecici)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if eski, err := os.ReadFile(yol); err == nil {
		_ = os.WriteFile(yol+".onceki", eski, 0o644)
	}
	return os.Rename(gecici, yol)
}

func guvenliAd(ad, uz string) string {
	ad = strings.TrimSuffix(filepath.Base(ad), filepath.Ext(ad))
	var s strings.Builder
	for _, r := range ad {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			s.WriteRune(r)
		case r == '-' || r == '_' || r == ' ' || r == '.':
			s.WriteRune('_')
		}
		if s.Len() > 80 {
			break
		}
	}
	temiz := strings.Trim(s.String(), "_")
	if temiz == "" {
		temiz = "dosya"
	}
	aday := temiz + uz
	for n := 2; ; n++ {
		if _, err := os.Stat(filepath.Join(benimDir, "dosyalar", aday)); errors.Is(err, os.ErrNotExist) {
			return aday
		}
		aday = fmt.Sprintf("%s-%d%s", temiz, n, uz)
	}
}

func rastgeleID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var (
	cumleSonu = regexp.MustCompile(`([.!?…:;])\s+`)
	bosSatir  = regexp.MustCompile(`\n\s*\n`)
)

// paragraflaraBol: sayfa ("\f") ve boş satır kesin sınırdır; uzun bölümler cümle sınırından ~900 harfe bölünür,
// kısa satırlar birleştirilir (PDF'ten gelen metin satır satırdır).
func paragraflaraBol(metin, sayfaKelime string) []paragraf {
	var sonuc []paragraf
	sayfalar := strings.Split(strings.ReplaceAll(metin, "\r\n", "\n"), "\f")
	for si, sayfa := range sayfalar {
		bolum := ""
		if len(sayfalar) > 1 {
			bolum = fmt.Sprintf("%s %d", sayfaKelime, si+1)
		}
		for _, blok := range bosSatir.Split(sayfa, -1) {
			blok = strings.Join(strings.Fields(blok), " ")
			if blok == "" {
				continue
			}
			cumleler := cumleSonu.ReplaceAllString(blok, "$1\x00")
			var parca strings.Builder
			for _, c := range strings.Split(cumleler, "\x00") {
				if parca.Len() > 0 && utf8.RuneCountInString(parca.String())+utf8.RuneCountInString(c) > 900 {
					sonuc = append(sonuc, paragraf{bolum, parca.String()})
					parca.Reset()
				}
				if parca.Len() > 0 {
					parca.WriteString(" ")
				}
				parca.WriteString(c)
			}
			if parca.Len() > 0 {
				// çok kısa parçayı (başlık, tek satır) bir öncekiyle birleştir
				if n := len(sonuc); n > 0 && sonuc[n-1].Bolum == bolum && utf8.RuneCountInString(parca.String()) < 200 &&
					utf8.RuneCountInString(sonuc[n-1].Metin) < 700 {
					sonuc[n-1].Metin += " " + parca.String()
				} else {
					sonuc = append(sonuc, paragraf{bolum, parca.String()})
				}
			}
		}
	}
	return sonuc
}

func apiYukle(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	okuyucu, err := r.MultipartReader()
	if err != nil {
		hata(w, 400, "dosya okunamadı")
		return
	}
	alan := map[string]string{}
	var kayitAdi, uz, tur string
	var boyut int64
	for {
		p, err := okuyucu.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			hata(w, 400, "yükleme yarıda kesildi")
			return
		}
		if p.FormName() != "dosya" {
			b, _ := io.ReadAll(io.LimitReader(p, 50<<20))
			alan[p.FormName()] = string(b)
			continue
		}
		uz = strings.ToLower(filepath.Ext(p.FileName()))
		tur = izinliUzanti[uz]
		if tur == "" {
			hata(w, 400, "bu dosya türü alınmıyor (PDF, TXT, resim, video)")
			return
		}
		if uz == ".jpeg" {
			uz = ".jpg"
		}
		benimKilit.Lock()
		kayitAdi = guvenliAd(p.FileName(), uz)
		hedef := filepath.Join(benimDir, "dosyalar", kayitAdi)
		boyut, err = dosyayaYaz(p, hedef)
		benimKilit.Unlock()
		if err != nil {
			os.Remove(hedef)
			hata(w, 500, err.Error())
			return
		}
	}
	if kayitAdi == "" {
		hata(w, 400, "dosya yok")
		return
	}
	hedef := filepath.Join(benimDir, "dosyalar", kayitAdi)
	dil := alan["dil"]
	if dil != "en" && dil != "cs" {
		dil = "tr"
	}
	baslik := strings.TrimSpace(alan["baslik"])
	if baslik == "" {
		baslik = strings.TrimSuffix(kayitAdi, uz)
	}
	aciklama := strings.TrimSpace(alan["aciklama"])
	metin := alan["metin"]
	if tur == "metin" {
		b, _ := os.ReadFile(hedef)
		if len(b) > 20<<20 {
			b = b[:20<<20]
		}
		metin = strings.ToValidUTF8(string(b), "")
	}
	if (tur == "resim" || tur == "video") && aciklama == "" {
		os.Remove(hedef)
		hata(w, 400, "resim ve videoya kısa bir açıklama gerekli; arkadaş onu bu açıklamadan bulur")
		return
	}
	sayfa := map[string]string{"tr": "s.", "en": "p.", "cs": "s."}[dil]
	paragraflar := paragraflaraBol(metin, sayfa)
	if aciklama != "" {
		paragraflar = append([]paragraf{{"", baslik + ". " + aciklama}}, paragraflar...)
	}
	if len(paragraflar) == 0 {
		os.Remove(hedef)
		hata(w, 400, "dosyada okunabilir metin bulunamadı (taranmış PDF olabilir); bir açıklama yazıp yeniden dene")
		return
	}
	kayit := benimDosya{ID: rastgeleID(), Baslik: baslik, Aciklama: aciklama, Dil: dil, Tur: tur,
		Dosya: "dosyalar/" + kayitAdi, Boyut: boyut, Tarih: time.Now().Format(time.RFC3339), Paragraflar: paragraflar}
	benimKilit.Lock()
	d := dizinOku()
	d.Dosyalar = append(d.Dosyalar, kayit)
	err = dizinYaz(d)
	benimKilit.Unlock()
	if err != nil {
		os.Remove(hedef)
		hata(w, 500, "dizin yazılamadı: "+err.Error())
		return
	}
	jsonYaz(w, 200, map[string]any{"id": kayit.ID, "dosya": kayit.Dosya, "paragraf": len(paragraflar)})
}

func dosyayaYaz(p *multipart.Part, hedef string) (int64, error) {
	if d, err := diskDurumu(benimDir); err == nil && d.bos < 300<<20 {
		return 0, errors.New("bellekte yer kalmadı")
	}
	f, err := os.OpenFile(hedef, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(f, p)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return n, err
}

func apiBenimSil(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&istek)
	benimKilit.Lock()
	defer benimKilit.Unlock()
	d := dizinOku()
	kalan := d.Dosyalar[:0]
	var silinen *benimDosya
	for k := range d.Dosyalar {
		if d.Dosyalar[k].ID == istek.ID {
			s := d.Dosyalar[k]
			silinen = &s
			continue
		}
		kalan = append(kalan, d.Dosyalar[k])
	}
	if silinen == nil {
		hata(w, 404, "böyle bir dosya yok")
		return
	}
	d.Dosyalar = kalan
	if err := dizinYaz(d); err != nil {
		hata(w, 500, "dizin yazılamadı")
		return
	}
	_ = os.Remove(filepath.Join(benimDir, "dosyalar", filepath.Base(silinen.Dosya)))
	jsonYaz(w, 200, map[string]string{"durum": "silindi"})
}

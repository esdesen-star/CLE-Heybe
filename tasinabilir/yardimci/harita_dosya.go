package main

// Dosyadan harita ekleme ve haritayı kaldırma (09.11.2026, Özet §80 · Ercan: "Harita ekleme iki biçimde olsun").
// Başka bir Heybe'den ya da bir kurumdan gelen hazır dosyalar eklenir:
//   .pmtiles (görüntü) · .rota + .yer (yol tarifi, Heybe'nin kendi biçimi) · .json (bilgi) · .osm.pbf (yol verisi → burada hazırlanır).
// Dosya önce denetlenir (biçimi tanınmazsa kaydedilmez); büyük dosyalar belleğe alınmadan diske akar.

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const haritaDosyaAzami = 200 << 30 // 200 GB (dünya haritası ~139 GB)

// haritaDosyaTuru: dosya adından tür ve gövde ("Hatay İli.osm.pbf" → "pbf", "Hatay İli").
func haritaDosyaTuru(ad string) (tur, govde string) {
	k := strings.ToLower(ad)
	for _, uz := range []string{".osm.pbf", ".pbf", ".pmtiles", ".rota", ".yer", ".json"} {
		if strings.HasSuffix(k, uz) {
			t := strings.TrimPrefix(uz, ".")
			if t == "osm.pbf" {
				t = "pbf"
			}
			return t, ad[:len(ad)-len(uz)]
		}
	}
	return "", ""
}

// haritaDosyaDenetle: yazılan dosyanın gerçekten o biçimde olduğuna bakar.
func haritaDosyaDenetle(yol, tur string) error {
	f, err := os.Open(yol)
	if err != nil {
		return err
	}
	defer f.Close()
	bas := make([]byte, 16384)
	n, _ := io.ReadFull(f, bas)
	bas = bas[:n]
	switch tur {
	case "pmtiles":
		_, err := pmBaslikOku(bas)
		return err
	case "rota":
		_, err := rotaOzetOku(yol)
		return err
	case "yer":
		satir, _, _ := bufio.NewReader(bytes.NewReader(bas)).ReadLine()
		if len(strings.Split(string(satir), "\t")) != 6 {
			return errors.New("yer dizini değil")
		}
	case "json":
		var m map[string]any
		if json.Unmarshal(bas, &m) != nil {
			return errors.New("json değil")
		}
	case "pbf":
		if !bytes.Contains(bas[:min(len(bas), 64)], []byte("OSMHeader")) && !bytes.Contains(bas[:min(len(bas), 64)], []byte("OSMData")) {
			return errors.New("pbf değil")
		}
	}
	return nil
}

// pmtilesBilgi: eklenen .pmtiles için bilgi dosyası yoksa başlıktan çıkarılır (sınırlar; tarih üst bilgide varsa).
func pmtilesBilgi(yol, ad, isim string) {
	j := filepath.Join(haritaDir(), ad+".json")
	if _, err := os.Stat(j); err == nil {
		return
	}
	f, err := os.Open(yol)
	if err != nil {
		return
	}
	defer f.Close()
	k := dosyaPmKaynak{f}
	b0, err := k.Oku(context.Background(), 0, 16384, false)
	if err != nil {
		return
	}
	h, err := pmBaslikOku(b0)
	if err != nil {
		return
	}
	tarih := ""
	if mb, err := k.Oku(context.Background(), h.MetaOff, h.MetaBoy, true); err == nil {
		if r, err := pmAc(mb, h.IcSik); err == nil {
			var meta map[string]any
			if json.NewDecoder(io.LimitReader(r, 1<<20)).Decode(&meta) == nil {
				if s, ok := meta["planetiler:osm:osmosisreplicationtime"].(string); ok && len(s) >= 10 {
					tarih = s[:10]
				}
			}
		}
	}
	bilgi := map[string]any{"ad": ad, "isim": isim, "ozel": true, "tarih": tarih, "yol": dosyaVar(ad, ".rota"),
		"kutu":    []float64{float64(h.BatiE7) / 1e7, float64(h.GuneyE7) / 1e7, float64(h.DoguE7) / 1e7, float64(h.KuzeyE7) / 1e7},
		"eklendi": time.Now().Format("2006-01-02")}
	if b, err := json.Marshal(bilgi); err == nil {
		os.WriteFile(j, b, 0o644)
	}
}

func apiHaritaDosya(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	ham := r.URL.Query().Get("ad")
	tur, govde := haritaDosyaTuru(filepath.Base(ham))
	if ham != filepath.Base(ham) || tur == "" || strings.HasPrefix(ham, ".") {
		jsonYaz(w, 400, map[string]string{"hata": "bicim"})
		return
	}
	ad := haritaAdi(govde)
	if tur == "pbf" {
		hIs.mu.Lock()
		suruyor := hIs.is != nil && (hIs.is.Asama == "harita" || hIs.is.Asama == "yol" || hIs.is.Asama == "hazirlik")
		hIs.mu.Unlock()
		if suruyor {
			jsonYaz(w, 409, map[string]string{"hata": "suruyor"})
			return
		}
	}
	if err := os.MkdirAll(haritaDir(), 0o755); err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	uz := "." + tur
	if tur == "pbf" {
		uz = ".osm.pbf"
	}
	hedef := filepath.Join(haritaDir(), ad+uz)
	if d, err := diskDurumu(haritaDir()); err == nil && r.ContentLength > 0 && uint64(r.ContentLength) > d.bos {
		jsonYaz(w, 507, map[string]string{"hata": "yer-yok"})
		return
	}
	f, err := os.Create(hedef + ".part")
	if err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	_, err = io.Copy(f, http.MaxBytesReader(w, r.Body, haritaDosyaAzami))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(hedef + ".part")
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	if err := haritaDosyaDenetle(hedef+".part", tur); err != nil {
		os.Remove(hedef + ".part")
		jsonYaz(w, 422, map[string]string{"hata": "bicim"})
		return
	}
	if err := os.Rename(hedef+".part", hedef); err != nil {
		os.Remove(hedef + ".part")
		jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
		return
	}
	switch tur {
	case "pmtiles":
		pmtilesBilgi(hedef, ad, strings.TrimSpace(govde))
	case "rota":
		harita.mu.Lock() // aynı adlı eski ağ bellekteyse yenisi açılsın
		if harita.ad == ad {
			harita.ag = nil
		}
		harita.mu.Unlock()
	case "pbf":
		haritaDosyadanHazirla(hedef, ad)
	}
	jsonYaz(w, 200, map[string]any{"ad": ad, "tur": tur, "hazirlik": tur == "pbf"})
}

// haritaDosyadanHazirla: eklenen .osm.pbf ayrı süreçte yol tarifine çevrilir; ilerleme indirme işiyle aynı yerden izlenir.
func haritaDosyadanHazirla(pbf, ad string) {
	ctx, iptal := context.WithCancel(context.Background())
	hIs.mu.Lock()
	hIs.is = &haritaIsi{Bolge: ad, Ad: ad, Asama: "hazirlik", Basladi: time.Now().Format(time.RFC3339)}
	hIs.iptal = iptal
	hIs.mu.Unlock()
	tarih := time.Now().Format("2006-01-02")
	if st, err := os.Stat(pbf); err == nil {
		tarih = st.ModTime().Format("2006-01-02")
	}
	go func() {
		err := haritaHazirlaCalistir(ctx, pbf, filepath.Join(haritaDir(), ad), tarih, nil, func(satir string) {
			haritaIsiYaz(func(i *haritaIsi) { i.Bilgi = satir })
		})
		if err == nil {
			os.Remove(pbf)
			harita.mu.Lock()
			if harita.ad == ad {
				harita.ag = nil
			}
			harita.mu.Unlock()
		}
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
	}()
}

// apiHaritaSil: bir haritanın bütün dosyalarını kaldırır (görüntü, yol ağı, ad dizini, bilgi).
func apiHaritaSil(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	var g struct {
		Ad string `json:"ad"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&g) != nil {
		jsonYaz(w, 400, map[string]string{"hata": "istek"})
		return
	}
	var var_ bool
	for _, a := range haritalar() {
		if a == g.Ad {
			var_ = true
		}
	}
	if !var_ {
		jsonYaz(w, 404, map[string]string{"hata": "harita-yok"})
		return
	}
	harita.mu.Lock()
	if harita.ad == g.Ad {
		harita.ag, harita.ad = nil, ""
	}
	harita.mu.Unlock()
	yerBellek.mu.Lock()
	if yerBellek.yol == filepath.Join(haritaDir(), g.Ad+".yer") {
		yerBellek.veri = nil
	}
	yerBellek.mu.Unlock()
	for _, uz := range []string{".pmtiles", ".rota", ".yer", ".json", ".pmtiles.part", ".pmtiles.part.json"} {
		os.Remove(filepath.Join(haritaDir(), g.Ad+uz))
		os.Remove(filepath.Join(haritaDir(), "._"+g.Ad+uz))
	}
	jsonYaz(w, 200, map[string]bool{"tamam": true})
}

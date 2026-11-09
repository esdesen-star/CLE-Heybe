package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Bölge indirme uçtan uca (09.11, §78): katalog → teklif → harita kesme → yol verisi (sürdürme + MD5) → hazırlık.
func TestHaritaIndirUctanUca(t *testing.T) {
	arsiv := sahtePmtiles(t)
	pbfYol := sahtePbf(t,
		[]tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.001, nil}, {3, 40.000, 29.002, nil}, {4, 40.001, 29.002, nil}},
		[]tYol{{11, []int64{1, 2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}}, {12, []int64{3, 4}, [][2]string{{"highway", "footway"}}}})
	pbf, _ := os.ReadFile(pbfYol)
	ozet := md5.Sum(pbf)
	var kesildi atomic.Bool
	var ikinciAralik atomic.Value
	mux := http.NewServeMux()
	var sunucu *httptest.Server
	mux.HandleFunc("/index-v1.json", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"features":[{"properties":{"id":"deneme","name":"Deneme","iso3166-1:alpha2":["TR"],"urls":{"pbf":"%s/deneme-latest.osm.pbf"}},
		  "geometry":{"type":"MultiPolygon","coordinates":[[[[28.9,39.9],[29.1,39.9],[29.1,40.1],[28.9,40.1],[28.9,39.9]]]]}},
		  {"properties":{"id":"baska","name":"Başka site","urls":{"pbf":"https://kotu.example/x.osm.pbf"}},"geometry":{"type":"Point","coordinates":[1,1]}}]}`, sunucu.URL)
	})
	mux.HandleFunc("/builds.json", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `[{"key":"20261101.pmtiles","size":1},{"key":"20261108.pmtiles","size":%d}]`, len(arsiv))
	})
	mux.HandleFunc("/20261108.pmtiles", func(w http.ResponseWriter, r *http.Request) {
		http.ServeContent(w, r, "x.pmtiles", time.Unix(0, 0), bytes.NewReader(arsiv))
	})
	mux.HandleFunc("/deneme-latest.osm.pbf", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/deneme-261108.osm.pbf", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("/deneme-261108.osm.pbf", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && !kesildi.Load() { // ilk istekte bağlantı yarıda kopar: kaldığı yerden sürmeli
			kesildi.Store(true)
			w.Header().Set("Content-Range", fmt.Sprintf("bytes 0-%d/%d", len(pbf)-1, len(pbf)))
			w.Header().Set("Content-Length", fmt.Sprint(len(pbf)))
			w.WriteHeader(http.StatusPartialContent)
			w.Write(pbf[:len(pbf)/2])
			w.(http.Flusher).Flush() // yarısı gerçekten gitsin, sonra bağlantı kopsun
			if hj, ok := w.(http.Hijacker); ok {
				c, _, _ := hj.Hijack()
				c.Close()
			}
			return
		}
		if r.Method == "GET" && ikinciAralik.Load() == nil {
			ikinciAralik.Store(r.Header.Get("Range"))
		}
		w.Header().Set("Last-Modified", "Sun, 08 Nov 2026 21:00:00 GMT")
		http.ServeContent(w, r, "x.pbf", time.Date(2026, 11, 8, 21, 0, 0, 0, time.UTC), bytes.NewReader(pbf))
	})
	mux.HandleFunc("/deneme-261108.osm.pbf.md5", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "%s  deneme-261108.osm.pbf\n", hex.EncodeToString(ozet[:]))
	})
	sunucu = httptest.NewServer(mux)
	defer sunucu.Close()
	eskiler := []string{geofabrikKok, geofabrikKatalog, protomapsYapimlar, protomapsAdres}
	geofabrikKok, geofabrikKatalog, protomapsYapimlar, protomapsAdres = sunucu.URL+"/", sunucu.URL+"/index-v1.json", sunucu.URL+"/builds.json", sunucu.URL+"/"
	eskiKok, eskiCalistir := kok, haritaHazirlaCalistir
	kok = t.TempDir()
	haritaHazirlaCalistir = func(ctx context.Context, pbf, cikti, tarih string, satir func(string)) error {
		_, err := haritaHazirla(pbf, cikti, tarih, satir, nil)
		return err
	}
	t.Cleanup(func() {
		geofabrikKok, geofabrikKatalog, protomapsYapimlar, protomapsAdres = eskiler[0], eskiler[1], eskiler[2], eskiler[3]
		kok, haritaHazirlaCalistir = eskiKok, eskiCalistir
		hIs.is, hIs.plan = nil, nil
	})
	iste := func(h http.HandlerFunc, yontem, adres, govde string) (int, map[string]any) {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest(yontem, adres, strings.NewReader(govde)))
		var m map[string]any
		json.Unmarshal(w.Body.Bytes(), &m)
		return w.Code, m
	}
	if k, m := iste(apiHaritaKatalog, "GET", "/api/harita-katalog", ""); k != 200 || len(m["bolgeler"].([]any)) != 1 {
		t.Fatalf("katalog: %d %v", k, m)
	}
	k, teklif := iste(apiHaritaIndir, "POST", "/api/harita-indir", `{"bolge":"deneme"}`)
	if k != 200 || teklif["yolVar"] != true || teklif["haritaMB"].(float64) <= 0 || teklif["sigar"] != true {
		t.Fatalf("teklif: %d %v", k, teklif)
	}
	if k, m := iste(apiHaritaIndir, "POST", "/api/harita-indir", `{"bolge":"deneme","onay":true}`); k != 200 || m["basladi"] != true {
		t.Fatalf("başlatma: %d %v", k, m)
	}
	bekle := func() map[string]any {
		for i := 0; i < 300; i++ {
			_, m := iste(apiHaritaIndir, "GET", "/api/harita-indir", "")
			if a := m["asama"]; a == "bitti" || a == "hata" || a == "durdu" {
				return m
			}
			time.Sleep(50 * time.Millisecond)
		}
		t.Fatal("indirme bitmedi")
		return nil
	}
	if m := bekle(); m["asama"] != "bitti" {
		t.Fatalf("indirme: %v", m)
	}
	if !kesildi.Load() {
		t.Fatal("sınav yol verisini yarıda kesmedi")
	}
	if a, _ := ikinciAralik.Load().(string); a == "" || a == "bytes=0-" {
		t.Fatalf("yol verisi kaldığı yerden sürmeli, baştan değil: %q", a)
	}
	for _, uz := range []string{".pmtiles", ".rota", ".yer", ".json"} {
		if _, err := os.Stat(filepath.Join(kok, "harita", "deneme"+uz)); err != nil {
			t.Fatalf("eksik: deneme%s", uz)
		}
	}
	if _, err := os.Stat(filepath.Join(kok, "harita", "deneme.osm.pbf")); err == nil {
		t.Fatal("hazırlıktan sonra .pbf silinmeli")
	}
	if _, m := iste(apiHarita, "GET", "/api/harita?harita=deneme", ""); m["var"] != true || m["yolVar"] != true || m["ozet"].(map[string]any)["veriTarihi"] != "2026-11-08" {
		t.Fatalf("yeni harita: %v", m)
	}
	if _, m := iste(apiRota, "GET", "/api/rota?harita=deneme&a=40.000,29.000&b=40.001,29.002", ""); m["tamam"] != true {
		t.Fatalf("yeni haritada rota: %v", m)
	}
	// dünya genel görünüm: yalnız görüntü
	if k, m := iste(apiHaritaIndir, "POST", "/api/harita-indir", `{"bolge":"dunya-genel","onay":true}`); k != 200 {
		t.Fatalf("dünya: %d %v", k, m)
	}
	if m := bekle(); m["asama"] != "bitti" {
		t.Fatalf("dünya indirme: %v", m)
	}
	if _, m := iste(apiHarita, "GET", "/api/harita?harita=dunya-genel", ""); m["var"] != true || m["yolVar"] != false {
		t.Fatalf("dünya haritası: %v", m)
	}
	if _, m := iste(apiHarita, "GET", "/api/harita", ""); len(m["haritalar"].([]any)) != 2 {
		t.Fatalf("iki harita listelenmeli: %v", m)
	}
	// yalnız görüntüsü olan haritada ad araması çökmez (yer dizini yok; kurum listeleri yine aranır)
	if k, _ := iste(apiYer, "GET", "/api/yer?harita=dunya-genel&q=park", ""); k != 200 {
		t.Fatalf("yer dizini olmayan haritada arama: %d", k)
	}
	// büyük bölge: döşeme sınırı aşılırsa ayrıntı düşürülür, indirme reddedilmez
	eskiSinir := pmEnCokDoseme
	pmEnCokDoseme = 5000
	defer func() { pmEnCokDoseme = eskiSinir }()
	if k, m := iste(apiHaritaIndir, "POST", "/api/harita-indir", `{"bolge":"dunya-genel"}`); k != 200 || m["ayrintiDusuk"] != true || m["enCokZ"].(float64) >= 7 {
		t.Fatalf("büyük bölgede ayrıntı düşmeli: %d %v", k, m)
	}
}

func TestPbfSaglamaTutmazsa(t *testing.T) {
	veri := []byte("bozuk veri")
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".md5") {
			fmt.Fprintln(w, "00000000000000000000000000000000  x.osm.pbf")
			return
		}
		http.ServeContent(w, r, "x", time.Unix(0, 0), bytes.NewReader(veri))
	}))
	defer s.Close()
	hedef := filepath.Join(t.TempDir(), "x.osm.pbf")
	if _, err := pbfIndir(context.Background(), s.URL+"/x.osm.pbf", hedef, func(uint64, uint64) {}); err == nil || err.Error() != "saglama-tutmadi" {
		t.Fatalf("sağlaması tutmayan dosya reddedilmeli: %v", err)
	}
	if _, err := os.Stat(hedef + ".part"); err == nil {
		t.Fatal("bozuk parça silinmeli")
	}
}

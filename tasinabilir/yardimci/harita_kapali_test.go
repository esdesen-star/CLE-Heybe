package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Kapalı yol (8f2): dokunulan noktanın parçası kapanır, rota başka yoldan gider; nokta kaydedilir, harita yeniden
// açılınca yine bağlanır; yoldan uzak dokunuş kapatmaz; açınca rota eski hâline döner.
func TestKapaliYol(t *testing.T) {
	on, _ := sahteHarita(t)
	eskiKok := kok
	kok = filepath.Dir(filepath.Dir(on)) // <kök>/harita/deneme.*
	harita.mu.Lock()
	harita.ag, harita.ad = nil, ""
	harita.mu.Unlock()
	t.Cleanup(func() {
		kok = eskiKok
		harita.mu.Lock()
		harita.ag, harita.ad = nil, ""
		harita.mu.Unlock()
	})
	iste := func(yontem, adres, govde string) (int, map[string]any) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(yontem, adres, strings.NewReader(govde))
		if strings.HasPrefix(adres, "/api/kapali") {
			apiKapali(w, r)
		} else {
			apiRota(w, r)
		}
		var m map[string]any
		json.Unmarshal(w.Body.Bytes(), &m)
		return w.Code, m
	}
	rota := func() map[string]any {
		_, m := iste("GET", "/api/rota?a=40.000,29.000&b=40.001,29.002&kip=yaya", "")
		return m
	}
	if r := rota(); r["tamam"] != true || r["m"].(float64) > 295 || r["kapali"] != nil {
		t.Fatalf("kapatmadan önce kısa yol (A Sokak + yaya yolu, ~282 m) olmalı: %v", r)
	}
	// yoldan uzak dokunuş: kapatılacak yol yok
	if k, m := iste("POST", "/api/kapali", `{"lat":39.990,"lon":29.000}`); k != 404 || m["hata"] != "yol-yok" {
		t.Fatalf("yoldan uzak nokta kapatmamalı: %d %v", k, m)
	}
	// yaya yolunun ortası (3→4): o parça kapanır, rota B Caddesi'nden gider
	k, m := iste("POST", "/api/kapali", `{"lat":40.0005,"lon":29.00201}`)
	if k != 200 {
		t.Fatalf("kapatma: %d %v", k, m)
	}
	liste := m["kapali"].([]any)
	if len(liste) != 1 || liste[0].(map[string]any)["bagli"] != true || len(liste[0].(map[string]any)["geo"].([]any)) < 2 {
		t.Fatalf("kapalı yol listede bağlı ve çizgili olmalı: %v", m)
	}
	id := liste[0].(map[string]any)["id"].(string)
	r := rota()
	if r["tamam"] != true || r["m"].(float64) < 350 || r["kapali"].(float64) != 1 {
		t.Fatalf("kapalı yaya yolundan geçmemeli (B Caddesi, ~380 m) ve sayı söylenmeli: %v", r)
	}
	for _, a := range r["adimlar"].([]any) {
		if a.(map[string]any)["tur"].(float64) == 18 {
			t.Fatalf("rota kapalı yaya yolunu kullandı: %v", r["adimlar"])
		}
	}
	// kayıt noktadır ve dosyada: harita yeniden açılınca yine uygulanır
	b, err := os.ReadFile(filepath.Join(kok, "harita", "kapali.json"))
	if err != nil || !strings.Contains(string(b), `"deneme"`) || strings.Contains(string(b), "geo") {
		t.Fatalf("kapali.json yalnız noktayı tutmalı: %v %s", err, b)
	}
	harita.mu.Lock()
	harita.ag, harita.ad = nil, ""
	harita.mu.Unlock()
	if r := rota(); r["m"].(float64) < 350 {
		t.Fatalf("yeniden açılan haritada kapalı yol unutuldu: %v", r)
	}
	// B Caddesi de kapanınca yol kalmaz: "rota yok", uydurma yol yok
	if k, _ := iste("POST", "/api/kapali", `{"lat":40.0005,"lon":28.9995}`); k != 200 {
		t.Fatalf("ikinci kapatma: %d", k)
	}
	if r := rota(); r["tamam"] == true {
		t.Fatalf("iki yol da kapalıyken rota bulunmamalı: %v", r)
	}
	// açmak: yanlış kimlik 404, doğru kimlik açar
	if k, _ := iste("DELETE", "/api/kapali?id=yok", ""); k != 404 {
		t.Fatalf("olmayan kimlik 404 olmalı: %d", k)
	}
	if k, m := iste("DELETE", "/api/kapali?id="+id, ""); k != 200 || len(m["kapali"].([]any)) != 1 {
		t.Fatalf("açma: %d %v", k, m)
	}
	if r := rota(); r["tamam"] != true || r["m"].(float64) > 295 {
		t.Fatalf("yaya yolu açılınca kısa yol geri gelmeli: %v", r)
	}
}

// Uzun parça (köprü): uçları dokunulan noktadan iki hücre uzakta, yakında başka kısa bir yol var. Köprü yine bulunmalı
// (ilk köşeden sonra iki halka daha bakılır); bulunmazsa kısa yol 200 m uzakta kalır ve "yol yok" denirdi.
func TestKapaliUzunParca(t *testing.T) {
	pbf := sahtePbf(t,
		[]tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.040, nil}, {3, 40.0018, 29.0195, nil}, {4, 40.0018, 29.0205, nil}},
		[]tYol{
			{11, []int64{1, 2}, [][2]string{{"highway", "primary"}, {"name", "Köprü"}, {"bridge", "yes"}}},
			{12, []int64{3, 4}, [][2]string{{"highway", "residential"}, {"name", "Kısa Sokak"}}},
		})
	on := filepath.Join(t.TempDir(), "harita", "kopru")
	os.MkdirAll(filepath.Dir(on), 0o755)
	if _, err := haritaHazirla(pbf, on, "2026-11-12", nil, nil); err != nil {
		t.Fatal(err)
	}
	ag, err := rotaAc(on + ".rota")
	if err != nil {
		t.Fatal(err)
	}
	g := ag.kapaliUygula([]kapaliYol{{ID: "a", Lat: 40.0000, Lon: 29.0200}})
	if len(g) != 1 || !g[0].Bagli || g[0].Ad != "Köprü" || g[0].M < 3000 {
		t.Fatalf("köprünün ortasına dokunulunca köprü kapanmalı: %+v", g)
	}
	// köprü kapalıyken başlangıç ve varış en yakın açık yola kayar (sapma söylenir); köprü adımı olmamalı
	r := ag.Rota(40.000, 29.001, 40.000, 29.039, "arac")
	for _, a := range r.Adimlar {
		if a.Ad == "Köprü" {
			t.Fatalf("kapalı köprüden araç geçmemeli: %+v", r)
		}
	}
	if r.Tamam && r.BasSapma < 1000 {
		t.Fatalf("köprü kapalıyken başlangıç köprüde kalmamalı: %+v", r)
	}
}

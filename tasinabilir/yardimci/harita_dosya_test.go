package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHaritaDosyadanEkleVeKaldir(t *testing.T) {
	eskiKok, eskiCalistir := kok, haritaHazirlaCalistir
	kok = t.TempDir()
	haritaHazirlaCalistir = func(ctx context.Context, pbf, cikti, tarih string, kutu *[4]float64, satir func(string)) error {
		_, err := haritaHazirla(pbf, cikti, tarih, satir, kutu)
		return err
	}
	t.Cleanup(func() { kok, haritaHazirlaCalistir = eskiKok, eskiCalistir; hIs.is = nil })
	yukle := func(ad string, veri []byte) (int, map[string]any) {
		w := httptest.NewRecorder()
		apiHaritaDosya(w, httptest.NewRequest("POST", "/api/harita-dosya?ad="+ad, bytes.NewReader(veri)))
		var m map[string]any
		json.Unmarshal(w.Body.Bytes(), &m)
		return w.Code, m
	}
	if k, m := yukle("Benim%20B%C3%B6lgem.pmtiles", sahtePmtiles(t)); k != 200 || m["ad"] != "benim-bolgem" {
		t.Fatalf("pmtiles ekleme: %d %v", k, m)
	}
	var bilgi map[string]any
	b, _ := os.ReadFile(filepath.Join(kok, "harita", "benim-bolgem.json"))
	if json.Unmarshal(b, &bilgi) != nil || bilgi["isim"] != "Benim Bölgem" || bilgi["ozel"] != true {
		t.Fatalf("eklenen haritanın bilgi dosyası: %s", b)
	}
	if k, _ := yukle("bozuk.pmtiles", []byte("bu bir harita değil")); k != 422 {
		t.Fatalf("bozuk dosya reddedilmeli: %d", k)
	}
	if _, err := os.Stat(filepath.Join(kok, "harita", "bozuk.pmtiles")); err == nil {
		t.Fatal("bozuk dosya kaydedilmemeli")
	}
	if k, _ := yukle("..%2Fkacak.pmtiles", sahtePmtiles(t)); k != 400 {
		t.Fatalf("yollu ad reddedilmeli: %d", k)
	}
	if k, _ := yukle("alt%2Fkacak.pmtiles", sahtePmtiles(t)); k != 400 {
		t.Fatalf("klasörlü ad reddedilmeli: %d", k)
	}
	if k, _ := yukle("resim.png", []byte("x")); k != 400 {
		t.Fatalf("tanınmayan tür: %d", k)
	}
	pbf, _ := os.ReadFile(sahtePbf(t,
		[]tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.001, nil}},
		[]tYol{{11, []int64{1, 2}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}}}))
	if k, m := yukle("K%C3%BC%C3%A7%C3%BCk%20Yer.osm.pbf", pbf); k != 200 || m["hazirlik"] != true || m["ad"] != "kucuk-yer" {
		t.Fatalf("pbf ekleme: %d %v", k, m)
	}
	for i := 0; i < 200; i++ {
		hIs.mu.Lock()
		a := hIs.is.Asama
		hIs.mu.Unlock()
		if a != "hazirlik" {
			if a != "bitti" {
				t.Fatalf("hazırlık: %v", hIs.is)
			}
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if _, err := os.Stat(filepath.Join(kok, "harita", "kucuk-yer.rota")); err != nil {
		t.Fatal("pbf'den yol ağı hazırlanmalı")
	}
	if _, err := os.Stat(filepath.Join(kok, "harita", "kucuk-yer.osm.pbf")); err == nil {
		t.Fatal("hazırlıktan sonra pbf kopyası silinmeli")
	}
	sil := func(ad string) int {
		w := httptest.NewRecorder()
		apiHaritaSil(w, httptest.NewRequest("POST", "/api/harita-sil", bytes.NewReader([]byte(`{"ad":"`+ad+`"}`))))
		return w.Code
	}
	if sil("benim-bolgem") != 200 {
		t.Fatal("kaldırma")
	}
	for _, uz := range []string{".pmtiles", ".json"} {
		if _, err := os.Stat(filepath.Join(kok, "harita", "benim-bolgem"+uz)); err == nil {
			t.Fatalf("kaldırılan haritanın dosyası kalmamalı: %s", uz)
		}
	}
	if sil("../harita") != 404 || sil("yok") != 404 {
		t.Fatal("olmayan ya da yollu ad 404 olmalı")
	}
}

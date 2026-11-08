package main

// "Bu cevap yanlış" kayıtları (Ö18, 07.11). Dişi: sınırı ya da sayfanın yazamayacağı alanları bozunca kırılmalı.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func yanlisOrtami(t *testing.T) {
	t.Helper()
	eskiKok, eskiBenim := kok, benimDir
	kok = t.TempDir()
	benimDir = filepath.Join(kok, "heybe", "benim") // ilk açılış gibi: klasör yok (İlk Gelen Gibi Dene)
	t.Cleanup(func() { kok, benimDir = eskiKok, eskiBenim })
	_ = os.MkdirAll(filepath.Join(kok, "heybe"), 0o755)
	_ = os.WriteFile(filepath.Join(kok, "heybe", "surum.json"), []byte(`{"surum": "9.9.9"}`), 0o644)
}

func yanlisIstek(t *testing.T, yontem, govde string) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(yontem, "/api/yanlis", strings.NewReader(govde))
	w := httptest.NewRecorder()
	apiYanlis(w, r)
	var v map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	return w.Code, v
}

func TestYanlisKaydet(t *testing.T) {
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	kod, v := yanlisIstek(t, http.MethodPost, `{"kayit": {"soru": "Su kaç dakika kaynatılır?", "dil": "tr", "not": "bir dakika yazmalıydı",
		"gosterilen": "10 dakika [1]", "parcalar": [{"kitap": "x", "metin": "1 dakika"}], "kimlik": "sahte", "surum": "0.0.1"}}`)
	if kod != 200 || v["kimlik"] == nil {
		t.Fatalf("kayıt olmadı: %d %v", kod, v)
	}
	if v["kimlik"] == "sahte" {
		t.Fatal("sayfa kimlik yazabildi")
	}
	kayitlar := yanlisOku()
	if len(kayitlar) != 1 {
		t.Fatalf("1 kayıt beklenirdi: %d", len(kayitlar))
	}
	k := kayitlar[0]
	if k["surum"] != "9.9.9" || k["yardimci"] != surum || k["tarih"] == "" {
		t.Fatalf("sürüm/tarih eksik ya da sayfadan geldi: %v", k)
	}
	if p, _ := k["parcalar"].([]any); len(p) != 1 {
		t.Fatal("kaynak parçaları kaydolmadı")
	}
	// ikinci kayıt sona eklenir, ilki kalır
	yanlisIstek(t, http.MethodPost, `{"kayit": {"soru": "Yılan soktu ne yapmalıyım?"}}`)
	if n := len(yanlisOku()); n != 2 {
		t.Fatalf("2 kayıt beklenirdi: %d", n)
	}
	// liste özeti kaynak parçalarını taşımaz
	kod, v = yanlisIstek(t, http.MethodGet, "")
	ozet, _ := v["kayitlar"].([]any)
	if kod != 200 || len(ozet) != 2 {
		t.Fatalf("liste: %d %v", kod, v)
	}
	if _, var_ := ozet[0].(map[string]any)["parcalar"]; var_ {
		t.Fatal("özet kaynak parçalarını taşımamalı")
	}
	// silme: yalnız o kayıt gider
	kimlik := ozet[0].(map[string]any)["kimlik"].(string)
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"sil": "`+kimlik+`"}`); kod != 200 {
		t.Fatalf("silinemedi: %d", kod)
	}
	kalan := yanlisOku()
	if len(kalan) != 1 || kalan[0]["soru"] != "Yılan soktu ne yapmalıyım?" {
		t.Fatalf("yanlış kayıt silindi: %v", kalan)
	}
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"sil": "yok"}`); kod != 404 {
		t.Fatalf("olmayan kayıt 404 vermeli: %d", kod)
	}
}

func TestYanlisGecersiz(t *testing.T) {
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	for ad, govde := range map[string]string{
		"soru yok":   `{"kayit": {"dil": "tr"}}`,
		"boş soru":   `{"kayit": {"soru": "   "}}`,
		"kayıt yok":  `{"soru": "x"}`,
		"bozuk json": `{"kayit": `,
		"uzun soru":  `{"kayit": {"soru": "` + strings.Repeat("a", 2001) + `"}}`,
	} {
		if kod, _ := yanlisIstek(t, http.MethodPost, govde); kod != 400 {
			t.Errorf("%s: 400 beklenirdi, %d", ad, kod)
		}
	}
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"kayit": {"soru": "x", "not": "`+strings.Repeat("b", yanlisKayitSiniri)+`"}}`); kod != 413 {
		t.Errorf("çok büyük kayıt 413 vermeli: %d", kod)
	}
	if n := len(yanlisOku()); n != 0 {
		t.Fatalf("geçersiz kayıt yazıldı: %d", n)
	}
}

func TestYanlisDolu(t *testing.T) {
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	// dosya sınıra yakın: yeni kayıt sığmazsa yazılmaz, eskiler bozulmaz
	satir := `{"kimlik":"a","soru":"` + strings.Repeat("x", 1000) + `"}` + "\n"
	dolu := bytes.Repeat([]byte(satir), yanlisDosyaSiniri/len(satir))
	if err := os.WriteFile(yanlisYolu(), dolu, 0o644); err != nil {
		t.Fatal(err)
	}
	kod, _ := yanlisIstek(t, http.MethodPost, `{"kayit": {"soru": "`+strings.Repeat("y", 1500)+`"}}`)
	if kod != http.StatusInsufficientStorage {
		t.Fatalf("dolu dosya 507 vermeli: %d", kod)
	}
	if b, _ := os.ReadFile(yanlisYolu()); !bytes.Equal(b, dolu) {
		t.Fatal("dolu dosya değişti")
	}
}

func TestYanlisKlasorYok(t *testing.T) {
	yanlisOrtami(t) // benim/ klasörü hiç yok: kayıt yazılamaz ama program düşmez, liste boş döner
	kod, v := yanlisIstek(t, http.MethodGet, "")
	if kod != 200 || len(v["kayitlar"].([]any)) != 0 {
		t.Fatalf("boş liste beklenirdi: %d %v", kod, v)
	}
}

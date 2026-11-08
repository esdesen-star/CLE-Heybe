package main

// İlk kurulum modellerinin dişi (08.11.2026, Özet §66): imzası tutmayan dosya yerine konmaz; yarım kalan
// kaldığı yerden sürer; koşullar kabul edilmeden indirme başlamaz; boyutu tutmayan model "eksik" sayılır.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func sahteModelSunucusu(t *testing.T, icerik []byte) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeContent(w, r, "m.gguf", time.Time{}, bytes.NewReader(icerik)) // Range destekler
	}))
	t.Cleanup(s.Close)
	return s
}

func sahteKurulum(t *testing.T, icerik []byte, imza string) modelKaydi {
	t.Helper()
	kok = t.TempDir()
	modelAcilsin = false
	s := sahteModelSunucusu(t, icerik)
	eski := modeller
	t.Cleanup(func() { modeller = eski; modelAcilsin = true })
	m := modelKaydi{Dosya: "deneme.gguf", Ne: "anlam", Adres: s.URL + "/m.gguf", Boyut: int64(len(icerik)), Imza: imza}
	modeller = []modelKaydi{m}
	if err := os.MkdirAll(filepath.Join(kok, "model"), 0o755); err != nil {
		t.Fatal(err)
	}
	return m
}

func imzasi(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

func TestModelIndir(t *testing.T) {
	icerik := bytes.Repeat([]byte("heybe-model-"), 50000) // ~600 KB
	t.Run("imza tutarsa yerine konur", func(t *testing.T) {
		m := sahteKurulum(t, icerik, imzasi(icerik))
		if !modelIndir(context.Background(), m) {
			t.Fatalf("indirme başarısız: %+v", indirmeler[m.Dosya])
		}
		if !modelVar(m) || len(eksikModeller()) != 0 {
			t.Fatal("model yerinde değil")
		}
	})
	t.Run("imza tutmazsa yerine konmaz, yarım dosya silinir", func(t *testing.T) {
		m := sahteKurulum(t, icerik, strings.Repeat("0", 64))
		if modelIndir(context.Background(), m) {
			t.Fatal("imzası tutmayan model kabul edildi")
		}
		if _, err := os.Stat(modelYolu(m)); err == nil {
			t.Fatal("bozuk model yerine kondu")
		}
		if _, err := os.Stat(modelYolu(m) + ".part"); err == nil {
			t.Fatal("bozuk yarım dosya silinmedi")
		}
		if d := indirmeler[m.Dosya].Durum; d != "hata" {
			t.Fatalf("durum %q, hata bekleniyordu", d)
		}
	})
	t.Run("yarım kalan kaldığı yerden sürer", func(t *testing.T) {
		m := sahteKurulum(t, icerik, imzasi(icerik))
		if err := os.WriteFile(modelYolu(m)+".part", icerik[:len(icerik)/2], 0o644); err != nil {
			t.Fatal(err)
		}
		if !modelIndir(context.Background(), m) || !modelVar(m) {
			t.Fatal("yarım dosyadan sürdürülemedi")
		}
	})
	t.Run("boyutu tutmayan model eksik sayılır", func(t *testing.T) {
		m := sahteKurulum(t, icerik, imzasi(icerik))
		if err := os.WriteFile(modelYolu(m), icerik[:10], 0o644); err != nil {
			t.Fatal(err)
		}
		if modelVar(m) || len(eksikModeller()) != 1 {
			t.Fatal("eksik model var sayıldı")
		}
	})
}

func TestModelKosulKabulu(t *testing.T) {
	sahteKurulum(t, []byte("x"), imzasi([]byte("x")))
	k := httptest.NewRecorder()
	apiModeller(k, httptest.NewRequest(http.MethodPost, "/api/modeller", strings.NewReader(`{"kabul": false}`)))
	if k.Code != 400 {
		t.Fatalf("koşullar kabul edilmeden indirme başladı (HTTP %d)", k.Code)
	}
	modelKilit.Lock()
	defer modelKilit.Unlock()
	if modelIniyor {
		t.Fatal("kabulsüz istek indirmeyi başlattı")
	}
}

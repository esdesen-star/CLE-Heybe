package main

// Açılış dili ayarı (07.11 gece, Özet §51). Dişi: geçersiz dil kodu kaydedilmemeli, boş seçim standarda dönmeli,
// ilk açılışta (klasör yok) da yazabilmeli, bozuk dosya standart okunmalı.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func ayarIstek(t *testing.T, yontem, govde string) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(yontem, "/api/ayar", strings.NewReader(govde))
	w := httptest.NewRecorder()
	apiAyar(w, r)
	var v map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	return w.Code, v
}

func TestAcilisDili(t *testing.T) {
	yanlisOrtami(t) // geçici kök; benim/ klasörü yok
	if kod, v := ayarIstek(t, http.MethodGet, ""); kod != 200 || v["acilisDili"] != "" {
		t.Fatalf("ilk açılış standart olmalı: %d %v", kod, v)
	}
	if kod, v := ayarIstek(t, http.MethodPost, `{"acilisDili": "tr"}`); kod != 200 || v["acilisDili"] != "tr" {
		t.Fatalf("kaydedilmedi: %d %v", kod, v)
	}
	if _, v := ayarIstek(t, http.MethodGet, ""); v["acilisDili"] != "tr" {
		t.Fatalf("okunmadı: %v", v)
	}
	for _, kotu := range []string{`{"acilisDili": "../x"}`, `{"acilisDili": "TR"}`, `{"acilisDili": "türkçe"}`, `{"acilisDili": "abcd"}`} {
		if kod, _ := ayarIstek(t, http.MethodPost, kotu); kod != 400 {
			t.Fatalf("geçersiz kabul edildi: %s → %d", kotu, kod)
		}
	}
	if _, v := ayarIstek(t, http.MethodGet, ""); v["acilisDili"] != "tr" {
		t.Fatalf("geçersiz istek eskisini bozdu: %v", v)
	}
	if _, v := ayarIstek(t, http.MethodPost, `{"acilisDili": ""}`); v["acilisDili"] != "" {
		t.Fatalf("standarda dönmedi: %v", v)
	}
	_ = os.WriteFile(genelAyarYolu(), []byte(`{"acilisDili": "<script>"}`), 0o644)
	if _, v := ayarIstek(t, http.MethodGet, ""); v["acilisDili"] != "" {
		t.Fatalf("bozuk dosya standart okunmalı: %v", v)
	}
}

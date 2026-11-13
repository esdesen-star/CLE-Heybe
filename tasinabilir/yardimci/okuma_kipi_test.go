package main

// Okuma kipi (10.11, Özet §106). Dişi: varsayılan "tam"; seçilince kalıcı ve başlatıcının okuduğu düz metin "okuma";
// geçersiz kip kaydedilmez; açılış dili ayarı kipi silmez (iki uç aynı dosyayı yazıyor); okuma kipinde inen sohbet
// modeli kendiliğinden açılmaz ama anlam modeli açılır; bilgisayarın belleği okunur.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func kipIstek(t *testing.T, yontem, govde string) (int, string) {
	t.Helper()
	r := httptest.NewRequest(yontem, "/api/kip", strings.NewReader(govde))
	w := httptest.NewRecorder()
	apiKip(w, r)
	return w.Code, strings.TrimSpace(w.Body.String())
}

func TestOkumaKipi(t *testing.T) {
	yanlisOrtami(t) // geçici kök; benim/ klasörü yok
	eski := modelAcilsin
	modelAcilsin = false // sınavda model açılmaya çalışılmaz
	t.Cleanup(func() { modelAcilsin = eski })
	if kod, v := kipIstek(t, http.MethodGet, ""); kod != 200 || v != "tam" {
		t.Fatalf("varsayılan tam olmalı: %d %q", kod, v)
	}
	if kod, v := kipIstek(t, http.MethodPost, `{"kip": "okuma"}`); kod != 200 || v != "okuma" {
		t.Fatalf("okuma kaydedilmedi: %d %q", kod, v)
	}
	if _, v := kipIstek(t, http.MethodGet, ""); v != "okuma" {
		t.Fatalf("başlatıcı okuma görmeli: %q", v)
	}
	if _, a := ayarIstek(t, http.MethodGet, ""); a["okumaKipi"] != true {
		t.Fatalf("sayfa ayarda okuma kipini görmeli: %v", a)
	}
	// açılış dili kaydı kipi silmemeli (iki uç aynı dosyayı yazar)
	if _, a := ayarIstek(t, http.MethodPost, `{"acilisDili": "tr"}`); a["okumaKipi"] != true || a["acilisDili"] != "tr" {
		t.Fatalf("açılış dili kaydı kipi bozdu: %v", a)
	}
	for _, kotu := range []string{`{"kip": "OKUMA"}`, `{"kip": ""}`, `{}`, `bozuk`} {
		if kod, _ := kipIstek(t, http.MethodPost, kotu); kod != 400 {
			t.Fatalf("geçersiz kip kabul edildi: %s → %d", kotu, kod)
		}
	}
	if _, v := kipIstek(t, http.MethodGet, ""); v != "okuma" {
		t.Fatalf("geçersiz istek kipi değiştirdi: %q", v)
	}
	modelAcilsin = true // yalnız karar sınanır (açma çağrılmaz)
	sohbet, anlam := modelKaydi{Ne: "sohbet"}, modelKaydi{Ne: "anlam"}
	if modelKendiligindenAcilsin(sohbet) || !modelKendiligindenAcilsin(anlam) || modelKendiligindenAcilsin(modelKaydi{Ne: "cevirmen"}) {
		t.Fatal("okuma kipinde: sohbet açılmamalı, anlam açılmalı, çevirmen hiç kendiliğinden açılmaz")
	}
	modelAcilsin = false
	if kod, v := kipIstek(t, http.MethodPost, `{"kip": "tam"}`); kod != 200 || v != "tam" {
		t.Fatalf("tam'a dönmedi: %d %q", kod, v)
	}
	modelAcilsin = true
	if !modelKendiligindenAcilsin(sohbet) {
		t.Fatal("tam kipte inen sohbet modeli açılmalı")
	}
	modelAcilsin = false
}

func TestToplamBellek(t *testing.T) {
	// en az 512 MB, en çok 64 TB: okunabildiyse akla yatkın bir sayı olmalı
	if b := toplamBellek(); b < 512<<20 || b > 64<<40 {
		t.Fatalf("bellek okunamadı ya da saçma: %d", b)
	}
}

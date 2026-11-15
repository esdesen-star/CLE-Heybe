package main

// "Bu cevap yanlış" kayıtları (Ö18, 07.11). Dişi: sınırı ya da sayfanın yazamayacağı alanları bozunca kırılmalı.

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
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

// §158 (K7): sayfa kaydı Defterim'in anahtarıyla şifreler — burada içerik rastgele baytlar, yardımcı yalnız biçimi denetler
func testKutu(n int) string {
	b := func(k int) string { return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{'x'}, k)) }
	return `{"iv":"` + b(12) + `","veri":"` + b(n) + `"}`
}
func testYanlis(n int) string {
	return `{"kayit": {"dil": "tr", "sonuc": "cevap", "sifreli": ` + testKutu(n) + `, "sifreliOzet": ` + testKutu(40) + `}}`
}

func TestYanlisKaydet(t *testing.T) {
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	kod, v := yanlisIstek(t, http.MethodPost, strings.Replace(testYanlis(200), `"sonuc"`, `"kimlik": "sahte", "surum": "0.0.1", "sonuc"`, 1))
	if kod != 400 {
		t.Fatalf("sayfanın yazamayacağı açık alan (kimlik) reddedilmeli: %d %v", kod, v)
	}
	kod, v = yanlisIstek(t, http.MethodPost, testYanlis(200))
	if kod != 200 || v["kimlik"] == nil {
		t.Fatalf("kayıt olmadı: %d %v", kod, v)
	}
	kayitlar := yanlisOku()
	if len(kayitlar) != 1 {
		t.Fatalf("1 kayıt beklenirdi: %d", len(kayitlar))
	}
	k := kayitlar[0]
	if k["surum"] != "9.9.9" || k["yardimci"] != surum || k["tarih"] == "" || k["sifreli"] == nil {
		t.Fatalf("sürüm/tarih/zarf eksik: %v", k)
	}
	// ikinci kayıt sona eklenir, ilki kalır
	yanlisIstek(t, http.MethodPost, testYanlis(300))
	if n := len(yanlisOku()); n != 2 {
		t.Fatalf("2 kayıt beklenirdi: %d", n)
	}
	// liste özeti tam zarfı taşımaz, şifreli özeti taşır (sayfa çözer)
	kod, v = yanlisIstek(t, http.MethodGet, "")
	ozet, _ := v["kayitlar"].([]any)
	if kod != 200 || len(ozet) != 2 {
		t.Fatalf("liste: %d %v", kod, v)
	}
	o0 := ozet[0].(map[string]any)
	if _, var_ := o0["sifreli"]; var_ {
		t.Fatal("özet tam zarfı taşımamalı")
	}
	if _, var_ := o0["sifreliOzet"]; !var_ {
		t.Fatal("özet şifreli kısa özeti taşımalı")
	}
	// silme: yalnız o kayıt gider
	kimlik := o0["kimlik"].(string)
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"sil": "`+kimlik+`"}`); kod != 200 {
		t.Fatalf("silinemedi: %d", kod)
	}
	if kalan := yanlisOku(); len(kalan) != 1 || kalan[0]["kimlik"] == kimlik {
		t.Fatalf("yanlış kayıt silindi: %v", kalan)
	}
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"sil": "yok"}`); kod != 404 {
		t.Fatalf("olmayan kayıt 404 vermeli: %d", kod)
	}
}

func TestYanlisEskiSifresiz(t *testing.T) {
	// 0.38.0'a kadar yazılmış şifresiz kayıt okunur ve listelenir (sayfa defter açılınca şifreleyip yerine koyar)
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	_ = os.WriteFile(yanlisYolu(), []byte(`{"kimlik":"eski","soru":"Su kaç dakika kaynatılır?","not":"bir dakika"}`+"\n"), 0o644)
	kod, v := yanlisIstek(t, http.MethodGet, "")
	ozet, _ := v["kayitlar"].([]any)
	if kod != 200 || len(ozet) != 1 || ozet[0].(map[string]any)["soru"] != "Su kaç dakika kaynatılır?" {
		t.Fatalf("eski kayıt okunmadı: %d %v", kod, v)
	}
	// sayfa taşır: şifreli hâlini ekler, eskisini siler — önceki sürüm kopyasında şifresiz soru kalmamalı (K7)
	if kod, _ := yanlisIstek(t, http.MethodPost, testYanlis(200)); kod != 200 {
		t.Fatalf("taşınan kayıt yazılamadı: %d", kod)
	}
	if kod, _ := yanlisIstek(t, http.MethodPost, `{"sil": "eski"}`); kod != 200 {
		t.Fatalf("eski kayıt silinemedi: %d", kod)
	}
	for _, yol := range []string{yanlisYolu(), yanlisYolu() + ".onceki"} {
		if b, err := os.ReadFile(yol); err == nil && strings.Contains(string(b), "kaynatılır") {
			t.Fatalf("taşımadan sonra şifresiz soru kaldı: %s", filepath.Base(yol))
		}
	}
}

func TestYanlisGecersiz(t *testing.T) {
	yanlisOrtami(t)
	_ = os.MkdirAll(benimDir, 0o755)
	gecerli := testYanlis(200)
	for ad, govde := range map[string]string{
		"şifresiz (K7)":        `{"kayit": {"soru": "Annem nefes alamıyor", "dil": "tr"}}`,
		"şifreli yanında soru": strings.Replace(gecerli, `"dil": "tr"`, `"dil": "tr", "soru": "Annem nefes alamıyor"`, 1),
		"özet yok":             `{"kayit": {"dil": "tr", "sifreli": ` + testKutu(200) + `}}`,
		"iv kısa":              strings.Replace(gecerli, base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{'x'}, 12)), "eHg=", 1),
		"base64 değil":         strings.Replace(gecerli, base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{'x'}, 200)), "%%%", 1),
		"sonuç uydurma":        strings.Replace(gecerli, `"sonuc": "cevap"`, `"sonuc": "harika"`, 1),
		"kayıt yok":            `{"soru": "x"}`,
		"bozuk json":           `{"kayit": `,
	} {
		if kod, _ := yanlisIstek(t, http.MethodPost, govde); kod != 400 {
			t.Errorf("%s: 400 beklenirdi, %d", ad, kod)
		}
	}
	// şifresiz kayıt kendi gerekçesiyle reddedilir (açık alan kuralına bırakılmaz)
	if _, v := yanlisIstek(t, http.MethodPost, `{"kayit": {"dil": "tr", "sonuc": "cevap"}}`); !strings.Contains(fmt.Sprint(v["hata"]), "şifreli olmalı") {
		t.Errorf("şifresiz kayıt K7 gerekçesiyle reddedilmeli: %v", v)
	}
	if kod, _ := yanlisIstek(t, http.MethodPost, testYanlis(yanlisKayitSiniri)); kod != 413 {
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
	kod, _ := yanlisIstek(t, http.MethodPost, testYanlis(1500))
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

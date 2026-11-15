package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// zarf: içerik rastgele baytlar — yardımcı yalnız biçimi denetler, çözemez (K7)
func testZarf(defterVeri string) string {
	b := func(n int) string { return base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", n))) }
	sar := `{"tuz":"` + b(16) + `","iv":"` + b(12) + `","veri":"` + b(48) + `"}`
	return `{"surum":2,"sifreli":{"yontem":"PBKDF2-SHA256/AES-GCM-256","tekrar":600000,"parola":` + sar + `,"kurtarma":` + sar +
		`,"defter":{"iv":"` + b(12) + `","veri":"` + base64.StdEncoding.EncodeToString([]byte(defterVeri)) + `"}}}`
}

func TestDefter(t *testing.T) {
	eski := benimDir
	benimDir = t.TempDir()
	defer func() { benimDir = eski }()
	iste := func(yontem, yol, govde string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		apiDefter(w, httptest.NewRequest(yontem, yol, strings.NewReader(govde)))
		return w
	}
	if w := iste(http.MethodGet, "/api/defter", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"kayitlar"`) {
		t.Fatalf("boş defter: %d %s", w.Code, w.Body.String())
	}
	// K7: şifresiz defter yazılmaz
	duz := `{"surum":1,"gruplar":[{"id":"g1","ad":"Tıbbi"}],"kayitlar":[{"id":"k1","grup":"g1","ad":"Ateş","tur":"not","metin":"Penisiline alerjisi var"}]}`
	if w := iste(http.MethodPost, "/api/defter", duz); w.Code != 400 || !strings.Contains(w.Body.String(), "K7") {
		t.Fatalf("şifresiz defter kabul edildi: %d %s", w.Code, w.Body.String())
	}
	// 0.34.0'dan kalan şifresiz defter okunur (sayfa kilit kurunca şifreler)
	yol := filepath.Join(benimDir, "defter.json")
	if err := os.WriteFile(yol, []byte(duz), 0o644); err != nil {
		t.Fatal(err)
	}
	if w := iste(http.MethodGet, "/api/defter", ""); !strings.Contains(w.Body.String(), "Penisiline alerjisi var") {
		t.Fatalf("eski şifresiz defter okunamadı: %s", w.Body.String())
	}
	// şifreli yazım: eski şifresiz kopya bir önceki sürümde kalmaz
	if w := iste(http.MethodPost, "/api/defter", testZarf("birinci şifreli içerik")); w.Code != 200 {
		t.Fatalf("zarf yazılamadı: %d %s", w.Code, w.Body.String())
	}
	if _, err := os.Stat(yol + ".onceki"); err == nil {
		t.Fatal("şifresiz eski defter bir önceki sürüm olarak kaldı")
	}
	if w := iste(http.MethodGet, "/api/defter", ""); !strings.Contains(w.Body.String(), `"sifreli"`) || strings.Contains(w.Body.String(), "Penisiline") {
		t.Fatalf("okunan zarf değil: %s", w.Body.String())
	}
	// ikinci şifreli yazım: bir önceki (şifreli) sürüm durur
	iste(http.MethodPost, "/api/defter", testZarf("ikinci şifreli içerik"))
	if b, err := os.ReadFile(yol + ".onceki"); err != nil || !sifreliMi(b) {
		t.Fatal("şifreli bir önceki sürüm kalmadı")
	}
	// kenara: eski defter açılmadan saklanır
	if w := iste(http.MethodPost, "/api/defter?kenara=1", testZarf("yeni defter, boş ve şifreli")); w.Code != 200 {
		t.Fatalf("yeni defter yazılamadı: %d", w.Code)
	}
	kenar, _ := filepath.Glob(filepath.Join(benimDir, "defter_kenara_*.json"))
	if len(kenar) != 1 {
		t.Fatalf("kenara konan defter: %v", kenar)
	}
	if b, _ := os.ReadFile(kenar[0]); !strings.Contains(string(b), base64.StdEncoding.EncodeToString([]byte("ikinci şifreli içerik"))) {
		t.Fatal("kenara konan eski defter değil")
	}
	gecerli := testZarf("geçerli şifreli içerik örneği")
	if w := iste(http.MethodPost, "/api/defter", gecerli); w.Code != 200 {
		t.Fatalf("geçerli zarf reddedildi: %d %s", w.Code, w.Body.String())
	}
	bozuk := map[string]string{
		"nesne değil":    `[1,2]`,
		"bozuk JSON":     `{"sifreli":`,
		"sürüm yanlış":   strings.Replace(gecerli, `"surum":2`, `"surum":1`, 1),
		"düz metin yanı": strings.Replace(gecerli, `{"surum":2,`, `{"surum":2,"kayitlar":[],`, 1),
		"tekrar düşük":   strings.Replace(gecerli, `600000`, `1000`, 1),
		"kurtarma yok":   strings.Replace(gecerli, `,"kurtarma":`, `,"kurtarmaX":`, 1),
		"iv kısa":        strings.Replace(gecerli, `"iv":"`+base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 12)))+`"`, `"iv":"eHg="`, 1),
		"base64 değil":   strings.Replace(gecerli, base64.StdEncoding.EncodeToString([]byte("geçerli şifreli içerik örneği")), "%%%", 1),
		"sarılı anahtar kısa": strings.Replace(gecerli, base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 48))),
			base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 40))), 1),
	}
	for ad, govde := range bozuk {
		if w := iste(http.MethodPost, "/api/defter", govde); w.Code == 200 {
			t.Fatalf("%s kabul edildi", ad)
		}
	}
	if w := iste(http.MethodPost, "/api/defter", testZarf(strings.Repeat("a", defterSiniri))); w.Code != 413 {
		t.Fatalf("büyük defter: %d", w.Code)
	}
	// reddedilen yazımlar defteri bozmadı
	if w := iste(http.MethodGet, "/api/defter", ""); !strings.Contains(w.Body.String(), base64.StdEncoding.EncodeToString([]byte("geçerli şifreli içerik örneği"))) {
		t.Fatal("reddedilen yazım defteri bozdu")
	}
	// şifresiz eski defterin biçim denetimi (okuma yolu) yerinde
	for ad, govde := range map[string]string{
		"kimlik yok":        `{"gruplar":[],"kayitlar":[{"ad":"x"}]}`,
		"kimlik yinelenmiş": `{"gruplar":[{"id":"a","ad":"x"}],"kayitlar":[{"id":"a"}]}`,
		"grup yok":          `{"gruplar":[],"kayitlar":[{"id":"k","grup":"yok"}]}`,
		"üst grup yok":      `{"gruplar":[{"id":"g","ad":"x","ust":"yok"}],"kayitlar":[]}`,
	} {
		if _, kod, _ := defterDenetle([]byte(govde)); kod == 200 {
			t.Fatalf("eski defter denetimi: %s kabul edildi", ad)
		}
	}
}

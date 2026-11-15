package main

// Heybe defteri (14.11.2026, Özet §144–§145 — Ercan: "Heybe hafızası olsa harika olur"; "accerdon menü gibi gruplar …
// Tıbbi gruba girdim içerisinde Ercan girdim ve arama çubuğunda ateş yazdım"): kullanıcının kaydettiği cevaplar ve kendi
// notları, kendi adlandırdığı iç içe gruplarda. Bellekte heybe/benim/defter.json (acil kart ve yanlış cevap kaydının yanında;
// K18: içerik ve seçim kullanıcının). Yardımcı içeriğe karışmaz: biçimi ve boyutu denetler, güvenli yazar (bir önceki sürüm
// defter.json.onceki). Arama ve gösterme sayfada (modelsiz).
//
// K7 (15.11.2026, Özet §146–§148 — LM: "K7 kararı doğrudan ihlal edilmiştir"; K7: "Kişisel veri standart şifrelemeyle korunur,
// anahtar kullanıcının parolasıdır (USB'de durmaz)"): defter YALNIZ şifreli yazılır. Sayfa defteri kullanıcının parolasıyla
// şifreler (Web Crypto: PBKDF2-SHA256 + AES-GCM-256; veri anahtarı parolayla ve kâğıttaki kurtarma koduyla iki kez sarılı);
// yardımcı yalnız zarfın biçimini denetler, içeriği göremez. 0.34.0'ın şifresiz defteri okunur (sayfa kilidi kurunca şifreleyip
// yazar); o yazımda bir önceki sürümde kalan şifresiz kopya silinir. ?kenara=1: parola da kod da kaybolunca yeni defter açılır,
// eskisi açılmadan defter_kenara_<zaman>.json olarak durur (kod sonra bulunursa adı defter.json yapılıp açılır).

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
	"unicode/utf8"
)

const (
	defterSiniri      = 4 << 20 // bayt
	defterGrupSiniri  = 500
	defterKayitSiniri = 5000
)

func defterYolu() string { return filepath.Join(benimDir, "defter.json") }

// defterDenetle: {"surum":1,"gruplar":[{"id":…,"ad":…,"ust":…}],"kayitlar":[{"id":…,"grup":…,…}]} — kimlik (UID) her öğede
// zorunlu ve tekil; kayıtların grubu var olan bir grup ya da boş (gruplanmamış)
func defterDenetle(b []byte) (map[string]any, int, string) {
	if len(b) > defterSiniri {
		return nil, 413, "defter çok büyük"
	}
	if !utf8.Valid(b) {
		return nil, 400, "defter UTF-8 değil"
	}
	var d map[string]any
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, 400, "defter okunamadı"
	}
	gruplar, ok1 := d["gruplar"].([]any)
	kayitlar, ok2 := d["kayitlar"].([]any)
	if !ok1 || !ok2 {
		return nil, 400, "defterde gruplar ya da kayıtlar yok"
	}
	if len(gruplar) > defterGrupSiniri || len(kayitlar) > defterKayitSiniri {
		return nil, 413, "defterde çok fazla öğe"
	}
	grupVar := map[string]bool{}
	kimlik := map[string]bool{}
	for _, g := range gruplar {
		m, ok := g.(map[string]any)
		id, _ := m["id"].(string)
		if !ok || id == "" || kimlik[id] {
			return nil, 400, "grubun kimliği eksik ya da yinelenmiş"
		}
		kimlik[id] = true
		grupVar[id] = true
	}
	for _, g := range gruplar {
		if ust, _ := g.(map[string]any)["ust"].(string); ust != "" && !grupVar[ust] {
			return nil, 400, "üst grup yok"
		}
	}
	for _, k := range kayitlar {
		m, ok := k.(map[string]any)
		id, _ := m["id"].(string)
		if !ok || id == "" || kimlik[id] {
			return nil, 400, "kaydın kimliği eksik ya da yinelenmiş"
		}
		kimlik[id] = true
		if grup, _ := m["grup"].(string); grup != "" && !grupVar[grup] {
			return nil, 400, "kaydın grubu yok"
		}
	}
	return d, 200, ""
}

// defterZarfDenetle: {"surum":2,"sifreli":{"yontem":…,"tekrar":N,"parola":{tuz,iv,veri},"kurtarma":{tuz,iv,veri},
// "defter":{iv,veri}}} — base64 alanların uzunlukları (tuz ≥ 16 bayt, iv 12, sarılı anahtar 32 + 16 doğrulama), düz metin
// alanı yok (gruplar/kayitlar zarfın yanında duramaz)
func defterZarfDenetle(d map[string]any) (int, string) {
	if v, _ := d["surum"].(float64); v != 2 {
		return 400, "şifreli defterin sürümü 2 olmalı"
	}
	if _, ok := d["gruplar"]; ok {
		return 400, "şifreli defterin yanında düz metin olamaz"
	}
	if _, ok := d["kayitlar"]; ok {
		return 400, "şifreli defterin yanında düz metin olamaz"
	}
	s, ok := d["sifreli"].(map[string]any)
	if !ok {
		return 400, "şifreli zarf yok"
	}
	if t, _ := s["tekrar"].(float64); t < 100000 || t > 10000000 {
		return 400, "anahtar türetme tekrarı geçersiz"
	}
	alan := func(kutu map[string]any, ad string, en, tam int) bool {
		v, _ := kutu[ad].(string)
		b, err := base64.StdEncoding.DecodeString(v)
		return err == nil && len(b) >= en && (tam == 0 || len(b) == tam)
	}
	for _, ad := range []string{"parola", "kurtarma"} {
		k, ok := s[ad].(map[string]any)
		if !ok || !alan(k, "tuz", 16, 0) || !alan(k, "iv", 12, 12) || !alan(k, "veri", 48, 48) {
			return 400, "sarılı anahtar (" + ad + ") geçersiz"
		}
	}
	k, ok := s["defter"].(map[string]any)
	if !ok || !alan(k, "iv", 12, 12) || !alan(k, "veri", 17, 0) {
		return 400, "şifreli defter geçersiz"
	}
	return 200, ""
}

func sifreliMi(b []byte) bool {
	var d map[string]any
	if json.Unmarshal(b, &d) != nil {
		return false
	}
	_, ok := d["sifreli"]
	return ok
}

// GET /api/defter → defter (şifreli zarf; eski şifresiz defter de okunur; yoksa boş) · POST şifreli zarf → denetlenip yazılır
// (şifresiz POST reddedilir — K7)
func apiDefter(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		b, err := io.ReadAll(io.LimitReader(r.Body, defterSiniri+1))
		if err != nil || len(b) > defterSiniri {
			hata(w, 413, "defter çok büyük")
			return
		}
		var d map[string]any
		if !utf8.Valid(b) || json.Unmarshal(b, &d) != nil {
			hata(w, 400, "defter okunamadı")
			return
		}
		if _, ok := d["sifreli"]; !ok {
			hata(w, 400, "defter şifresiz yazılmaz (K7)")
			return
		}
		if kod, neden := defterZarfDenetle(d); kod != 200 {
			hata(w, kod, neden)
			return
		}
		cikti, _ := json.MarshalIndent(d, "", " ")
		benimKilit.Lock()
		defer benimKilit.Unlock()
		yol := defterYolu()
		if r.URL.Query().Get("kenara") == "1" {
			if eski, err := os.ReadFile(yol); err == nil && sifreliMi(eski) {
				kenar := filepath.Join(benimDir, "defter_kenara_"+time.Now().Format("20060102-150405")+".json")
				if err := os.Rename(yol, kenar); err != nil {
					hata(w, 500, "eski defter kenara konamadı")
					return
				}
			}
		}
		if err := guvenliYaz(yol, cikti); err != nil {
			hata(w, 500, "defter yazılamadı")
			return
		}
		// bir önceki sürüm şifresizse (0.34.0'dan geçiş) bellekte düz metin kalmasın
		if eski, err := os.ReadFile(yol + ".onceki"); err == nil && !sifreliMi(eski) {
			_ = os.Remove(yol + ".onceki")
		}
		jsonYaz(w, 200, map[string]any{"tamam": true})
		return
	}
	benimKilit.Lock()
	b, err := os.ReadFile(defterYolu())
	benimKilit.Unlock()
	if err != nil {
		jsonYaz(w, 200, map[string]any{"surum": 1, "gruplar": []any{}, "kayitlar": []any{}})
		return
	}
	var d map[string]any
	if sifreliMi(b) && len(b) <= defterSiniri && json.Unmarshal(b, &d) == nil {
		if kod, _ := defterZarfDenetle(d); kod == 200 {
			jsonYaz(w, 200, d)
			return
		}
	} else if d, kod, _ := defterDenetle(b); kod == 200 {
		jsonYaz(w, 200, d)
		return
	}
	hata(w, 500, "defter bozuk — bir önceki sürüm defter.json.onceki")
}

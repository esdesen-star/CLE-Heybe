package main

// Genel ayarlar (07.11.2026 gece, Özet §51). Ercan: "İlk kurulumda standart İngilizce açılsın · Browser de kullanıcı
// seçim yapabilsin sonraki seferde hangi dilde açılsın". Seçim belleğin kendisinde durur (heybe/benim/ayar.json):
// bellek hangi bilgisayara takılırsa takılsın açılış ekranı o dilde gelir. Boş = İngilizce (standart).
// Kitap listesinin ayarı ayrı kalır (liste_ayar.json, liste.go).

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type genelAyar struct {
	AcilisDili string `json:"acilisDili"`
}

var (
	dilKodu        = regexp.MustCompile(`^[a-z]{2,3}$`)
	genelAyarKilit sync.Mutex
)

func genelAyarYolu() string { return filepath.Join(benimDir, "ayar.json") }

func genelAyarOku() genelAyar {
	a := genelAyar{}
	if b, err := os.ReadFile(genelAyarYolu()); err == nil {
		_ = json.Unmarshal(b, &a)
	}
	if !dilKodu.MatchString(a.AcilisDili) {
		a.AcilisDili = "" // elle bozulmuş dosya: standart
	}
	return a
}

// GET /api/ayar → {acilisDili} · POST {acilisDili: "tr" | ""} → kaydeder, yenisini döner
func apiAyar(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			AcilisDili *string `json:"acilisDili"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&istek); err != nil {
			jsonYaz(w, 400, map[string]any{"hata": "ayar okunamadı"})
			return
		}
		genelAyarKilit.Lock()
		defer genelAyarKilit.Unlock()
		a := genelAyarOku()
		if istek.AcilisDili != nil {
			d := strings.TrimSpace(*istek.AcilisDili)
			if d != "" && !dilKodu.MatchString(d) {
				jsonYaz(w, 400, map[string]any{"hata": "dil kodu geçersiz"})
				return
			}
			a.AcilisDili = d
		}
		if err := os.MkdirAll(benimDir, 0o755); err != nil {
			jsonYaz(w, 500, map[string]any{"hata": err.Error()})
			return
		}
		b, _ := json.MarshalIndent(a, "", " ")
		if err := guvenliYaz(genelAyarYolu(), b); err != nil {
			jsonYaz(w, 500, map[string]any{"hata": err.Error()})
			return
		}
		jsonYaz(w, 200, a)
		return
	}
	genelAyarKilit.Lock()
	a := genelAyarOku()
	genelAyarKilit.Unlock()
	jsonYaz(w, 200, a)
}

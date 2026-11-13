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
	OkumaKipi  bool   `json:"okumaKipi,omitempty"` // 10.11 (okuma_kipi.go): büyük sohbet modeli açılmaz
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

// genelAyarDegistir: oku → değiştir → güvenle yaz, tek kilit altında. İki uç (/api/ayar, /api/kip) aynı dosyayı yazar;
// kural tek yerde kalsın diye ikisi de bundan geçer (10.11).
func genelAyarDegistir(f func(*genelAyar)) (genelAyar, error) {
	genelAyarKilit.Lock()
	defer genelAyarKilit.Unlock()
	a := genelAyarOku()
	f(&a)
	if err := os.MkdirAll(benimDir, 0o755); err != nil {
		return a, err
	}
	b, _ := json.MarshalIndent(a, "", " ")
	return a, guvenliYaz(genelAyarYolu(), b)
}

// GET /api/ayar → {acilisDili, okumaKipi} · POST {acilisDili: "tr" | ""} → kaydeder, yenisini döner
func apiAyar(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			AcilisDili *string `json:"acilisDili"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&istek); err != nil {
			jsonYaz(w, 400, map[string]any{"hata": "ayar okunamadı"})
			return
		}
		d := ""
		if istek.AcilisDili != nil {
			d = strings.TrimSpace(*istek.AcilisDili)
			if d != "" && !dilKodu.MatchString(d) {
				jsonYaz(w, 400, map[string]any{"hata": "dil kodu geçersiz"})
				return
			}
		}
		a, err := genelAyarDegistir(func(a *genelAyar) {
			if istek.AcilisDili != nil {
				a.AcilisDili = d
			}
		})
		if err != nil {
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

package main

// Acil kart (Ö14, 06.11.2026 — Özet §37): kullanıcının kendi kartı (toplanma yeri, ilaçlar, alerjiler, yakınlarının
// numaraları) bellekte heybe/benim/acil_kart.json'da durur. Sayfa onu modeller açılmadan, ilk saniyede gösterir.
// Heybe kartı kendisi doldurmaz, doğrulanmamış ilk yardım adımı eklemez (K1); yalnız kullanıcının yazdığını saklar.

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type acilKart struct {
	Metin string `json:"metin"`
	Tarih string `json:"tarih"`
}

const acilKartSiniri = 8000 // harf

func acilKartYolu() string { return filepath.Join(benimDir, "acil_kart.json") }

// GET /api/acil-kart → {"metin": …, "tarih": …} · POST {"metin": …} → kaydeder (boş metin kartı boşaltır;
// bir önceki sürüm acil_kart.json.onceki olarak kalır)
func apiAcilKart(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			Metin string `json:"metin"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&istek); err != nil {
			hata(w, 400, "kart okunamadı")
			return
		}
		metin := strings.TrimSpace(strings.ReplaceAll(istek.Metin, "\r\n", "\n"))
		if !utf8.ValidString(metin) || utf8.RuneCountInString(metin) > acilKartSiniri {
			hata(w, 413, "kart çok uzun")
			return
		}
		k := acilKart{Metin: metin, Tarih: time.Now().Format(time.RFC3339)}
		b, _ := json.MarshalIndent(k, "", " ")
		benimKilit.Lock()
		err := guvenliYaz(acilKartYolu(), b)
		benimKilit.Unlock()
		if err != nil {
			hata(w, 500, "kart yazılamadı")
			return
		}
		jsonYaz(w, 200, k)
		return
	}
	k := acilKart{}
	benimKilit.Lock()
	b, err := os.ReadFile(acilKartYolu())
	benimKilit.Unlock()
	if err == nil {
		_ = json.Unmarshal(b, &k)
	}
	jsonYaz(w, 200, k)
}

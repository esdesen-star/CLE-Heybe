package main

// Okuma kipi, 2. adım (10.11.2026, Planlama 8c, Özet §106 — Ercan 07.11: "RAM yetmez ya da modeller açılmazsa Heybe
// tarayıcı gibi çalışır"). Kullanıcı seçerse büyük sohbet modeli hiç açılmaz: bellek ve pil kalır. Başlatıcılar
// açılışta GET /api/kip'e bakar ("okuma" ise sohbet modelini başlatmaz); inen sohbet modeli de kendiliğinden açılmaz.
// Küçük anlam modeli açık kalır: okuma kipinin sıralamasını o yapar (§101: alıntı ilk 6'da 16 → 45/75), 0,3 GB.
// Seçim belleğin kendisinde (heybe/benim/ayar.json): bellek hangi bilgisayara takılırsa takılsın aynı kip.
// Kapatılınca sohbet modeli hemen açılır. Açıkken seçilirse bellek Heybe yeniden açılınca boşalır: sohbet modelini
// başlatıcı açtı, yardımcı onun sürecini tutmuyor.

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

func okumaKipiAcik() bool {
	genelAyarKilit.Lock()
	defer genelAyarKilit.Unlock()
	return genelAyarOku().OkumaKipi
}

// kendiliğinden açılsın mı (indirme bitince): okuma kipinde sohbet modeli açılmaz
func modelKendiligindenAcilsin(m modelKaydi) bool {
	return modelAcilsin && m.Ne != "cevirmen" && !(m.Ne == "sohbet" && okumaKipiAcik())
}

// GET /api/kip → "okuma" | "tam" (düz metin: Windows başlatıcısı `find` ile okur, tırnak kaçışı gerekmez)
// POST /api/kip {"kip": "okuma" | "tam"} → kaydeder; "tam" ise sohbet modelini açar (dosyası varsa)
func apiKip(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			Kip string `json:"kip"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&istek); err != nil || (istek.Kip != "okuma" && istek.Kip != "tam") {
			hata(w, 400, `kip "okuma" ya da "tam" olmalı`)
			return
		}
		if _, err := genelAyarDegistir(func(a *genelAyar) { a.OkumaKipi = istek.Kip == "okuma" }); err != nil {
			hata(w, 500, err.Error())
			return
		}
		if istek.Kip == "tam" && modelAcilsin {
			for _, m := range modeller {
				if m.Ne == "sohbet" && modelVar(m) {
					if err := modelSunucusuAc(m); err != nil {
						log.Printf("sohbet modeli açılamadı: %v", err)
					}
				}
			}
		}
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if okumaKipiAcik() {
		fmt.Fprintln(w, "okuma")
	} else {
		fmt.Fprintln(w, "tam")
	}
}

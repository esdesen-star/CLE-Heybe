package main

// Bağlantıdan ekleme (Ercan 07.11: "Diğer kütüphaneleri büyük ihtimalle web linkini yazar sistem öyle indirir").
// (1) Kitap: https ile biten .zim ya da .meta4 bağlantısı. Kiwix'in kendi adresi her zamanki imzalı yoldan iner.
//     Başka sitenin .meta4'ü imzalıdır ama "Kiwix dışı" diye işaretlenir; doğrudan .zim'de imza yoktur: dosya
//     kitaplığa eklenebiliyorsa geçerli bir ZIM sayılır, "Kiwix dışı, imzasız" diye işaretlenir.
// (2) Dosya: PDF, metin, resim, video bağlantısı → yardımcı program indirir, sayfaya verir; sayfa onu kullanıcının
//     kendi dosyası gibi forma koyar (dil tahmini, açıklama, "Ekle" — her zamanki yol).
// Güvenlik: yalnız https; yerel ağ ve bu bilgisayarın adresleri reddedilir (yönlendirmede de); istek yalnız Heybe
// sayfasından gelir (X-Heybe başlığı, guvenlik()).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func adresGuvenli(u *url.URL) error {
	if u.Scheme != "https" {
		return errors.New("yalnız https bağlantısı")
	}
	ctx, iptal := context.WithTimeout(context.Background(), 10*time.Second)
	defer iptal()
	ipler, err := net.DefaultResolver.LookupIPAddr(ctx, u.Hostname())
	if err != nil || len(ipler) == 0 {
		return errors.New("adres bulunamadı")
	}
	for _, ip := range ipler {
		if ip.IP.IsLoopback() || ip.IP.IsPrivate() || ip.IP.IsLinkLocalUnicast() || ip.IP.IsUnspecified() {
			return errors.New("yerel ağ adresine bağlanılmaz")
		}
	}
	return nil
}

var disIstemci = &http.Client{
	Timeout: 0, // dosya büyük olabilir; iptal bağlamla
	CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 5 {
			return errors.New("çok fazla yönlendirme")
		}
		return adresGuvenli(r.URL)
	},
}

// POST /api/baglanti {"adres": "https://…/kitap.zim"}
func apiBaglanti(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		Adres string `json:"adres"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<13)).Decode(&istek); err != nil {
		hata(w, 400, "istek okunamadı")
		return
	}
	u, err := url.Parse(strings.TrimSpace(istek.Adres))
	if err != nil {
		hata(w, 400, "bağlantı okunamadı")
		return
	}
	if err := adresGuvenli(u); err != nil {
		hata(w, 400, err.Error())
		return
	}
	yol := strings.ToLower(u.Path)
	var ad string
	var kod int
	switch {
	case strings.HasSuffix(yol, ".meta4"):
		_, kiwix := kiwixAdresi(u.String())
		ad, kod, err = indirmeKur(u.String(), "", !kiwix, false)
	case strings.HasSuffix(yol, ".zim"):
		if _, kiwix := kiwixAdresi(u.String()); kiwix { // Kiwix'in her .zim'inin yanında imzalı .meta4'ü var
			ad, kod, err = indirmeKur(u.String()+".meta4", "", false, false)
		} else {
			ad, kod, err = indirmeKur(u.String(), "", true, true)
		}
	default:
		hata(w, 400, "kitap bağlantısı .zim ya da .meta4 ile bitmeli")
		return
	}
	if err != nil {
		hata(w, kod, err.Error())
		return
	}
	jsonYaz(w, 200, map[string]string{"ad": ad})
}

// POST /api/baglanti-dosya {"adres": …} → dosyanın kendisi (en çok 300 MB); sayfa onu forma koyar
func apiBaglantiDosya(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		Adres string `json:"adres"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<13)).Decode(&istek); err != nil {
		hata(w, 400, "istek okunamadı")
		return
	}
	u, err := url.Parse(strings.TrimSpace(istek.Adres))
	if err == nil {
		err = adresGuvenli(u)
	}
	if err != nil {
		hata(w, 400, "bağlantı kullanılamaz: "+fmt.Sprint(err))
		return
	}
	uz := strings.ToLower(filepath.Ext(u.Path))
	if izinliUzanti[uz] == "" {
		hata(w, 400, "bu tür dosya eklenmez (PDF, TXT, MD, resim, video)")
		return
	}
	ctx, iptal := context.WithTimeout(r.Context(), 30*time.Minute)
	defer iptal()
	istekDis, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	yanit, err := disIstemci.Do(istekDis)
	if err != nil {
		hata(w, 502, "dosya indirilemedi")
		return
	}
	defer yanit.Body.Close()
	if yanit.StatusCode != http.StatusOK {
		hata(w, 502, fmt.Sprintf("dosya indirilemedi (HTTP %d)", yanit.StatusCode))
		return
	}
	const sinir = 300 << 20
	if yanit.ContentLength > sinir {
		hata(w, 413, "dosya 300 MB'tan büyük")
		return
	}
	ad := guvenliAd(filepath.Base(u.Path), uz) // uzantıyı kendisi ekler (07.11: "dummy.pdf.pdf")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Heybe-Dosya", url.PathEscape(ad))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, io.LimitReader(yanit.Body, sinir))
}

// ---- Kiwix dışı kitapların kaydı: kutuphane/dis_kaynaklar.json ----

type disKaynak struct {
	Adres  string `json:"adres"`
	Imzali bool   `json:"imzali"`
	Tarih  string `json:"tarih"`
}

var disKilit sync.Mutex

func disKaynakYolu() string { return filepath.Join(kutuphaneDir, "dis_kaynaklar.json") }

func disKaynakOku() map[string]disKaynak {
	k := map[string]disKaynak{}
	if b, err := os.ReadFile(disKaynakYolu()); err == nil {
		_ = json.Unmarshal(b, &k)
	}
	return k
}

func disKaynakYaz(dosya, adres string, imzali bool) {
	disKilit.Lock()
	defer disKilit.Unlock()
	k := disKaynakOku()
	k[dosya] = disKaynak{Adres: adres, Imzali: imzali, Tarih: time.Now().Format(time.RFC3339)}
	b, _ := json.MarshalIndent(k, "", " ")
	_ = guvenliYaz(disKaynakYolu(), b)
}

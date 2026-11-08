package main

// Kitap listesi (Ö11, 07.11.2026 — Ercan 06.11: "belirli listeyi eklersen Heybe oradan otomatik indirir ve günceller").
// Kullanıcının listesi heybe/benim/liste.txt: her satırda bir kitap, tarihsiz dosya adıyla ("wikipedia_tr_top_nopic").
// "#" sonrası açıklamadır. Liste yalnız ad taşır, içerik taşımaz: paylaşılabilir, her kullanıcı kitabı kendisi indirir
// (K18/K19). Heybe internet varken listeyi Kiwix kataloğuyla karşılaştırır: eksik olan iner; yeni sürüm çıkınca
// yenisi iner, imzası tutunca eskisi kaldırılır (K5). Kendiliğinden yapması kullanıcının seçimidir (liste_ayar.json).

import (
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type listeKalem struct {
	Kok string `json:"kok"` // tarihsiz dosya adı: wikipedia_tr_top_nopic
	Not string `json:"not"`
}

type listeAyar struct {
	Otomatik bool   `json:"otomatik"`
	SonBakis string `json:"sonBakis,omitempty"`
}

var (
	kokAdi     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{1,120}$`)
	tarihEki   = regexp.MustCompile(`_(\d{4}-\d{2})$`)
	cesitEki   = regexp.MustCompile(`_(mini|nopic|maxi)$`)
	listeKilit sync.Mutex
)

func listeYolu() string { return filepath.Join(benimDir, "liste.txt") }
func ayarYolu() string  { return filepath.Join(benimDir, "liste_ayar.json") }

// kokVeTarih: "wikipedia_tr_top_nopic_2026-10.zim" → ("wikipedia_tr_top_nopic", "2026-10")
func kokVeTarih(dosya string) (string, string) {
	ad := strings.TrimSuffix(strings.TrimSuffix(filepath.Base(dosya), ".meta4"), ".zim")
	if m := tarihEki.FindStringSubmatch(ad); m != nil {
		return strings.TrimSuffix(ad, "_"+m[1]), m[1]
	}
	return ad, ""
}

func listeCoz(metin string) []listeKalem {
	var kalemler []listeKalem
	gorulen := map[string]bool{}
	for _, satir := range strings.Split(strings.ReplaceAll(metin, "\r\n", "\n"), "\n") {
		satir = strings.TrimSpace(satir)
		if satir == "" || strings.HasPrefix(satir, "#") {
			continue
		}
		not := ""
		if i := strings.Index(satir, "#"); i >= 0 {
			not = strings.TrimSpace(satir[i+1:])
			satir = strings.TrimSpace(satir[:i])
		}
		alanlar := strings.Fields(satir)
		if len(alanlar) == 0 {
			continue
		}
		kok, _ := kokVeTarih(alanlar[0]) // dosya adı tarihle yazılmışsa da kabul
		if !kokAdi.MatchString(kok) || gorulen[strings.ToLower(kok)] {
			continue
		}
		gorulen[strings.ToLower(kok)] = true
		kalemler = append(kalemler, listeKalem{Kok: kok, Not: not})
	}
	return kalemler
}

func listeOku() (string, []listeKalem) {
	b, err := os.ReadFile(listeYolu())
	if err != nil {
		return "", nil
	}
	return string(b), listeCoz(string(b))
}

func ayarOku() listeAyar {
	a := listeAyar{}
	if b, err := os.ReadFile(ayarYolu()); err == nil {
		_ = json.Unmarshal(b, &a)
	}
	return a
}

func ayarYaz(a listeAyar) error {
	b, _ := json.MarshalIndent(a, "", " ")
	return guvenliYaz(ayarYolu(), b)
}

// GET /api/liste → {metin, kalemler, otomatik} · POST {metin?, otomatik?} → kaydeder
func apiListe(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			Metin    *string `json:"metin"`
			Otomatik *bool   `json:"otomatik"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 128<<10)).Decode(&istek); err != nil {
			hata(w, 400, "liste okunamadı")
			return
		}
		listeKilit.Lock()
		defer listeKilit.Unlock()
		if istek.Metin != nil {
			if !utf8.ValidString(*istek.Metin) || len(*istek.Metin) > 64<<10 {
				hata(w, 413, "liste çok uzun")
				return
			}
			if err := guvenliYaz(listeYolu(), []byte(strings.ReplaceAll(*istek.Metin, "\r\n", "\n"))); err != nil {
				hata(w, 500, "liste yazılamadı")
				return
			}
		}
		if istek.Otomatik != nil {
			a := ayarOku()
			a.Otomatik = *istek.Otomatik
			if err := ayarYaz(a); err != nil {
				hata(w, 500, "ayar yazılamadı")
				return
			}
		}
	}
	metin, kalemler := listeOku()
	if kalemler == nil {
		kalemler = []listeKalem{}
	}
	jsonYaz(w, 200, map[string]any{"metin": metin, "kalemler": kalemler, "otomatik": ayarOku().Otomatik})
}

// ---- katalogla karşılaştırma ----

type opdsAkis struct {
	Girdiler []struct {
		Ad     string `xml:"name"`
		Baslik string `xml:"title"`
		Dil    string `xml:"language"`
		Bag    []struct {
			Tur   string `xml:"type,attr"`
			Href  string `xml:"href,attr"`
			Boyut int64  `xml:"length,attr"`
		} `xml:"link"`
	} `xml:"entry"`
}

type listeDurumu struct {
	Kok    string `json:"kok"`
	Not    string `json:"not,omitempty"`
	Durum  string `json:"durum"` // bellekte · eksik · yeni · bulunamadi · internetYok · iniyor
	Yerel  string `json:"yerel,omitempty"`
	Yeni   string `json:"yeni,omitempty"`
	Baslik string `json:"baslik,omitempty"`
	Dil    string `json:"dil,omitempty"`
	Boyut  int64  `json:"boyut,omitempty"`
	Meta4  string `json:"meta4,omitempty"`
}

// katalogBul: kitabın katalogdaki en yeni sürümü (meta4 adresi, dosya adı, boyut)
func katalogBul(kok string) (listeDurumu, error) {
	seri := cesitEki.ReplaceAllString(kok, "")
	q := url.Values{"name": {seri}, "count": {"40"}}
	yanit, err := istemci.Get("https://opds.library.kiwix.org/catalog/v2/entries?" + q.Encode())
	if err != nil {
		return listeDurumu{}, err
	}
	defer yanit.Body.Close()
	if yanit.StatusCode != http.StatusOK {
		return listeDurumu{}, fmt.Errorf("katalog: HTTP %d", yanit.StatusCode)
	}
	var akis opdsAkis
	if err := xml.NewDecoder(io.LimitReader(yanit.Body, 8<<20)).Decode(&akis); err != nil {
		return listeDurumu{}, err
	}
	en := listeDurumu{Kok: kok, Durum: "bulunamadi"}
	enTarih := ""
	for _, g := range akis.Girdiler {
		for _, b := range g.Bag {
			if b.Tur != "application/x-zim" || !strings.HasSuffix(b.Href, ".meta4") {
				continue
			}
			k, t := kokVeTarih(b.Href)
			if !strings.EqualFold(k, kok) || t < enTarih {
				continue
			}
			enTarih = t
			en = listeDurumu{Kok: kok, Durum: "eksik", Yeni: strings.TrimSuffix(filepath.Base(b.Href), ".meta4"),
				Baslik: g.Baslik, Dil: g.Dil, Boyut: b.Boyut, Meta4: b.Href}
		}
	}
	return en, nil
}

func listeDurumlari() ([]listeDurumu, error) {
	_, kalemler := listeOku()
	yerel := map[string][2]string{} // kök → (dosya, tarih)
	if kitaplar, err := kitaplariOku(); err == nil {
		for _, k := range kitaplar {
			dosya := filepath.Base(filepath.FromSlash(k.Path))
			kok, tarih := kokVeTarih(dosya)
			if onceki, var_ := yerel[strings.ToLower(kok)]; !var_ || tarih > onceki[1] {
				yerel[strings.ToLower(kok)] = [2]string{dosya, tarih}
			}
		}
	}
	var sonuc []listeDurumu
	internetYok := false
	for _, k := range kalemler {
		y, bellekte := yerel[strings.ToLower(k.Kok)]
		d := listeDurumu{Kok: k.Kok, Not: k.Not}
		if !internetYok {
			kat, err := katalogBul(k.Kok)
			if err != nil {
				internetYok = true
			} else {
				d = kat
				d.Not = k.Not
			}
		}
		if internetYok {
			d.Durum = "internetYok"
		}
		if bellekte { // bellekteyse internet olmasa da bellektedir; yalnız yeni sürüme bakılamaz
			d.Yerel = y[0]
			if _, yeniTarih := kokVeTarih(d.Yeni); d.Durum == "eksik" && yeniTarih > y[1] {
				d.Durum = "yeni"
			} else {
				d.Durum = "bellekte"
			}
		}
		if d.Yeni != "" && indiriliyor(d.Yeni) {
			d.Durum = "iniyor"
		}
		sonuc = append(sonuc, d)
	}
	if sonuc == nil {
		sonuc = []listeDurumu{}
	}
	if internetYok {
		return sonuc, errors.New("internet yok ya da Kiwix kataloğuna ulaşılamadı")
	}
	return sonuc, nil
}

// GET /api/liste-durum
func apiListeDurum(w http.ResponseWriter, r *http.Request) {
	d, err := listeDurumlari()
	cevap := map[string]any{"kalemler": d}
	if err != nil {
		cevap["hata"] = err.Error()
	}
	jsonYaz(w, 200, cevap)
}

// listeyiUygula: eksikleri indirir; guncelle ise yeni sürümleri de (eskisi, yenisi doğrulanınca kaldırılır)
func listeyiUygula(guncelle bool) ([]string, error) {
	durumlar, err := listeDurumlari()
	if err != nil {
		return nil, err
	}
	var baslayan []string
	for _, d := range durumlar {
		eski := ""
		switch {
		case d.Durum == "eksik":
		case d.Durum == "yeni" && guncelle:
			eski = d.Yerel
		default:
			continue
		}
		if ad, _, err := indirmeBaslat(d.Meta4, eski); err == nil {
			baslayan = append(baslayan, ad)
		} else {
			log.Printf("liste: %s başlatılamadı: %v", d.Kok, err)
		}
	}
	a := ayarOku()
	a.SonBakis = time.Now().Format(time.RFC3339)
	_ = ayarYaz(a)
	return baslayan, nil
}

// POST /api/liste-uygula {"guncelle": true}
func apiListeUygula(w http.ResponseWriter, r *http.Request) {
	if !yalnizPost(w, r) {
		return
	}
	var istek struct {
		Guncelle bool `json:"guncelle"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&istek)
	baslayan, err := listeyiUygula(istek.Guncelle)
	if err != nil {
		hata(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if baslayan == nil {
		baslayan = []string{}
	}
	jsonYaz(w, 200, map[string]any{"baslayan": baslayan})
}

// kendiliğinden: kullanıcı seçtiyse açılıştan 1 dakika sonra ve 6 saatte bir (internet yoksa sessizce geçer)
func listeyiKendiligindenUygula() {
	time.Sleep(time.Minute)
	for {
		if ayarOku().Otomatik {
			if _, kalemler := listeOku(); len(kalemler) > 0 {
				if baslayan, err := listeyiUygula(true); err == nil && len(baslayan) > 0 {
					log.Printf("liste kendiliğinden: %s", strings.Join(baslayan, ", "))
				}
			}
		}
		time.Sleep(6 * time.Hour)
	}
}

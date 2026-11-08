package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestKokVeTarih(t *testing.T) {
	for _, d := range [][3]string{
		{"wikipedia_tr_top_nopic_2026-10.zim", "wikipedia_tr_top_nopic", "2026-10"},
		{"https://download.kiwix.org/zim/x/zimgit-water_en_2024-08.zim.meta4", "zimgit-water_en", "2024-08"},
		{"mdwiki_en_all_2025-11.zim", "mdwiki_en_all", "2025-11"},
		{"heybe_sinav_tr_2026-11.zim", "heybe_sinav_tr", "2026-11"},
		{"kendi_kitabim.zim", "kendi_kitabim", ""},
	} {
		k, tr := kokVeTarih(d[0])
		if k != d[1] || tr != d[2] {
			t.Errorf("%s → %s %s, beklenen %s %s", d[0], k, tr, d[1], d[2])
		}
	}
}

func TestListeCoz(t *testing.T) {
	k := listeCoz("# Türkçe temel\nwikipedia_tr_top_nopic   # en iyi makaleler\n\nwikibooks_tr_all_nopic_2026-09.zim\nWIKIPEDIA_TR_TOP_NOPIC\n../kötü yol\n  \t \nzimgit-water_en#su\n")
	if len(k) != 3 || k[0].Kok != "wikipedia_tr_top_nopic" || k[0].Not != "en iyi makaleler" || k[1].Kok != "wikibooks_tr_all_nopic" || k[2].Kok != "zimgit-water_en" || k[2].Not != "su" {
		t.Errorf("liste yanlış çözüldü: %+v", k)
	}
}

// internet gerektirir: HEYBE_AG=1 go test -run Katalog
func TestKatalogBul(t *testing.T) {
	if os.Getenv("HEYBE_AG") == "" {
		t.Skip("internet sınavı: HEYBE_AG=1")
	}
	for _, kok := range []string{"wikipedia_tr_top_nopic", "zimgit-water_en", "mdwiki_en_all_maxi", "mdwiki_en_all", "boyle_bir_kitap_yok"} {
		d, err := katalogBul(kok)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("%-24s %-10s %-45s %d", kok, d.Durum, d.Yeni, d.Boyut)
		if kok != "boyle_bir_kitap_yok" && (d.Durum != "eksik" || d.Meta4 == "") {
			t.Errorf("%s katalogda bulunamadı", kok)
		}
	}
}

// hazır listelerin her satırı çözülmeli; HEYBE_AG=1 ile her kitap katalogda bulunmalı
func TestHazirListeler(t *testing.T) {
	dosyalar, _ := filepath.Glob("../usb_kok/heybe/listeler/*.txt")
	if len(dosyalar) == 0 {
		t.Fatal("hazır liste yok")
	}
	for _, f := range dosyalar {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		k := listeCoz(string(b))
		if len(k) == 0 {
			t.Errorf("%s boş", f)
		}
		if os.Getenv("HEYBE_AG") == "" {
			continue
		}
		var toplam int64
		for _, x := range k {
			d, err := katalogBul(x.Kok)
			if err != nil || d.Durum != "eksik" {
				t.Errorf("%s: %s katalogda yok (%v)", filepath.Base(f), x.Kok, err)
			}
			toplam += d.Boyut
		}
		t.Logf("%-18s %d kitap, %.0f MB", filepath.Base(f), len(k), float64(toplam)/1e6)
	}
}

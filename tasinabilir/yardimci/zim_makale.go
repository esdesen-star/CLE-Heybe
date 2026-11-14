package main

// Küçük kitabın makale listesi (13.11.2026, Özet §122 — konu uyumu bekçisi). Kütüphane sunucusu (kiwix-serve) bir kitabın
// bütün makalelerini listelemez; bekçi ise soruyu kitabın BÜTÜN paragraflarına karşı sıralamak ister (cevabın dayandığı
// makale bu bağımsız sıralamanın birincisi mi?). ZIM dosyasının kendi dizini okunur: başlık, MIME listesi, yol işaretçileri,
// dizin girdileri. Sıkıştırılmış içeriğe dokunulmaz; makalenin metnini sayfa yine kütüphane sunucusundan alır.
// Yalnız küçük kitap: girdi sayısı zimGirdiSiniri'ndan çoksa liste verilmez (Vikipedi gibi kitapta bekçi yok).
// Biçim: https://wiki.openzim.org/wiki/ZIM_file_format — sürüm 5 ve 6 (eski "A", yeni "C" ad alanı).

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	zimSihir       = 72173914 // 0x044D495A
	zimGirdiSiniri = 20000    // bundan çok girdili kitap "küçük" değildir
)

type zimMakale struct {
	Yol string `json:"yol"` // kütüphane sunucusunun /raw/<kitap>/content/ yolu
	Ad  string `json:"ad"`
}

var errZimBuyuk = errors.New("zim-buyuk")

// zimMakaleleri: ZIM'in HTML makaleleri (yönlendirmeler ve HTML olmayanlar hariç), dizin sırasıyla
func zimMakaleleri(dosya string) ([]zimMakale, error) {
	f, err := os.Open(dosya)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	bas := make([]byte, 80)
	if _, err := f.ReadAt(bas, 0); err != nil {
		return nil, err
	}
	le := binary.LittleEndian
	if le.Uint32(bas[0:]) != zimSihir {
		return nil, errors.New("zim-degil")
	}
	girdi := le.Uint32(bas[24:])
	yolPtr, mimePtr := le.Uint64(bas[32:]), le.Uint64(bas[56:])
	if girdi > zimGirdiSiniri {
		return nil, errZimBuyuk
	}
	// MIME listesi: sıfırla biten dizgiler, boş dizgiyle biter
	mimeHam := make([]byte, 4096)
	n, err := f.ReadAt(mimeHam, int64(mimePtr))
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	var mimeler []string
	for _, p := range bytes.Split(mimeHam[:n], []byte{0}) {
		if len(p) == 0 {
			break
		}
		mimeler = append(mimeler, string(p))
	}
	ptr := make([]byte, 8*int(girdi))
	if _, err := f.ReadAt(ptr, int64(yolPtr)); err != nil {
		return nil, err
	}
	var liste []zimMakale
	buf := make([]byte, 1024)
	for i := 0; i < int(girdi); i++ {
		n, err := f.ReadAt(buf, int64(le.Uint64(ptr[8*i:])))
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, err
		}
		g := buf[:n]
		if len(g) < 12 {
			continue
		}
		mime := le.Uint16(g[0:])
		if mime >= 0xfffd || int(mime) >= len(mimeler) || !strings.HasPrefix(mimeler[mime], "text/html") {
			continue // yönlendirme, bağlantı hedefi, silinmiş ya da HTML değil
		}
		ad := g[3]
		if ad != 'A' && ad != 'C' || len(g) < 16 {
			continue
		}
		metin := g[16:]
		y := bytes.IndexByte(metin, 0)
		if y < 0 {
			continue
		}
		yol := string(metin[:y])
		baslik := yol
		if t := bytes.IndexByte(metin[y+1:], 0); t > 0 {
			baslik = string(metin[y+1 : y+1+t])
		}
		if ad == 'A' {
			yol = "A/" + yol // eski ad alanı: kütüphane sunucusu yolu öyle bekler
		}
		liste = append(liste, zimMakale{Yol: yol, Ad: baslik})
	}
	return liste, nil
}

// kitapDosyasi: kütüphane sunucusunun kitap adı (dosya adı, .zim'siz) → kutuphane/ içindeki dosya
func kitapDosyasi(ad string) (string, bool) {
	if ad == "" || strings.ContainsAny(ad, `/\`) || strings.Contains(ad, "..") {
		return "", false
	}
	kayitlar, _ := kitaplariOku()
	for _, k := range kayitlar {
		if strings.TrimSuffix(filepath.Base(k.Path), ".zim") == ad {
			p := k.Path
			if !filepath.IsAbs(p) {
				p = filepath.Join(kutuphaneDir, p)
			}
			return p, true
		}
	}
	p := filepath.Join(kutuphaneDir, ad+".zim")
	if _, err := os.Stat(p); err == nil {
		return p, true
	}
	return "", false
}

// /api/makaleler?kitap=<ad> → {"makaleler": [{yol, ad}]} · büyük kitap 413 · yok 404
func apiMakaleler(w http.ResponseWriter, r *http.Request) {
	p, ok := kitapDosyasi(r.URL.Query().Get("kitap"))
	if !ok {
		jsonYaz(w, 404, map[string]string{"hata": "kitap-yok"})
		return
	}
	liste, err := zimMakaleleri(p)
	if errors.Is(err, errZimBuyuk) {
		jsonYaz(w, 413, map[string]string{"hata": "buyuk"})
		return
	}
	if err != nil {
		jsonYaz(w, 500, map[string]string{"hata": "okunamadi"})
		return
	}
	jsonYaz(w, 200, map[string]any{"makaleler": liste})
}

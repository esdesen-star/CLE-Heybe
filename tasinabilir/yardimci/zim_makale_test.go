package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// tZimGirdi: sahte ZIM'in bir dizin girdisi (mime 0xffff = yönlendirme)
type tZimGirdi struct {
	mime     uint16
	ad       byte
	yol, bas string
}

// sahteZim: başlık + MIME listesi + dizin girdileri + yol işaretçileri (içerik kümeleri yok — okuyucu onlara dokunmaz)
func sahteZim(t *testing.T, dosya string, girdiler []tZimGirdi, girdiSayisi uint32) {
	t.Helper()
	le := binary.LittleEndian
	var b bytes.Buffer
	b.Write(make([]byte, 80))
	mimePos := b.Len()
	b.WriteString("text/html\x00image/png\x00text/plain\x00\x00")
	var ptr []uint64
	for _, g := range girdiler {
		ptr = append(ptr, uint64(b.Len()))
		h := make([]byte, 16)
		le.PutUint16(h[0:], g.mime)
		h[3] = g.ad
		if g.mime == 0xffff {
			h = h[:12] // yönlendirme: küme/blob yerine tek hedef sırası
		}
		b.Write(h)
		b.WriteString(g.yol + "\x00" + g.bas + "\x00")
	}
	yolPos := b.Len()
	for _, p := range ptr {
		x := make([]byte, 8)
		le.PutUint64(x, p)
		b.Write(x)
	}
	z := b.Bytes()
	le.PutUint32(z[0:], zimSihir)
	le.PutUint16(z[4:], 6)
	le.PutUint32(z[24:], girdiSayisi)
	le.PutUint64(z[32:], uint64(yolPos))
	le.PutUint64(z[56:], uint64(mimePos))
	if err := os.WriteFile(dosya, z, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestZimMakaleleri(t *testing.T) {
	d := t.TempDir()
	girdiler := []tZimGirdi{
		{0, 'C', "Fractures,_sprains_and_strains", "Fractures, sprains and strains"},
		{1, 'C', "logo.png", ""},        // HTML değil
		{0xffff, 'C', "Kirik", ""},      // yönlendirme
		{0, 'C', "Shock", ""},           // başlık boş → yol
		{0, 'A', "Eski_makale", "Eski"}, // eski ad alanı
		{2, 'M', "Title", ""},           // üst bilgi
	}
	p := filepath.Join(d, "kitap.zim")
	sahteZim(t, p, girdiler, uint32(len(girdiler)))
	l, err := zimMakaleleri(p)
	if err != nil {
		t.Fatal(err)
	}
	istenen := []zimMakale{{"Fractures,_sprains_and_strains", "Fractures, sprains and strains"}, {"Shock", "Shock"}, {"A/Eski_makale", "Eski"}}
	if len(l) != len(istenen) {
		t.Fatalf("yalnız HTML makaleler (yönlendirme, resim, üst bilgi hariç) gelmeli: %+v", l)
	}
	for i := range istenen {
		if l[i] != istenen[i] {
			t.Fatalf("%d. makale %+v, beklenen %+v", i, l[i], istenen[i])
		}
	}
	// büyük kitap listelenmez
	b := filepath.Join(d, "buyuk.zim")
	sahteZim(t, b, girdiler[:1], zimGirdiSiniri+1)
	if _, err := zimMakaleleri(b); err != errZimBuyuk {
		t.Fatalf("büyük kitap errZimBuyuk vermeli: %v", err)
	}
	// ZIM olmayan dosya
	os.WriteFile(filepath.Join(d, "bos.zim"), make([]byte, 100), 0o644)
	if _, err := zimMakaleleri(filepath.Join(d, "bos.zim")); err == nil {
		t.Fatal("ZIM olmayan dosya hata vermeli")
	}
}

func TestApiMakaleler(t *testing.T) {
	d := t.TempDir()
	eskiDir, eskiXML := kutuphaneDir, kutuphaneXML
	kutuphaneDir, kutuphaneXML = d, filepath.Join(d, "kutuphane.xml")
	t.Cleanup(func() { kutuphaneDir, kutuphaneXML = eskiDir, eskiXML })
	os.WriteFile(kutuphaneXML, []byte(`<library version="20110515"><book id="1" path="ilk_yardim_2026.zim" name="ilk_yardim"/></library>`), 0o644)
	sahteZim(t, filepath.Join(d, "ilk_yardim_2026.zim"), []tZimGirdi{{0, 'C', "Yanik", "Yanık"}}, 1)
	iste := func(adres string) (int, map[string]any) {
		w := httptest.NewRecorder()
		apiMakaleler(w, httptest.NewRequest("GET", adres, nil))
		var m map[string]any
		json.Unmarshal(w.Body.Bytes(), &m)
		return w.Code, m
	}
	// kitap adı kütüphane sunucusununki: dosya adı .zim'siz
	if k, m := iste("/api/makaleler?kitap=ilk_yardim_2026"); k != 200 || len(m["makaleler"].([]any)) != 1 {
		t.Fatalf("kitap listelenmeli: %d %v", k, m)
	}
	for _, ad := range []string{"yok", "../ilk_yardim_2026", "", "a/b"} {
		if k, _ := iste("/api/makaleler?kitap=" + ad); k != 404 {
			t.Fatalf("%q 404 olmalı: %d", ad, k)
		}
	}
}

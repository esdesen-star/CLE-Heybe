package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestDosemeNumarasi(t *testing.T) {
	// PMTiles belirtimindeki örnek: z1'de 1=(0,0) 2=(0,1) 3=(1,1) 4=(1,0)
	for i, b := range [][3]uint32{{0, 0, 0}, {1, 0, 0}, {1, 0, 1}, {1, 1, 1}, {1, 1, 0}} {
		if n := zxyNo(uint8(b[0]), b[1], b[2]); n != uint64(i) {
			t.Fatalf("zxyNo%v = %d, %d olmalı", b, n, i)
		}
	}
	for z := uint8(0); z <= 15; z += 3 {
		m := uint32(1) << z
		for _, xy := range [][2]uint32{{0, 0}, {1 % m, 2 % m}, {m - 1, 0}, {m - 1, m - 1}, {12345 % m, 777 % m}} {
			zz, x, y := noZxy(zxyNo(z, xy[0], xy[1]))
			if zz != z || x != xy[0] || y != xy[1] {
				t.Fatalf("gidiş-dönüş %d/%v → %d/%d/%d", z, xy, zz, x, y)
			}
		}
	}
}

func bosDoseme(z uint8, x, y uint32) bool { return z == 7 && (x+3*y)%11 == 0 }

// sahtePmtiles: z0–7 döşemeler (z7'de bazıları yok); içerik "z/x/y", ama z≥5'te x tek olanlar "deniz" (aynı veri, tekrar sayısı).
func sahtePmtiles(t *testing.T) []byte {
	t.Helper()
	type d struct {
		id uint64
		v  string
	}
	var ds []d
	for z := uint8(0); z <= 7; z++ {
		for x := uint32(0); x < 1<<z; x++ {
			for y := uint32(0); y < 1<<z; y++ {
				if bosDoseme(z, x, y) {
					continue // seyrek arşiv: bazı döşemeler hiç yok
				}
				v := fmt.Sprintf("%d/%d/%d", z, x, y)
				if z >= 5 && x%2 == 1 {
					v = "deniz"
				}
				ds = append(ds, d{zxyNo(z, x, y), v})
			}
		}
	}
	sortD := func(i, j int) bool { return ds[i].id < ds[j].id }
	_ = sortD
	for i := 1; i < len(ds); i++ { // ekleme sıralaması: küçük deneme
		for j := i; j > 0 && ds[j].id < ds[j-1].id; j-- {
			ds[j], ds[j-1] = ds[j-1], ds[j]
		}
	}
	var veri bytes.Buffer
	yer := map[string]uint64{}
	var g []pmGirdi
	for _, x := range ds {
		off, var_ := yer[x.v]
		if !var_ {
			off = uint64(veri.Len())
			yer[x.v] = off
			veri.WriteString(x.v)
		}
		n := len(g)
		if n > 0 && g[n-1].ID+uint64(g[n-1].Tekrar) == x.id && g[n-1].Off == off {
			g[n-1].Tekrar++
			continue
		}
		g = append(g, pmGirdi{x.id, off, uint32(len(x.v)), 1})
	}
	kok, yaprak := pmDizinKur(g, 2)
	meta := []byte(`{"name":"sahte"}`)
	h := pmBaslik{KokOff: pmBaslikBoy, KokBoy: uint64(len(kok)), IcSik: 2, DosemeSik: 1, DosemeTur: 1, EnAzZ: 0, EnCokZ: 7, Kumelenmis: true}
	h.MetaOff, h.MetaBoy = h.KokOff+h.KokBoy, uint64(len(meta))
	h.YaprakOff, h.YaprakBoy = h.MetaOff+h.MetaBoy, uint64(len(yaprak))
	h.VeriOff, h.VeriBoy = h.YaprakOff+h.YaprakBoy, uint64(veri.Len())
	h.Adresli, h.Girdi, h.Icerik = uint64(len(ds)), uint64(len(g)), uint64(len(yer))
	var b bytes.Buffer
	b.Write(h.yaz())
	b.Write(kok)
	b.Write(meta)
	b.Write(yaprak)
	b.Write(veri.Bytes())
	if len(yaprak) == 0 {
		t.Fatal("sahte dosyada yaprak dizin de olmalı (sınav onu da denesin)")
	}
	return b.Bytes()
}

type sayacKaynak struct {
	k        pmKaynak
	istek    atomic.Int64
	bozSonra int64 // bu kadar veri isteğinden sonra hata ver (0 = hiç)
}

func (s *sayacKaynak) Oku(ctx context.Context, off, n uint64, kesin bool) ([]byte, error) {
	i := s.istek.Add(1)
	if s.bozSonra > 0 && i > s.bozSonra {
		return nil, errors.New("bağlantı koptu (sınav)")
	}
	return s.k.Oku(ctx, off, n, kesin)
}

func TestHaritaKesVeSurdur(t *testing.T) {
	arsiv := sahtePmtiles(t)
	sunucu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeContent(w, r, "x.pmtiles", time.Unix(0, 0), bytes.NewReader(arsiv))
	}))
	defer sunucu.Close()
	eskiB, eskiP := pmParcaBosluk, pmParcaBoy
	pmParcaBosluk, pmParcaBoy = 64, 512 // küçük parçalar: sürdürme sınansın
	t.Cleanup(func() { pmParcaBosluk, pmParcaBoy = eskiB, eskiP })
	bati, guney, dogu, kuzey := 10.0, 35.0, 45.0, 60.0
	http1 := &httpPmKaynak{adres: sunucu.URL, istemci: http.DefaultClient}
	p, err := pmPlanla(context.Background(), http1, bati, guney, dogu, kuzey, 7)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Parcalar) < 4 {
		t.Fatalf("sınav için birkaç parça gerekli: %d", len(p.Parcalar))
	}
	hedef := filepath.Join(t.TempDir(), "bolge.pmtiles")
	// önce yarıda kes: plan sonrası 3 parça iner, sonra bağlantı kopar
	kopuk := &sayacKaynak{k: http1, bozSonra: 3}
	if err := pmIndir(context.Background(), kopuk, p, hedef, nil); err == nil {
		t.Fatal("kopan bağlantı hata vermeli")
	}
	if _, err := os.Stat(hedef); err == nil {
		t.Fatal("yarım dosya asıl adla kalmamalı")
	}
	sayac := &sayacKaynak{k: http1}
	if err := pmIndir(context.Background(), sayac, p, hedef, nil); err != nil {
		t.Fatal(err)
	}
	if n := sayac.istek.Load(); n != int64(len(p.Parcalar)-3) {
		t.Fatalf("sürdürme baştan indirdi: %d istek, %d bekleniyordu", n, len(p.Parcalar)-3)
	}
	// bölgedeki her döşeme doğru, bölge dışı yok
	var sayi int
	for z := uint8(0); z <= 7; z++ {
		x0, x1, y0, y1 := dosemeAraligi(z, bati, guney, dogu, kuzey)
		for x := x0; x <= x1; x++ {
			for y := y0; y <= y1; y++ {
				b, ok, err := pmDosemeOku(hedef, z, x, y)
				if bosDoseme(z, x, y) {
					if ok {
						t.Fatalf("kaynakta olmayan döşeme çıktıda olmamalı: %d/%d/%d = %q", z, x, y, b)
					}
					continue
				}
				beklenen := fmt.Sprintf("%d/%d/%d", z, x, y)
				if z >= 5 && x%2 == 1 {
					beklenen = "deniz"
				}
				if err != nil || !ok || string(b) != beklenen {
					t.Fatalf("%d/%d/%d: %q %v %v", z, x, y, b, ok, err)
				}
				sayi++
			}
		}
		if x0 > 0 {
			if _, ok, _ := pmDosemeOku(hedef, z, x0-1, y0); ok {
				t.Fatalf("bölge dışı döşeme olmamalı: %d/%d/%d", z, x0-1, y0)
			}
		}
	}
	h, _ := pmBaslikOku(mustOku(t, hedef))
	if h.Adresli != uint64(sayi) || h.EnCokZ != 7 || h.BatiE7 != 100000000 || h.KuzeyE7 != 600000000 {
		t.Fatalf("başlık: %+v (döşeme %d)", h, sayi)
	}
	if h.Icerik >= h.Adresli {
		t.Fatalf("aynı veriler tekilleşmeli: içerik %d, adresli %d", h.Icerik, h.Adresli)
	}
}

// Sunucu bir kez eksik veri gönderir (bağlantı erken kapanır gibi): indirici fark edip yeniden istemeli.
func TestHaritaKesEksikVeri(t *testing.T) {
	arsiv := sahtePmtiles(t)
	var bozuldu atomic.Bool
	sunucu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var bas, son int
		if _, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &bas, &son); err == nil && bas > 16384 && !bozuldu.Load() {
			bozuldu.Store(true)
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", bas, son, len(arsiv)))
			w.WriteHeader(http.StatusPartialContent)
			w.Write(arsiv[bas : bas+(son-bas)/2]) // yarısı; uzunluk başlığı yok (parçalı aktarım)
			return
		}
		http.ServeContent(w, r, "x.pmtiles", time.Unix(0, 0), bytes.NewReader(arsiv))
	}))
	defer sunucu.Close()
	k := &httpPmKaynak{adres: sunucu.URL, istemci: http.DefaultClient}
	p, err := pmPlanla(context.Background(), k, 10, 35, 45, 60, 7)
	if err != nil {
		t.Fatal(err)
	}
	hedef := filepath.Join(t.TempDir(), "b.pmtiles")
	if err := pmIndir(context.Background(), k, p, hedef, nil); err != nil {
		t.Fatal(err)
	}
	if !bozuldu.Load() {
		t.Fatal("sınav eksik veriyi hiç göndermedi")
	}
	x0, x1, y0, y1 := dosemeAraligi(7, 10, 35, 45, 60)
	for x := x0; x <= x1; x++ {
		for y := y0; y <= y1; y++ {
			b, ok, _ := pmDosemeOku(hedef, 7, x, y)
			beklenen := fmt.Sprintf("7/%d/%d", x, y)
			if x%2 == 1 {
				beklenen = "deniz"
			}
			if bosDoseme(7, x, y) {
				beklenen = ""
			}
			if string(b) != beklenen || ok != (beklenen != "") {
				t.Fatalf("eksik veriden sonra döşeme bozuk: 7/%d/%d = %q", x, y, b)
			}
		}
	}
}

func mustOku(t *testing.T, yol string) []byte {
	b, err := os.ReadFile(yol)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestHaritaBolgeBuyukseAyrintiDuser(t *testing.T) {
	if z := pmEnCokZSec(0, 15, 25.6, 35.8, 44.9, 42.2); z != 15 {
		t.Fatalf("Türkiye 15'te kalmalı (1,76 milyon döşeme): %d", z)
	}
	if z := pmEnCokZSec(0, 15, -180, -85, 180, 85); z > 11 {
		t.Fatalf("bütün dünya sınırda kalacak kadar düşmeli: %d", z)
	}
}

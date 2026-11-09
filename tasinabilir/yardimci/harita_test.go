package main

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Küçük bir .osm.pbf üretir (09.11): okuyucu, hazırlık, rota ve yer dizini uçtan uca sınanır.
//
//	5 ─────────── 4      w3 "B Caddesi" (primary, tek yön 1→5→4), uzun
//	|      10     |      w2 yaya yolu 3–4 (araç giremez)
//	1 ──── 2 ──── 3      w1 "A Sokak" (residential, çift yön)
//	       9             w15 "C Sokak" 10–2–9: A Sokak'ı yolların ortasında keser (kesişim köşe olmalı)
type pbYaz struct{ b []byte }

func (p *pbYaz) varint(v uint64) {
	for v >= 0x80 {
		p.b = append(p.b, byte(v)|0x80)
		v >>= 7
	}
	p.b = append(p.b, byte(v))
}
func (p *pbYaz) anahtar(no, tel int)   { p.varint(uint64(no<<3 | tel)) }
func (p *pbYaz) sayi(no int, v uint64) { p.anahtar(no, 0); p.varint(v) }
func (p *pbYaz) bayt(no int, v []byte) {
	p.anahtar(no, 2)
	p.varint(uint64(len(v)))
	p.b = append(p.b, v...)
}
func zz(v int64) uint64 { return uint64((v << 1) ^ (v >> 63)) }
func paketli(vs []uint64) []byte {
	q := &pbYaz{}
	for _, v := range vs {
		q.varint(v)
	}
	return q.b
}
func deltaZZ(vs []int64) []uint64 {
	var out []uint64
	var once int64
	for _, v := range vs {
		out = append(out, zz(v-once))
		once = v
	}
	return out
}

type tDugum struct {
	id       int64
	lat, lon float64
	etiket   [][2]string
}
type tYol struct {
	id     int64
	refs   []int64
	etiket [][2]string
}

func sahtePbf(t *testing.T, dugumler []tDugum, yollar []tYol) string {
	t.Helper()
	tablo := []string{""}
	no := map[string]int{"": 0}
	s := func(v string) uint64 {
		if k, ok := no[v]; ok {
			return uint64(k)
		}
		no[v] = len(tablo)
		tablo = append(tablo, v)
		return uint64(no[v])
	}
	// yoğun düğümler
	var ids, lats, lons []int64
	var kv []uint64
	for _, d := range dugumler {
		ids = append(ids, d.id)
		lats = append(lats, int64(math.Round(d.lat*1e7)))
		lons = append(lons, int64(math.Round(d.lon*1e7)))
		for _, e := range d.etiket {
			kv = append(kv, s(e[0]), s(e[1]))
		}
		kv = append(kv, 0)
	}
	yogun := &pbYaz{}
	yogun.bayt(1, paketli(deltaZZ(ids)))
	yogun.bayt(8, paketli(deltaZZ(lats)))
	yogun.bayt(9, paketli(deltaZZ(lons)))
	yogun.bayt(10, paketli(kv))
	g1 := &pbYaz{}
	g1.bayt(2, yogun.b)
	g2 := &pbYaz{}
	for _, y := range yollar {
		w := &pbYaz{}
		w.sayi(1, uint64(y.id))
		var k, v []uint64
		for _, e := range y.etiket {
			k = append(k, s(e[0]))
			v = append(v, s(e[1]))
		}
		w.bayt(2, paketli(k))
		w.bayt(3, paketli(v))
		w.bayt(8, paketli(deltaZZ(y.refs)))
		g2.bayt(3, w.b)
	}
	st := &pbYaz{}
	for _, x := range tablo {
		st.bayt(1, []byte(x))
	}
	blok := &pbYaz{}
	blok.bayt(1, st.b)
	blok.bayt(2, g1.b)
	blok.bayt(2, g2.b)
	var z bytes.Buffer
	zw := zlib.NewWriter(&z)
	zw.Write(blok.b)
	zw.Close()
	blob := &pbYaz{}
	blob.sayi(2, uint64(len(blok.b)))
	blob.bayt(3, z.Bytes())
	var dosya bytes.Buffer
	for _, parca := range []struct {
		tur  string
		veri []byte
	}{{"OSMHeader", (&pbYaz{}).b}, {"OSMData", blob.b}} {
		bas := &pbYaz{}
		bas.bayt(1, []byte(parca.tur))
		bas.sayi(3, uint64(len(parca.veri)))
		binary.Write(&dosya, binary.BigEndian, uint32(len(bas.b)))
		dosya.Write(bas.b)
		dosya.Write(parca.veri)
	}
	yol := filepath.Join(t.TempDir(), "deneme.osm.pbf")
	if err := os.WriteFile(yol, dosya.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return yol
}

func sahteHarita(t *testing.T) (string, *rotaAg) {
	t.Helper()
	pbf := sahtePbf(t,
		[]tDugum{
			{1, 40.000, 29.000, nil},
			{2, 40.000, 29.001, nil},
			{3, 40.000, 29.002, nil},
			{4, 40.001, 29.002, nil},
			{5, 40.001, 28.999, nil},
			{6, 40.0004, 29.0015, [][2]string{{"amenity", "hospital"}, {"name", "Devlet Hastanesi"}}},
			{7, 40.0006, 29.0005, [][2]string{{"emergency", "assembly_point"}}},
			{8, 40.0002, 29.0010, [][2]string{{"place", "neighbourhood"}, {"name", "Yıldız Mahallesi"}}},
			{9, 39.999, 29.001, nil},
			{10, 40.0004, 29.001, nil},
			{11, 40.010, 29.002, nil}, // denizin karşı kıyısı: yalnız vapurla
			{12, 40.002, 29.003, [][2]string{{"place", "town"}, {"name", "Merkezköy"}}},
			{13, 40.005, 29.005, [][2]string{{"place", "city"}, {"name", "Büyükşehir"}}},
		},
		[]tYol{
			{11, []int64{1, 2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
			{12, []int64{3, 4}, [][2]string{{"highway", "footway"}}},
			{13, []int64{1, 5, 4}, [][2]string{{"highway", "primary"}, {"name", "B Caddesi"}, {"oneway", "yes"}}},
			{14, []int64{2, 6}, [][2]string{{"highway", "motorway"}, {"access", "private"}}},      // kimse geçemez: ağa girmez
			{15, []int64{10, 2, 9}, [][2]string{{"highway", "residential"}, {"name", "C Sokak"}}}, // A Sokak'ı ortasından keser
			{16, []int64{4, 11}, [][2]string{{"route", "ferry"}, {"name", "Karşı Kıyı Vapuru"}}},
		})
	on := filepath.Join(t.TempDir(), "harita", "deneme")
	os.MkdirAll(filepath.Dir(on), 0o755)
	oz, err := haritaHazirla(pbf, on, "2026-11-08", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if oz.Dugum != 7 || oz.Parca != 7 {
		t.Fatalf("ağ beklenmedik: %d köşe, %d parça (7 ve 7 olmalı)", oz.Dugum, oz.Parca)
	}
	ag, err := rotaAc(on + ".rota")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(ag.Kapat)
	return on, ag
}

func TestRotaYayaKisaYolu(t *testing.T) {
	_, ag := sahteHarita(t)
	r := ag.Rota(40.000, 29.000, 40.001, 29.002, "yaya")
	if !r.Tamam {
		t.Fatalf("yaya rotası yok: %s", r.Hata)
	}
	// A Sokak (1→2→3, ~171 m) + yaya yolu (3→4, ~111 m)
	if r.Metre < 270 || r.Metre > 295 {
		t.Fatalf("yaya rotası %v m; A Sokak + yaya yolu (~282 m) olmalı", r.Metre)
	}
	if len(r.Adimlar) != 2 || r.Adimlar[0].Ad != "A Sokak" || r.Adimlar[1].Tur != 18 {
		t.Fatalf("adımlar beklenmedik: %+v", r.Adimlar)
	}
	if r.Adimlar[1].Yon != "sol" {
		t.Fatalf("doğudan kuzeye dönüş sola olmalı, %q geldi", r.Adimlar[1].Yon)
	}
	if len(r.Geo) != 4 { // 1, 2 (ara nokta), 3, 4
		t.Fatalf("çizgi %d nokta; 4 olmalı: %v", len(r.Geo), r.Geo)
	}
}

func TestRotaAracTekYonVeYayaYolu(t *testing.T) {
	_, ag := sahteHarita(t)
	// Araç yaya yoluna giremez: B Caddesi'nden (tek yön, ileri) gider.
	r := ag.Rota(40.000, 29.000, 40.001, 29.002, "arac")
	if !r.Tamam || r.Metre < 380 || len(r.Adimlar) != 1 || r.Adimlar[0].Ad != "B Caddesi" {
		t.Fatalf("araç rotası B Caddesi olmalı: %+v", r)
	}
	// Ters yön yasak: 4'ten araçla çıkılamaz; başlangıç 3'e (en yakın uygun köşe) kayar ve sapma söylenir.
	r = ag.Rota(40.001, 29.002, 40.000, 29.000, "arac")
	if !r.Tamam || r.BasSapma < 100 || r.Metre > 200 {
		t.Fatalf("tek yön tersine araç geçmemeli: %+v", r)
	}
}

func TestYerDiziniAramaVeYakin(t *testing.T) {
	on, _ := sahteHarita(t)
	s, err := yerAra(on+".yer", "devlet HAST", 0, 0, false, 5)
	if err != nil || len(s) != 1 || s[0].Tur != "hastane" {
		t.Fatalf("hastane bulunmadı: %+v %v", s, err)
	}
	if s[0].Baglam != "Yıldız Mahallesi, Merkezköy, Büyükşehir" {
		t.Fatalf("bağlam mahalle, kasaba, şehir olmalı: %q", s[0].Baglam)
	}
	if s, _ := yerAra(on+".yer", "buyuksehir devlet", 0, 0, false, 5); len(s) != 1 {
		t.Fatalf("şehir adıyla aranınca da bulunmalı: %+v", s)
	}
	s, _ = yerAra(on+".yer", "yildiz", 0, 0, false, 5) // ı/i farkı aramayı bozmaz
	if len(s) == 0 || s[0].Ad != "Yıldız Mahallesi" {
		t.Fatalf("Türkçe harfsiz arama tutmadı: %+v", s)
	}
	s, _ = yerAra(on+".yer", "a sokak", 0, 0, false, 5)
	if len(s) == 0 || s[0].Tur != "sokak" {
		t.Fatalf("sokak adı dizinde yok: %+v", s)
	}
	y, _ := yerYakin(on+".yer", "toplanma", 40.0, 29.0, 3)
	if len(y) != 1 || y[0].M < 50 || y[0].M > 90 {
		t.Fatalf("adsız toplanma alanı da dizinde olmalı (~73 m): %+v", y)
	}
	if y, _ := yerYakin(on+".yer", "toplanma", 41.0, 29.0, 3); len(y) != 0 {
		t.Fatalf("111 km ötedeki toplanma alanı 'en yakın' diye verilmemeli: %+v", y)
	}
}

func TestRotaOrtadanKesisim(t *testing.T) {
	_, ag := sahteHarita(t)
	// 1'den 9'a: A Sokak'ın ortasındaki 2'de C Sokak'a dönülür (~85 + 111 m).
	r := ag.Rota(40.000, 29.000, 39.999, 29.001, "yaya")
	if !r.Tamam || r.Metre < 185 || r.Metre > 205 || r.VarSapma > 1 {
		t.Fatalf("ortadan kesişen yolda dönülemedi: %+v", r)
	}
}

func TestRotaVapur(t *testing.T) {
	_, ag := sahteHarita(t)
	r := ag.Rota(40.000, 29.000, 40.010, 29.002, "yaya")
	if !r.Tamam || r.VarSapma > 1 {
		t.Fatalf("karşı kıyıya yaya + vapur rotası olmalı: %+v", r)
	}
	son := r.Adimlar[len(r.Adimlar)-1]
	if son.Tur != sinifVapur || son.Ad != "Karşı Kıyı Vapuru" {
		t.Fatalf("son adım vapur olmalı: %+v", r.Adimlar)
	}
	// Vapur yürüme hızıyla değil kendi hızıyla sayılır: ~1 km vapur ~3 dk, toplam 10 dakikanın altında.
	if r.Saniye > 600 {
		t.Fatalf("vapur süresi yürüme hızıyla sayılmış: %v sn", r.Saniye)
	}
}

func TestAramaNormal(t *testing.T) {
	for g, b := range map[string]string{
		"İSTANBUL Kadıköy":    "istanbul kadikoy",
		"  Şişli\tÇAĞLAYAN ":  "sisli caglayan",
		"IĞDIR":               "igdir",
		"Ankara Üniversitesi": "ankara universitesi",
		"Sandnessjøen":        "sandnessjoen",
		"Kærlighed Straße":    "kaerlighed strasse",
	} {
		if a := aramaNormal(g); a != b {
			t.Errorf("aramaNormal(%q) = %q, %q olmalı", g, a, b)
		}
	}
}

func TestYolIzinleri(t *testing.T) {
	durum := func(e map[string]string) uint8 { b, _, _ := yolIzinleri(e); return b }
	if b := durum(map[string]string{"highway": "motorway"}); b != bitAracIleri {
		t.Errorf("otoyol: yaya yok, tek yön olmalı; %b", b)
	}
	if b := durum(map[string]string{"highway": "residential", "access": "private"}); b != 0 {
		t.Errorf("özel yol kapalı olmalı; %b", b)
	}
	if b := durum(map[string]string{"highway": "residential", "oneway": "-1"}); b != bitYaya|bitAracGeri {
		t.Errorf("ters tek yön; %b", b)
	}
	if b := durum(map[string]string{"highway": "footway", "foot": "no"}); b != 0 {
		t.Errorf("foot=no yaya yolunu kapatmalı; %b", b)
	}
	if b := durum(map[string]string{"highway": "construction"}); b != 0 {
		t.Errorf("yapım aşamasındaki yol ağa girmemeli; %b", b)
	}
	if _, s, _ := yolIzinleri(map[string]string{"highway": "primary", "maxspeed": "50"}); s.hiz != 50 {
		t.Errorf("azami hız okunmadı: %d", s.hiz)
	}
}

func TestRotaDosyasiYarimKopya(t *testing.T) {
	on, _ := sahteHarita(t)
	b, _ := os.ReadFile(on + ".rota")
	yarim := on + "_yarim.rota"
	os.WriteFile(yarim, b[:len(b)-3], 0o644)
	if _, err := rotaAc(yarim); err == nil || !strings.Contains(err.Error(), "boy") {
		t.Fatalf("yarım kopya tanınmalı: %v", err)
	}
}

func TestHaritaKapilari(t *testing.T) {
	on, _ := sahteHarita(t)
	eski := kok
	kok = filepath.Dir(filepath.Dir(on)) // <kök>/harita/deneme.*
	t.Cleanup(func() { kok = eski })
	os.WriteFile(filepath.Join(kok, "harita", "deneme.pmtiles"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(kok, "harita", "._deneme.rota"), []byte("macOS çöpü"), 0o644) // gizli dosya harita sayılmaz
	iste := func(h http.HandlerFunc, adres string) map[string]any {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest("GET", adres, nil))
		var m map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
			t.Fatalf("%s: %v %s", adres, err, w.Body.String())
		}
		return m
	}
	h := iste(apiHarita, "/api/harita")
	if h["var"] != true || h["pmtiles"] != "/harita/deneme.pmtiles" || h["ozet"].(map[string]any)["veriTarihi"] != "2026-11-08" {
		t.Fatalf("harita bilgisi eksik: %v", h)
	}
	r := iste(apiRota, "/api/rota?a=40.000,29.000&b=40.001,29.002&kip=yaya")
	if r["tamam"] != true {
		t.Fatalf("rota kapısı: %v", r)
	}
	if r := iste(apiRota, "/api/rota?a=bozuk&b=40.001,29.002"); r["hata"] != "nokta" {
		t.Fatalf("bozuk nokta reddedilmeli: %v", r)
	}
	w := httptest.NewRecorder()
	apiYer(w, httptest.NewRequest("GET", "/api/yer?tur=hastane&konum=40.0,29.0", nil))
	if !strings.Contains(w.Body.String(), "Devlet Hastanesi") {
		t.Fatalf("en yakın hastane kapısı: %s", w.Body.String())
	}
}

func TestHazirlikKutusu(t *testing.T) {
	pbf := sahtePbf(t,
		[]tDugum{
			{1, 66.02, 12.63, nil}, {2, 66.02, 12.64, nil}, {3, 66.03, 12.64, nil}, // kutuda
			{4, 66.50, 13.50, nil}, {5, 66.50, 13.51, nil}, // kutu dışında
			{6, 66.021, 12.635, [][2]string{{"amenity", "hospital"}, {"name", "İçerideki Hastane"}}},
			{7, 66.501, 13.505, [][2]string{{"amenity", "hospital"}, {"name", "Dışarıdaki Hastane"}}},
		},
		[]tYol{
			{11, []int64{1, 2}, [][2]string{{"highway", "residential"}, {"name", "İç Sokak"}}},
			{12, []int64{2, 3}, [][2]string{{"highway", "residential"}, {"name", "Sınır Sokağı"}}},
			{13, []int64{4, 5}, [][2]string{{"highway", "residential"}, {"name", "Dış Sokak"}}},
		})
	on := filepath.Join(t.TempDir(), "kutu")
	oz, err := haritaHazirla(pbf, on, "2026-11-09", nil, &[4]float64{12.6, 66.0, 12.7, 66.025})
	if err != nil {
		t.Fatal(err)
	}
	// İç Sokak tamamen içeride, Sınır Sokağı bir ucuyla değiyor (bütünüyle alınır), Dış Sokak hiç değmiyor
	if oz.Parca != 2 {
		t.Fatalf("kutuya değen 2 yol alınmalı: %d", oz.Parca)
	}
	if s, _ := yerAra(on+".yer", "dis sokak", 0, 0, false, 5); len(s) != 0 {
		t.Fatalf("kutu dışındaki sokak dizine girmemeli: %+v", s)
	}
	if s, _ := yerAra(on+".yer", "hastane", 0, 0, false, 5); len(s) != 1 || s[0].Ad != "İçerideki Hastane" {
		t.Fatalf("yalnız kutudaki hastane: %+v", s)
	}
	if _, err := haritaHazirla(pbf, on+"2", "2026-11-09", nil, &[4]float64{0, 0, 1, 1}); err == nil {
		t.Fatal("boş kutu hata vermeli")
	}
}

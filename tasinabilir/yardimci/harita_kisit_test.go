package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Dönüş yasağı (13.11): A Sokak (1–2–3, batı→doğu) ile B Sokak (2–4, kuzeye) 2'de kesişir; 3–5–4 dolaşma yolu.
//
//	4 ──D── 5
//	|       |
//	B       C
//	|       |
//	1 ──A── 2 ──A── 3
//
// Yasaksız araç 1→4: A + B (~196 m, 2'de sola). "no_left_turn" (A'dan B'ye, 2'de) → 3–5–4 dolaşır (~366 m).
// Yaya yasaktan etkilenmez. "only_straight_on" (A'nın batı parçası → doğu parçası) aynı sonucu verir. Aynı kavşağa B'den gelen araç yasaktan etkilenmez.
func kisitliHarita(t *testing.T, kisit [][2]string) (string, *rotaAg) {
	t.Helper()
	dugum := []tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.001, nil}, {3, 40.000, 29.002, nil}, {4, 40.001, 29.001, nil}, {5, 40.001, 29.002, nil}}
	yollar := []tYol{
		{11, []int64{1, 2}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}}, // OSM: gelen ve giden yol kavşakta biter
		{15, []int64{2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
		{12, []int64{2, 4}, [][2]string{{"highway", "residential"}, {"name", "B Sokak"}}},
		{13, []int64{3, 5}, [][2]string{{"highway", "residential"}, {"name", "C Sokak"}}},
		{14, []int64{5, 4}, [][2]string{{"highway", "residential"}, {"name", "D Sokak"}}},
	}
	var iliski []tIliski
	if kisit != nil {
		giden := int64(12)
		if kisit[0][1] == "only_straight_on" {
			giden = 15
		}
		iliski = []tIliski{{id: 90, uyeler: [][2]int64{{1, 11}, {0, 2}, {1, giden}}, roller: []string{"from", "via", "to"},
			etiket: append([][2]string{{"type", "restriction"}}, kisit...)}}
	}
	on := filepath.Join(t.TempDir(), "harita", "kisit")
	os.MkdirAll(filepath.Dir(on), 0o755)
	oz, err := haritaHazirla(sahtePbfIliskili(t, dugum, yollar, iliski), on, "2026-11-13", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	muaf := false
	for _, e := range kisit {
		muaf = muaf || e[0] == "except"
	}
	if kisit != nil && !muaf && oz.Kisit == 0 {
		t.Fatalf("yasak kaydı çıkmadı: %+v", oz)
	}
	ag, err := rotaAc(on + ".rota")
	if err != nil {
		t.Fatal(err)
	}
	return on, ag
}

func adimAdlari(r rotaSonuc) []string {
	var a []string
	for _, x := range r.Adimlar {
		a = append(a, x.Ad)
	}
	return a
}

func TestDonusYasagi(t *testing.T) {
	_, serbest := kisitliHarita(t, nil)
	if r := serbest.Rota(40.000, 29.000, 40.001, 29.001, "arac"); !r.Tamam || r.Metre > 220 {
		t.Fatalf("yasaksız araç A + B'den gitmeli (~196 m): %+v", r)
	}
	for _, kisit := range [][][2]string{{{"restriction", "no_left_turn"}}, {{"restriction", "only_straight_on"}}, {{"restriction:motorcar", "no_left_turn"}}} {
		_, ag := kisitliHarita(t, kisit)
		r := ag.Rota(40.000, 29.000, 40.001, 29.001, "arac")
		if !r.Tamam || r.Metre < 330 {
			t.Fatalf("%v: araç 2'de B'ye dönmemeli, 3–5–4 dolaşmalı (~366 m): %+v", kisit, r)
		}
		if a := adimAdlari(r); len(a) < 2 || a[len(a)-1] != "D Sokak" {
			t.Fatalf("%v: son adım D Sokak olmalı: %v", kisit, a)
		}
		if y := ag.Rota(40.000, 29.000, 40.001, 29.001, "yaya"); !y.Tamam || y.Metre > 220 {
			t.Fatalf("%v: yaya dönüş yasağından etkilenmez: %+v", kisit, y)
		}
		// aynı kavşağa B'den gelen araç (4 → 1): yasak yalnız A'dan gelişe; B'den A'ya dönüş serbest
		if r := ag.Rota(40.001, 29.001, 40.000, 29.000, "arac"); !r.Tamam || r.Metre > 220 {
			t.Fatalf("%v: B'den gelen araç kısa yoldan gitmeli: %+v", kisit, r)
		}
	}
	// "except=motorcar" araca uygulanmaz
	_, muaf := kisitliHarita(t, [][2]string{{"restriction", "no_left_turn"}, {"except", "motorcar"}})
	if r := muaf.Rota(40.000, 29.000, 40.001, 29.001, "arac"); !r.Tamam || r.Metre > 220 {
		t.Fatalf("araç muafken yasak uygulanmamalı: %+v", r)
	}
}

// Eski (1. sürüm, yasaksız) rota dosyaları okunmaya devam eder: 2. sürüm dosyadan yasak bölümü çıkarılıp eski biçim kurulur.
func TestRotaDosyasiEskiSurum(t *testing.T) {
	on, _ := kisitliHarita(t, [][2]string{{"restriction", "no_left_turn"}})
	b, _ := os.ReadFile(on + ".rota")
	p := len(rotaSihir)
	bj := int(binary.LittleEndian.Uint32(b[p:]))
	p += 4 + bj
	var oz hazirlikOzet
	json.Unmarshal(b[len(rotaSihir)+4:p], &oz)
	say := make([]uint64, 7)
	binary.Read(bytes.NewReader(b[p:p+56]), binary.LittleEndian, say)
	V, H, K, S, A, G, R := say[0], say[1], say[2], say[3], say[4], say[5], say[6]
	govde := 2*4*V + 8*H + 4*(H+1) + 4*(V+1) + 4*K + 3*4*S + 3*S + 4*S + A + 4*(S+1)
	bas := uint64(p + 56)
	var eski bytes.Buffer
	eski.WriteString(rotaSihirEski)
	eski.Write(b[len(rotaSihir) : len(rotaSihir)+4+bj])
	binary.Write(&eski, binary.LittleEndian, say[:6])
	eski.Write(b[bas : bas+govde])
	eski.Write(b[bas+govde+13*R:])
	if uint64(len(b)-eski.Len()) != 8+13*R {
		t.Fatalf("eski biçim kurulamadı: %d / %d", len(b), eski.Len())
	}
	_ = G
	yol := filepath.Join(t.TempDir(), "eski.rota")
	os.WriteFile(yol, eski.Bytes(), 0o644)
	ag, err := rotaAc(yol)
	if err != nil {
		t.Fatalf("1. sürüm dosya okunmalı: %v", err)
	}
	if r := ag.Rota(40.000, 29.000, 40.001, 29.001, "arac"); !r.Tamam || r.Metre > 220 {
		t.Fatalf("eski dosyada yasak yok, kısa yol: %+v", r)
	}
	if o, err := rotaOzetOku(yol); err != nil || o.VeriTarihi != "2026-11-13" {
		t.Fatalf("eski dosyanın başlığı okunmalı: %v %+v", err, o)
	}
}

// Aynı yol hem gelen hem giden: "no_u_turn" yalnız aynı parçaya geri dönüşü, "only_straight_on" yalnız öbür parçayı kapsar.
// Köşe 0'dan aynı yolun (11) iki parçası çıkar: 0 ve 1.
func TestKisitAyniYol(t *testing.T) {
	bul := func(id int64) int { return 0 }
	koseNo, derece, komsu, sYol, yolID := []int32{0}, []uint32{0, 2}, []uint32{0 << 1, 1 << 1}, []uint32{0, 0}, []int64{11}
	ciftler := func(yalniz bool) map[[2]uint32]bool {
		_, a, b, _, _ := kisitParcala([]osmKisit{{gelen: 11, via: 7, giden: 11, yalniz: yalniz}}, bul, koseNo, derece, komsu, sYol, yolID, nil, nil, nil)
		m := map[[2]uint32]bool{}
		for i := range a {
			m[[2]uint32{a[i], b[i]}] = true
		}
		return m
	}
	if m := ciftler(false); len(m) != 2 || !m[[2]uint32{0, 0}] || !m[[2]uint32{1, 1}] {
		t.Fatalf("no_u_turn yalnız aynı parçaya dönüşü yasaklamalı: %v", m)
	}
	if m := ciftler(true); len(m) != 2 || !m[[2]uint32{0, 1}] || !m[[2]uint32{1, 0}] {
		t.Fatalf("only_straight_on yalnız öbür parçaya izin vermeli: %v", m)
	}
}

// Giden yol kavşaktan GEÇİYOR (OSM'de sık): B Sokak 4–2–6 (kuzey–güney), A Sokak 1–2–3 batıdan gelir. "no_left_turn"
// (A → B, 2'de): doğuya giderken sol = kuzey. Yalnız 2→4 yasak; 2→6 (sağa) serbest kalmalı. 13.11 ölçümünde iki yan
// birden yasaklanınca araç sıkışıp "rota yok" diyordu. Gelen yol kavşaktan geçiyorsa yasak hiç alınmaz.
func TestDonusYasagiGecenYol(t *testing.T) {
	kur := func(gelenGecer bool) (*hazirlikOzet, *rotaAg) {
		dugum := []tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.001, nil}, {3, 40.000, 29.002, nil}, {4, 40.001, 29.001, nil},
			{5, 40.001, 29.002, nil}, {6, 39.999, 29.001, nil}}
		yollar := []tYol{
			{11, []int64{1, 2}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
			{15, []int64{2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
			{12, []int64{4, 2, 6}, [][2]string{{"highway", "residential"}, {"name", "B Sokak"}}},
			{13, []int64{3, 5}, [][2]string{{"highway", "residential"}, {"name", "C Sokak"}}},
			{14, []int64{5, 4}, [][2]string{{"highway", "residential"}, {"name", "D Sokak"}}},
		}
		if gelenGecer { // A tek yol, kavşaktan geçer
			yollar[0] = tYol{11, []int64{1, 2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}}
			yollar = append(yollar[:1], yollar[2:]...)
		}
		il := []tIliski{{id: 91, uyeler: [][2]int64{{1, 11}, {0, 2}, {1, 12}}, roller: []string{"from", "via", "to"},
			etiket: [][2]string{{"type", "restriction"}, {"restriction", "no_left_turn"}}}}
		on := filepath.Join(t.TempDir(), "harita", "gecen")
		os.MkdirAll(filepath.Dir(on), 0o755)
		oz, err := haritaHazirla(sahtePbfIliskili(t, dugum, yollar, il), on, "2026-11-13", nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		ag, err := rotaAc(on + ".rota")
		if err != nil {
			t.Fatal(err)
		}
		return oz, ag
	}
	oz, ag := kur(false)
	if oz.Kisit != 1 {
		t.Fatalf("geçen giden yolun yalnız sol yanı yasaklanmalı (1 kayıt): %d", oz.Kisit)
	}
	if r := ag.Rota(40.000, 29.000, 40.001, 29.001, "arac"); !r.Tamam || r.Metre < 330 {
		t.Fatalf("sola (kuzeye) dönülmemeli, dolaşmalı: %+v", r)
	}
	if r := ag.Rota(40.000, 29.000, 39.999, 29.001, "arac"); !r.Tamam || r.Metre > 220 {
		t.Fatalf("sağa (güneye) dönüş serbest kalmalı: %+v", r)
	}
	if oz, _ := kur(true); oz.Kisit != 0 {
		t.Fatalf("gelen yol kavşaktan geçiyorsa yasak alınmamalı: %d", oz.Kisit)
	}
}

// Geri dönüş (13.11): yasaklı kavşakta araç, kavşağı geçip yolun ortasında (3'te) geri dönüp yasağı dolanmamalı:
// dolaşma yolu (3–5–4, ~439 m) geri dönüşten (1–2–3–2–4, ~366 m) ~11 sn uzun; geri dönüş 20 sn cezalı olduğu için
// dolaşma seçilir (ceza olmasa geri dönüş seçilirdi — bozma bunu ölçer).
// Yasakla hiç yol kalmıyorsa (4. düğüm yalnız yasaklı dönüşle varılır) rota kuralsız bulunur ve işaretlenir.
func TestAracGeriDonmez(t *testing.T) {
	kur := func(dolasmaVar bool, cikmaz ...bool) *rotaAg {
		dugum := []tDugum{{1, 40.000, 29.000, nil}, {2, 40.000, 29.001, nil}, {3, 40.000, 29.002, nil}, {4, 40.001, 29.001, nil}, {5, 40.0015, 29.002, nil}}
		yollar := []tYol{
			{11, []int64{1, 2}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
			{15, []int64{2, 3}, [][2]string{{"highway", "residential"}, {"name", "A Sokak"}}},
			{12, []int64{2, 4}, [][2]string{{"highway", "residential"}, {"name", "B Sokak"}}},
		}
		if len(cikmaz) == 0 && !dolasmaVar { // 3 yok: 2'de tek çıkış yasaklı dönüş, geri dönüş de yasak
			yollar = []tYol{yollar[0], yollar[2]}
		}
		if dolasmaVar {
			yollar = append(yollar, tYol{13, []int64{3, 5}, [][2]string{{"highway", "residential"}, {"name", "C Sokak"}}},
				tYol{14, []int64{5, 4}, [][2]string{{"highway", "residential"}, {"name", "D Sokak"}}})
		}
		il := []tIliski{{id: 92, uyeler: [][2]int64{{1, 11}, {0, 2}, {1, 12}}, roller: []string{"from", "via", "to"},
			etiket: [][2]string{{"type", "restriction"}, {"restriction", "no_left_turn"}}}}
		on := filepath.Join(t.TempDir(), "harita", "geri")
		os.MkdirAll(filepath.Dir(on), 0o755)
		if _, err := haritaHazirla(sahtePbfIliskili(t, dugum, yollar, il), on, "2026-11-13", nil, nil); err != nil {
			t.Fatal(err)
		}
		ag, err := rotaAc(on + ".rota")
		if err != nil {
			t.Fatal(err)
		}
		return ag
	}
	r := kur(true).Rota(40.000, 29.000, 40.001, 29.001, "arac")
	if !r.Tamam || r.KuralsizRota {
		t.Fatalf("dolaşma yolu varken kurallı rota bulunmalı: %+v", r)
	}
	for _, a := range r.Adimlar {
		if a.Yon == "geri" {
			t.Fatalf("araç yolun ortasında geri dönmemeli: %+v", r.Adimlar)
		}
	}
	if a := adimAdlari(r); a[len(a)-1] != "D Sokak" {
		t.Fatalf("C–D'den dolaşmalı: %v", a)
	}
	// dolaşma yolu yok: yasak ve geri dönüş yasağıyla yol kalmaz → kuralsız rota, işaretli
	r = kur(false).Rota(40.000, 29.000, 40.001, 29.001, "arac")
	if !r.Tamam || !r.KuralsizRota {
		t.Fatalf("yol kalmayınca kuralsız rota verilmeli ve işaretlenmeli: %+v", r)
	}
	// 3 çıkmaz sokak: oraya gidip geri dönmek yasal (çıkmaz sokakta geri dönüş serbest) ve adım olarak görünür
	r = kur(false, true).Rota(40.000, 29.000, 40.001, 29.001, "arac")
	geriVar := false
	for _, a := range r.Adimlar {
		geriVar = geriVar || a.Yon == "geri"
	}
	if !r.Tamam || r.KuralsizRota || !geriVar {
		t.Fatalf("çıkmaz sokakta geri dönüş serbest ve görünür olmalı: %+v", r)
	}
	if y := kur(false).Rota(40.000, 29.000, 40.001, 29.001, "yaya"); !y.Tamam || y.KuralsizRota {
		t.Fatalf("yaya kuralsız işaretlenmez: %+v", y)
	}
}

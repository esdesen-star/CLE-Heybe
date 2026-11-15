package main

// 14.11.2026 (3. sürüm .rota, Planlama 8i "`.rota` küçültme"): ara noktalar farkla yazılır; okuyucu 1–3. sürümü okur,
// dönüştürücü (rotaYenile) eski dosyayı yol ağına dokunmadan yeni sürüme çevirir.

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// küçük bir yol ağı: 3 köşe, 2 parça (biri ara noktasız), 1 dönüş yasağı
func tAg() (oz hazirlikOzet, vLat, vLon []int32, hucreler []int64, hucreBas, derece, komsu, sA, sB []uint32, sUz []float32,
	sBayrak, sHiz, sSinif []uint8, sAd []uint32, adlar []string, gOff, kVia, kGelen, kGiden []uint32, kTur []uint8, gLat, gLon []int32) {
	oz = hazirlikOzet{Surum: 1, Kaynak: "deneme"}
	vLat, vLon = []int32{370000000, 370010000, 369990000}, []int32{360000000, 360020000, 360030000}
	hucreler, hucreBas = []int64{7}, []uint32{0, 3}
	derece = []uint32{0, 1, 3, 4}
	komsu = []uint32{0 << 1, 0<<1 | 1, 1 << 1, 1<<1 | 1}
	sA, sB = []uint32{0, 1}, []uint32{1, 2}
	sUz = []float32{230.5, 310.25}
	sBayrak, sHiz, sSinif, sAd = []uint8{7, 7}, []uint8{50, 30}, []uint8{3, 5}, []uint32{0, 1}
	adlar = []string{"Atatürk Caddesi", "Ulus Sokağı"}
	// parça 0: üç ara nokta (biri geriye, biri uzak); parça 1: ara noktasız
	gOff = []uint32{0, 3, 3}
	gLat, gLon = []int32{370002000, 369999000, 370009999}, []int32{360005000, 360004000, 360019999}
	kVia, kGelen, kGiden, kTur = []uint32{1}, []uint32{0}, []uint32{1}, []uint8{0}
	return
}

// 2. sürümün yazıcısı (13.11 biçimi, yalnız test için): ara noktalar düz int32
func tRotaYaz2(t *testing.T, yol string) {
	t.Helper()
	oz, vLat, vLon, hucreler, hucreBas, derece, komsu, sA, sB, sUz, sBayrak, sHiz, sSinif, sAd, adlar, gOff, kVia, kGelen, kGiden, kTur, gLat, gLon := tAg()
	f, err := os.Create(yol)
	if err != nil {
		t.Fatal(err)
	}
	w := bufio.NewWriter(f)
	bj, _ := json.Marshal(oz)
	w.WriteString(rotaSihir2)
	binary.Write(w, binary.LittleEndian, uint32(len(bj)))
	w.Write(bj)
	ad := strings.Join(adlar, "\x00")
	binary.Write(w, binary.LittleEndian, []uint64{uint64(len(vLat)), uint64(len(hucreler)), uint64(len(komsu)), uint64(len(sA)), uint64(len(ad)), uint64(len(gLat)), uint64(len(kVia))})
	for _, d := range []any{vLat, vLon, hucreler, hucreBas, derece, komsu, sA, sB, sUz, sBayrak, sHiz, sSinif, sAd, []byte(ad), gOff, kVia, kGelen, kGiden, kTur, gLat, gLon} {
		binary.Write(w, binary.LittleEndian, d)
	}
	w.Flush()
	f.Close()
}

func TestGeoKodlaCoz(t *testing.T) {
	r := rand.New(rand.NewSource(1411))
	vLat, vLon := []int32{0, math.MaxInt32, math.MinInt32}, []int32{5, -5, 0}
	var sA, gOff []uint32
	var gLat, gLon []int32
	gOff = append(gOff, 0)
	for s := 0; s < 300; s++ {
		sA = append(sA, uint32(r.Intn(3)))
		for i := r.Intn(5); i > 0; i-- { // uç değerler dahil: taşmadan farkın int64'te tutulduğu sınanır
			switch r.Intn(4) {
			case 0:
				gLat, gLon = append(gLat, math.MaxInt32), append(gLon, math.MinInt32)
			case 1:
				gLat, gLon = append(gLat, math.MinInt32), append(gLon, math.MaxInt32)
			default:
				gLat, gLon = append(gLat, int32(r.Uint32())), append(gLon, int32(r.Uint32()))
			}
		}
		gOff = append(gOff, uint32(len(gLat)))
	}
	geo := geoKodla(gOff, sA, vLat, vLon, gLat, gLon)
	a, b, err := geoCoz(geo, gOff, sA, vLat, vLon)
	if err != nil {
		t.Fatal(err)
	}
	for i := range gLat {
		if a[i] != gLat[i] || b[i] != gLon[i] {
			t.Fatalf("%d. nokta bozuldu: %d,%d ≠ %d,%d", i, a[i], b[i], gLat[i], gLon[i])
		}
	}
	if _, _, err := geoCoz(geo[:len(geo)-1], gOff, sA, vLat, vLon); err == nil {
		t.Fatal("eksik blok kabul edildi")
	}
	if _, _, err := geoCoz(append(append([]byte{}, geo...), 0), gOff, sA, vLat, vLon); err == nil {
		t.Fatal("fazla baytlı blok kabul edildi")
	}
}

func TestRotaSurum3VeDonusturucu(t *testing.T) {
	d := t.TempDir()
	eski, yeni := filepath.Join(d, "eski.rota"), filepath.Join(d, "yeni.rota")
	tRotaYaz2(t, eski)
	ag2, err := rotaAc(eski)
	if err != nil {
		t.Fatalf("2. sürüm okunmalı: %v", err)
	}
	_, vLat, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, gLat, gLon := tAg()
	if ag2.vLat[1] != vLat[1] || ag2.gLat[2] != gLat[2] || ag2.gLon[0] != gLon[0] || len(ag2.kisitVia) != 1 {
		t.Fatal("2. sürüm yanlış okundu")
	}
	if err := rotaYenile(eski, yeni); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(yeni)
	if !strings.HasPrefix(string(b), rotaSihir) {
		t.Fatal("dönüştürülen dosya 3. sürüm değil")
	}
	ag3, err := rotaAc(yeni)
	if err != nil {
		t.Fatal(err)
	}
	if !rotaAyni(ag2, ag3) {
		t.Fatal("3. sürüm 2. sürümle aynı yol ağını vermiyor")
	}
	if len(ag3.kisitVia) != 1 || ag3.Ozet.Kaynak != "deneme" {
		t.Fatal("dönüş yasağı ya da özet taşınmadı")
	}
	if oz, err := rotaOzetOku(yeni); err != nil || oz.Kaynak != "deneme" {
		t.Fatalf("3. sürümün özeti okunmalı: %v", err)
	}
	// yarım kopyalanmış 3. sürüm reddedilir
	os.WriteFile(filepath.Join(d, "yarim.rota"), b[:len(b)-2], 0o644)
	if _, err := rotaAc(filepath.Join(d, "yarim.rota")); err == nil {
		t.Fatal("yarım dosya kabul edildi")
	}
}

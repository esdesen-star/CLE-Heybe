package main

// Harita görüntüsü: dünya haritasından bölge kesip indirme (09.11.2026, Özet §78).
// Biçim PMTiles v3 (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md). Döşeme numarası (Hilbert)
// ve dizin yazımı go-pmtiles'tan uyarlandı (BSD-3, © Protomaps LLC — LISANSLAR/BSD-3_pmtiles.txt).
// Dışarıdan kütüphane yok: yalnız Go'nun kendi paketleri.
// Yol: başlık + kök dizin → bölgenin döşemeleri bulunur (yaprak dizinler gerektikçe) → yeni dizin yazılır →
// döşeme verisi büyük parçalar hâlinde, sırayla indirilir. Yarıda kalırsa kaldığı parçadan sürer.

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/bits"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const pmBaslikBoy = 127

type pmBaslik struct {
	KokOff, KokBoy, MetaOff, MetaBoy, YaprakOff, YaprakBoy, VeriOff, VeriBoy uint64
	Adresli, Girdi, Icerik                                                   uint64
	Kumelenmis                                                               bool
	IcSik, DosemeSik, DosemeTur, EnAzZ, EnCokZ                               uint8
	BatiE7, GuneyE7, DoguE7, KuzeyE7                                         int32
	MerkezZ                                                                  uint8
	MerkezBoyE7, MerkezEnE7                                                  int32
}

func pmBaslikOku(d []byte) (pmBaslik, error) {
	var h pmBaslik
	if len(d) < pmBaslikBoy || string(d[:7]) != "PMTiles" {
		return h, errors.New("pmtiles değil")
	}
	if d[7] != 3 {
		return h, fmt.Errorf("pmtiles sürümü %d (yalnız 3 okunur)", d[7])
	}
	u := func(i int) uint64 { return binary.LittleEndian.Uint64(d[i:]) }
	s := func(i int) int32 { return int32(binary.LittleEndian.Uint32(d[i:])) }
	h = pmBaslik{u(8), u(16), u(24), u(32), u(40), u(48), u(56), u(64), u(72), u(80), u(88), d[96] == 1,
		d[97], d[98], d[99], d[100], d[101], s(102), s(106), s(110), s(114), d[118], s(119), s(123)}
	return h, nil
}

func (h pmBaslik) yaz() []byte {
	b := make([]byte, pmBaslikBoy)
	copy(b, "PMTiles")
	b[7] = 3
	for i, v := range []uint64{h.KokOff, h.KokBoy, h.MetaOff, h.MetaBoy, h.YaprakOff, h.YaprakBoy, h.VeriOff, h.VeriBoy, h.Adresli, h.Girdi, h.Icerik} {
		binary.LittleEndian.PutUint64(b[8+8*i:], v)
	}
	if h.Kumelenmis {
		b[96] = 1
	}
	b[97], b[98], b[99], b[100], b[101] = h.IcSik, h.DosemeSik, h.DosemeTur, h.EnAzZ, h.EnCokZ
	for i, v := range []int32{h.BatiE7, h.GuneyE7, h.DoguE7, h.KuzeyE7} {
		binary.LittleEndian.PutUint32(b[102+4*i:], uint32(v))
	}
	b[118] = h.MerkezZ
	binary.LittleEndian.PutUint32(b[119:], uint32(h.MerkezBoyE7))
	binary.LittleEndian.PutUint32(b[123:], uint32(h.MerkezEnE7))
	return b
}

// pmGirdi: Tekrar 0 ise yaprak dizine işaret eder (Off yaprak bölümüne göre); değilse döşeme verisine (veri bölümüne göre).
type pmGirdi struct {
	ID     uint64
	Off    uint64
	Boy    uint32
	Tekrar uint32
}

func pmAc(b []byte, sik uint8) (io.Reader, error) {
	switch sik {
	case 1:
		return bytes.NewReader(b), nil
	case 2:
		return gzip.NewReader(bytes.NewReader(b))
	}
	return nil, fmt.Errorf("pmtiles iç sıkıştırması %d okunmuyor", sik)
}

func pmGirdiCoz(b []byte, sik uint8) ([]pmGirdi, error) {
	r, err := pmAc(b, sik)
	if err != nil {
		return nil, err
	}
	ham, err := io.ReadAll(io.LimitReader(r, 512<<20))
	if err != nil {
		return nil, err
	}
	br := bytes.NewReader(ham)
	n, err := binary.ReadUvarint(br)
	if err != nil || n > uint64(len(ham)) {
		return nil, errors.New("pmtiles dizini bozuk")
	}
	g := make([]pmGirdi, n)
	oku := func() uint64 {
		v, e := binary.ReadUvarint(br)
		if e != nil {
			err = e
		}
		return v
	}
	var son uint64
	for i := range g {
		son += oku()
		g[i].ID = son
	}
	for i := range g {
		g[i].Tekrar = uint32(oku())
	}
	for i := range g {
		g[i].Boy = uint32(oku())
	}
	for i := range g {
		v := oku()
		if i > 0 && v == 0 {
			g[i].Off = g[i-1].Off + uint64(g[i-1].Boy)
		} else {
			g[i].Off = v - 1
		}
	}
	if err != nil {
		return nil, errors.New("pmtiles dizini bozuk")
	}
	return g, nil
}

func pmGirdiYaz(g []pmGirdi, sik uint8) []byte {
	var ham bytes.Buffer
	t := make([]byte, binary.MaxVarintLen64)
	yaz := func(v uint64) { ham.Write(t[:binary.PutUvarint(t, v)]) }
	yaz(uint64(len(g)))
	var son uint64
	for _, e := range g {
		yaz(e.ID - son)
		son = e.ID
	}
	for _, e := range g {
		yaz(uint64(e.Tekrar))
	}
	for _, e := range g {
		yaz(uint64(e.Boy))
	}
	for i, e := range g {
		if i > 0 && e.Off == g[i-1].Off+uint64(g[i-1].Boy) {
			yaz(0)
		} else {
			yaz(e.Off + 1)
		}
	}
	if sik != 2 {
		return ham.Bytes()
	}
	var z bytes.Buffer
	gw, _ := gzip.NewWriterLevel(&z, gzip.BestCompression)
	gw.Write(ham.Bytes())
	gw.Close()
	return z.Bytes()
}

// pmDizinKur: kök dizin ilk 16 KB'a sığmalı (başlıkla birlikte); sığmazsa yaprak dizinlere bölünür.
func pmDizinKur(g []pmGirdi, sik uint8) (kok, yaprak []byte) {
	hedef := 16384 - pmBaslikBoy
	if len(g) < 16384 {
		if k := pmGirdiYaz(g, sik); len(k) <= hedef {
			return k, nil
		}
	}
	boy := float64(len(g)) / 3500
	if boy < 4096 {
		boy = 4096
	}
	for {
		var kokG []pmGirdi
		var yap []byte
		for i := 0; i < len(g); i += int(boy) {
			son := min(i+int(boy), len(g))
			b := pmGirdiYaz(g[i:son], sik)
			kokG = append(kokG, pmGirdi{g[i].ID, uint64(len(yap)), uint32(len(b)), 0})
			yap = append(yap, b...)
		}
		if k := pmGirdiYaz(kokG, sik); len(k) <= hedef {
			return k, yap
		}
		boy *= 1.2
	}
}

func pmDondur(n, x, y, rx, ry uint32) (uint32, uint32) {
	if ry == 0 {
		if rx != 0 {
			x = n - 1 - x
			y = n - 1 - y
		}
		return y, x
	}
	return x, y
}

func zxyNo(z uint8, x, y uint32) uint64 {
	acc := (uint64(1)<<(z*2) - 1) / 3
	n := uint32(z - 1)
	for s := uint32(1 << n); s > 0; s >>= 1 {
		rx, ry := s&x, s&y
		acc += uint64((3*rx)^ry) << n
		x, y = pmDondur(s, x, y, rx, ry)
		n--
	}
	return acc
}

func noZxy(i uint64) (uint8, uint32, uint32) {
	z := uint8(bits.Len64(3*i+1)-1) / 2
	t := i - (uint64(1)<<(z*2)-1)/3
	var tx, ty uint32
	for a := uint8(0); a < z; a++ {
		s := uint32(1) << a
		rx := 1 & (uint32(t) >> 1)
		ry := 1 & (uint32(t) ^ rx)
		tx, ty = pmDondur(s, tx, ty, rx, ry)
		tx += rx << a
		ty += ry << a
		t >>= 2
	}
	return z, tx, ty
}

// dosemeAraligi: kutuyu (derece) kaplayan döşemeler, z yakınlığında.
func dosemeAraligi(z uint8, bati, guney, dogu, kuzey float64) (x0, x1, y0, y1 uint32) {
	n := float64(uint64(1) << z)
	sx := func(lon float64) uint32 {
		v := math.Floor((lon + 180) / 360 * n)
		return uint32(math.Max(0, math.Min(n-1, v)))
	}
	sy := func(lat float64) uint32 {
		lat = math.Max(-85.05112878, math.Min(85.05112878, lat)) * math.Pi / 180
		v := math.Floor((1 - math.Log(math.Tan(lat)+1/math.Cos(lat))/math.Pi) / 2 * n)
		return uint32(math.Max(0, math.Min(n-1, v)))
	}
	return sx(bati), sx(dogu), sy(kuzey), sy(guney)
}

func bolgeDosemeSayisi(enAz, enCok uint8, bati, guney, dogu, kuzey float64) uint64 {
	var top uint64
	for z := enAz; z <= enCok; z++ {
		x0, x1, y0, y1 := dosemeAraligi(z, bati, guney, dogu, kuzey)
		top += uint64(x1-x0+1) * uint64(y1-y0+1)
	}
	return top
}

// Kaynak: uzaktaki (HTTP aralık isteği) ya da yereldeki PMTiles dosyası.
type pmKaynak interface {
	Oku(ctx context.Context, off, n uint64, kesin bool) ([]byte, error)
}

type httpPmKaynak struct {
	adres   string
	istemci *http.Client
}

func (k *httpPmKaynak) Oku(ctx context.Context, off, n uint64, kesin bool) ([]byte, error) {
	var sonHata error
	for deneme := 0; deneme < 6; deneme++ {
		if deneme > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(deneme*deneme) * time.Second):
			}
		}
		ist, _ := http.NewRequestWithContext(ctx, "GET", k.adres, nil)
		ist.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", off, off+n-1))
		ist.Header.Set("User-Agent", "CLE-Heybe")
		y, err := k.istemci.Do(ist)
		if err != nil {
			sonHata = err
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			continue
		}
		if y.StatusCode != http.StatusPartialContent {
			y.Body.Close()
			sonHata = fmt.Errorf("kaynak aralık vermedi (%d)", y.StatusCode)
			if y.StatusCode == 404 || y.StatusCode == 200 {
				return nil, sonHata // aralık desteklenmiyor ya da dosya yok: yeniden denemek boşuna
			}
			continue
		}
		if cr := y.Header.Get("Content-Range"); !strings.HasPrefix(cr, fmt.Sprintf("bytes %d-", off)) {
			y.Body.Close()
			return nil, fmt.Errorf("kaynak yanlış aralık verdi: %q", cr)
		}
		b, err := io.ReadAll(io.LimitReader(y.Body, int64(n)))
		y.Body.Close()
		if err != nil {
			sonHata = err
			continue
		}
		if kesin && uint64(len(b)) != n {
			sonHata = fmt.Errorf("eksik veri: %d/%d", len(b), n)
			continue
		}
		return b, nil
	}
	return nil, sonHata
}

type dosyaPmKaynak struct{ f *os.File }

func (k dosyaPmKaynak) Oku(_ context.Context, off, n uint64, kesin bool) ([]byte, error) {
	b := make([]byte, n)
	m, err := k.f.ReadAt(b, int64(off))
	if err != nil && !(errors.Is(err, io.EOF) && !kesin) {
		return nil, err
	}
	return b[:m], nil
}

type pmBlok struct {
	Kaynak uint64 // veri bölümüne göre
	Boy    uint32
}

type pmParca struct {
	Bas, Son uint64 // kaynak veri bölümüne göre [Bas, Son)
	Bloklar  []pmBlok
}

type pmPlan struct {
	Baslik   pmBaslik
	OnEk     []byte // başlık + kök + üst bilgi + yapraklar
	Parcalar []pmParca
	Kaynak   pmBaslik
	Imza     string
}

var errBolgeBuyuk = errors.New("bolge-cok-buyuk")

var pmEnCokDoseme uint64 = 12_000_000 // bellekte tutulan döşeme numarası (~100 MB); sınavda küçültülür

// Parçalar: aradaki boşluk 64 KB'tan küçükse birleşir; parça en çok ~32 MB (bellekte tutulur). 09.11 ölçümü:
// Türkiye 1 MB eşikte 126 istek + %4 fazla indirme, 64 KB'ta 321 istek + %0,7; Hatay'da %40 → %5.
var pmParcaBosluk, pmParcaBoy uint64 = 64 << 10, 32 << 20

// pmPlanla: bölgenin hangi döşemeleri, kaynakta nerede; yeni dosyanın dizini.
func pmPlanla(ctx context.Context, k pmKaynak, bati, guney, dogu, kuzey float64, enCokZ uint8) (*pmPlan, error) {
	b0, err := k.Oku(ctx, 0, 16384, false)
	if err != nil {
		return nil, err
	}
	h, err := pmBaslikOku(b0)
	if err != nil {
		return nil, err
	}
	if h.KokOff+h.KokBoy > uint64(len(b0)) {
		return nil, errors.New("pmtiles kök dizini ilk 16 KB'ta değil")
	}
	kok, err := pmGirdiCoz(b0[h.KokOff:h.KokOff+h.KokBoy], h.IcSik)
	if err != nil {
		return nil, err
	}
	if enCokZ > h.EnCokZ {
		enCokZ = h.EnCokZ
	}
	if bolgeDosemeSayisi(h.EnAzZ, enCokZ, bati, guney, dogu, kuzey) > pmEnCokDoseme {
		return nil, errBolgeBuyuk
	}
	meta, err := k.Oku(ctx, h.MetaOff, h.MetaBoy, true)
	if err != nil {
		return nil, err
	}
	var idler []uint64
	for z := h.EnAzZ; z <= enCokZ; z++ {
		x0, x1, y0, y1 := dosemeAraligi(z, bati, guney, dogu, kuzey)
		for x := x0; x <= x1; x++ {
			for y := y0; y <= y1; y++ {
				idler = append(idler, zxyNo(z, x, y))
			}
		}
	}
	sort.Slice(idler, func(i, j int) bool { return idler[i] < idler[j] })
	bul := func(d []pmGirdi, id uint64) (pmGirdi, bool) {
		i := sort.Search(len(d), func(i int) bool { return d[i].ID > id }) - 1
		if i < 0 {
			return pmGirdi{}, false
		}
		e := d[i]
		if e.Tekrar == 0 || id-e.ID < uint64(e.Tekrar) {
			return e, true
		}
		return pmGirdi{}, false
	}
	yapraklar := map[uint64][]pmGirdi{}
	type bulunan struct {
		id, kaynak uint64
		boy        uint32
	}
	var bul2 []bulunan
	for _, id := range idler {
		d := kok
		for derin := 0; ; derin++ {
			e, ok := bul(d, id)
			if !ok {
				break
			}
			if e.Tekrar > 0 {
				bul2 = append(bul2, bulunan{id, e.Off, e.Boy})
				break
			}
			if derin > 4 {
				return nil, errors.New("pmtiles dizini çok derin")
			}
			anahtar := h.YaprakOff + e.Off
			y, var_ := yapraklar[anahtar]
			if !var_ {
				b, err := k.Oku(ctx, anahtar, uint64(e.Boy), true)
				if err != nil {
					return nil, err
				}
				if y, err = pmGirdiCoz(b, h.IcSik); err != nil {
					return nil, err
				}
				yapraklar[anahtar] = y
			}
			d = y
		}
	}
	idler = nil
	if len(bul2) == 0 {
		return nil, errors.New("bolgede-doseme-yok")
	}
	// tekil veriler kaynak sırasıyla yeni yerlerine
	tekil := map[uint64]uint32{}
	for _, b := range bul2 {
		tekil[b.kaynak] = b.boy
	}
	sirali := make([]uint64, 0, len(tekil))
	for o := range tekil {
		sirali = append(sirali, o)
	}
	sort.Slice(sirali, func(i, j int) bool { return sirali[i] < sirali[j] })
	yeni := make(map[uint64]uint64, len(sirali))
	var top uint64
	var parcalar []pmParca
	for _, o := range sirali {
		yeni[o] = top
		top += uint64(tekil[o])
		n := len(parcalar)
		if n == 0 || o > parcalar[n-1].Son+pmParcaBosluk || parcalar[n-1].Son-parcalar[n-1].Bas > pmParcaBoy {
			parcalar = append(parcalar, pmParca{Bas: o})
			n++
		}
		p := &parcalar[n-1]
		p.Bloklar = append(p.Bloklar, pmBlok{o, tekil[o]})
		if s := o + uint64(tekil[o]); s > p.Son {
			p.Son = s
		}
	}
	var girdiler []pmGirdi
	var adresli uint64
	for _, b := range bul2 {
		adresli++
		n := len(girdiler)
		if n > 0 && girdiler[n-1].ID+uint64(girdiler[n-1].Tekrar) == b.id && girdiler[n-1].Off == yeni[b.kaynak] {
			girdiler[n-1].Tekrar++
			continue
		}
		girdiler = append(girdiler, pmGirdi{b.id, yeni[b.kaynak], b.boy, 1})
	}
	kokB, yaprakB := pmDizinKur(girdiler, h.IcSik)
	nh := h
	nh.KokOff, nh.KokBoy = pmBaslikBoy, uint64(len(kokB))
	nh.MetaOff, nh.MetaBoy = nh.KokOff+nh.KokBoy, uint64(len(meta))
	nh.YaprakOff, nh.YaprakBoy = nh.MetaOff+nh.MetaBoy, uint64(len(yaprakB))
	nh.VeriOff, nh.VeriBoy = nh.YaprakOff+nh.YaprakBoy, top
	nh.Adresli, nh.Girdi, nh.Icerik = adresli, uint64(len(girdiler)), uint64(len(sirali))
	nh.EnCokZ = enCokZ
	e7 := func(v float64) int32 { return int32(math.Round(v * 1e7)) }
	nh.BatiE7, nh.GuneyE7, nh.DoguE7, nh.KuzeyE7 = e7(bati), e7(guney), e7(dogu), e7(kuzey)
	nh.MerkezBoyE7, nh.MerkezEnE7, nh.MerkezZ = e7((bati+dogu)/2), e7((guney+kuzey)/2), 0
	var onEk bytes.Buffer
	onEk.Write(nh.yaz())
	onEk.Write(kokB)
	onEk.Write(meta)
	onEk.Write(yaprakB)
	ozet := sha256.Sum256(onEk.Bytes())
	return &pmPlan{Baslik: nh, OnEk: onEk.Bytes(), Parcalar: parcalar, Kaynak: h, Imza: hex.EncodeToString(ozet[:])}, nil
}

func (p *pmPlan) IndirilecekBoy() uint64 {
	var t uint64
	for _, c := range p.Parcalar {
		t += c.Son - c.Bas
	}
	return t
}

type pmSurum struct {
	Imza  string `json:"imza"`
	Biten int    `json:"biten"`
	Boy   int64  `json:"boy"`
}

// pmIndir: planı dosyaya yazar; yarıda kalırsa son biten parçadan sürer (yan dosya <hedef>.part.json).
func pmIndir(ctx context.Context, k pmKaynak, p *pmPlan, hedef string, ilerleme func(inen, toplam uint64)) error {
	part, durumYol := hedef+".part", hedef+".part.json"
	var d pmSurum
	if b, err := os.ReadFile(durumYol); err == nil && json.Unmarshal(b, &d) == nil && d.Imza == p.Imza {
		if st, err := os.Stat(part); err != nil || st.Size() < d.Boy {
			d = pmSurum{}
		}
	} else {
		d = pmSurum{}
	}
	f, err := os.OpenFile(part, os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if d.Imza == "" {
		if err := f.Truncate(0); err != nil {
			return err
		}
		if _, err := f.WriteAt(p.OnEk, 0); err != nil {
			return err
		}
		d = pmSurum{Imza: p.Imza, Biten: 0, Boy: int64(len(p.OnEk))}
	} else if err := f.Truncate(d.Boy); err != nil {
		return err
	}
	toplam := p.IndirilecekBoy()
	var inen uint64
	for _, c := range p.Parcalar[:d.Biten] {
		inen += c.Son - c.Bas
	}
	durumYaz := func() {
		b, _ := json.Marshal(d)
		os.WriteFile(durumYol, b, 0o644)
	}
	for i := d.Biten; i < len(p.Parcalar); i++ {
		c := p.Parcalar[i]
		veri, err := k.Oku(ctx, p.Kaynak.VeriOff+c.Bas, c.Son-c.Bas, true)
		if err != nil {
			durumYaz()
			return err
		}
		yer := d.Boy
		for _, b := range c.Bloklar {
			parca := veri[b.Kaynak-c.Bas : b.Kaynak-c.Bas+uint64(b.Boy)]
			if _, err := f.WriteAt(parca, yer); err != nil {
				return err
			}
			yer += int64(b.Boy)
		}
		if err := f.Sync(); err != nil {
			return err
		}
		d.Biten, d.Boy = i+1, yer
		durumYaz()
		inen += c.Son - c.Bas
		if ilerleme != nil {
			ilerleme(inen, toplam)
		}
	}
	if beklenen := int64(len(p.OnEk)) + int64(p.Baslik.VeriBoy); d.Boy != beklenen {
		return fmt.Errorf("harita dosyasının boyu tutmadı: %d/%d", d.Boy, beklenen)
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(part, hedef); err != nil {
		return err
	}
	os.Remove(durumYol)
	return nil
}

// pmDosemeOku: yerel dosyadan bir döşeme (sınav ve denetim için).
func pmDosemeOku(yol string, z uint8, x, y uint32) ([]byte, bool, error) {
	f, err := os.Open(yol)
	if err != nil {
		return nil, false, err
	}
	defer f.Close()
	k := dosyaPmKaynak{f}
	b0, err := k.Oku(context.Background(), 0, 16384, false)
	if err != nil {
		return nil, false, err
	}
	h, err := pmBaslikOku(b0)
	if err != nil {
		return nil, false, err
	}
	d, err := pmGirdiCoz(b0[h.KokOff:h.KokOff+h.KokBoy], h.IcSik)
	if err != nil {
		return nil, false, err
	}
	id := zxyNo(z, x, y)
	for derin := 0; derin < 5; derin++ {
		i := sort.Search(len(d), func(i int) bool { return d[i].ID > id }) - 1
		if i < 0 {
			return nil, false, nil
		}
		e := d[i]
		if e.Tekrar > 0 {
			if id-e.ID >= uint64(e.Tekrar) {
				return nil, false, nil
			}
			b, err := k.Oku(context.Background(), h.VeriOff+e.Off, uint64(e.Boy), true)
			return b, err == nil, err
		}
		b, err := k.Oku(context.Background(), h.YaprakOff+e.Off, uint64(e.Boy), true)
		if err != nil {
			return nil, false, err
		}
		if d, err = pmGirdiCoz(b, h.IcSik); err != nil {
			return nil, false, err
		}
	}
	return nil, false, errors.New("dizin çok derin")
}

// pmEnCokZSec: bölge büyükse ayrıntı (yakınlık) düşürülür; harita yine açılır, en yakında biraz kaba görünür.
func pmEnCokZSec(enAz, enCok uint8, bati, guney, dogu, kuzey float64) uint8 {
	for z := enCok; z > enAz; z-- {
		if bolgeDosemeSayisi(enAz, z, bati, guney, dogu, kuzey) <= pmEnCokDoseme {
			return z
		}
	}
	return enAz
}

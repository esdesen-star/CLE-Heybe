package main

// OpenStreetMap .osm.pbf okuyucu (09.11.2026, harita 8i).
// Dışarıdan kütüphane yok: yardımcı yalnız Go'nun kendi paketleriyle derlenir (yap.sh, 5 hedef).
// Biçim: https://wiki.openstreetmap.org/wiki/PBF_Format — [4 bayt uzunluk][BlobHeader][Blob(zlib)].
// Yalnız gerekenler okunur: yoğun düğümler (dense), tek düğümler, yollar (way). İlişkiler atlanır.

import (
	"bufio"
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// pbOku: en küçük protobuf okuyucu.
type pbOku struct {
	b []byte
	i int
}

func (p *pbOku) bitti() bool { return p.i >= len(p.b) }

func (p *pbOku) varint() (uint64, error) {
	var x uint64
	var s uint
	for k := 0; k < 10; k++ {
		if p.i >= len(p.b) {
			return 0, io.ErrUnexpectedEOF
		}
		c := p.b[p.i]
		p.i++
		x |= uint64(c&0x7f) << s
		if c < 0x80 {
			return x, nil
		}
		s += 7
	}
	return 0, errors.New("pbf: varint çok uzun")
}

// alan: bir sonraki alanın numarası ve tel türü.
func (p *pbOku) alan() (int, int, error) {
	k, err := p.varint()
	if err != nil {
		return 0, 0, err
	}
	return int(k >> 3), int(k & 7), nil
}

func (p *pbOku) baytlar() ([]byte, error) {
	n, err := p.varint()
	if err != nil {
		return nil, err
	}
	if uint64(len(p.b)-p.i) < n {
		return nil, io.ErrUnexpectedEOF
	}
	v := p.b[p.i : p.i+int(n)]
	p.i += int(n)
	return v, nil
}

func (p *pbOku) atla(tel int) error {
	switch tel {
	case 0:
		_, err := p.varint()
		return err
	case 1:
		p.i += 8
	case 2:
		_, err := p.baytlar()
		return err
	case 5:
		p.i += 4
	default:
		return fmt.Errorf("pbf: bilinmeyen tel türü %d", tel)
	}
	if p.i > len(p.b) {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func zigzag(u uint64) int64 { return int64(u>>1) ^ -int64(u&1) }

// paketli: sıkıştırılmış (packed) varint dizisi.
func paketliVarint(b []byte, f func(uint64)) error {
	p := pbOku{b: b}
	for !p.bitti() {
		v, err := p.varint()
		if err != nil {
			return err
		}
		f(v)
	}
	return nil
}

// osmDugum / osmYol: okuyucunun dışarı verdiği en sade kayıtlar.
// Koordinatlar 1e-7 derece (OSM'nin kendi birimi), int32'ye sığar.
type osmDugum struct {
	ID       int64
	Lat, Lon int32
	Etiket   map[string]string // etiketsizse nil
}

type osmYol struct {
	ID     int64
	Refs   []int64
	Etiket map[string]string
}

// pbfGezgin: dosyayı blok blok gezer; her blokta istenen geri çağırmaları yapar.
// dugumIste false ise düğüm blokları açılmadan geçilmez ama düğümler çözülmez (hız).
type pbfGezgin struct {
	Dugum       func(d *osmDugum)
	Yol         func(y *osmYol)
	DugumEtiket bool // düğüm etiketleri de çözülsün mü (yer dizini için)
}

func (g *pbfGezgin) Gez(r io.Reader) error {
	br := bufio.NewReaderSize(r, 1<<20)
	var bas [4]byte
	for {
		if _, err := io.ReadFull(br, bas[:]); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		hn := binary.BigEndian.Uint32(bas[:])
		if hn > 64*1024 {
			return errors.New("pbf: başlık çok büyük")
		}
		hb := make([]byte, hn)
		if _, err := io.ReadFull(br, hb); err != nil {
			return err
		}
		tur, boy, err := blobBaslik(hb)
		if err != nil {
			return err
		}
		if boy > 64*1024*1024 {
			return errors.New("pbf: blok çok büyük")
		}
		bb := make([]byte, boy)
		if _, err := io.ReadFull(br, bb); err != nil {
			return err
		}
		if tur != "OSMData" {
			continue // OSMHeader: zorunlu özellikleri bugün denetlemiyoruz
		}
		veri, err := blobAc(bb)
		if err != nil {
			return err
		}
		if err := g.blok(veri); err != nil {
			return err
		}
	}
}

func blobBaslik(b []byte) (string, int, error) {
	p := pbOku{b: b}
	var tur string
	boy := -1
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return "", 0, err
		}
		switch {
		case no == 1 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return "", 0, err
			}
			tur = string(v)
		case no == 3 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return "", 0, err
			}
			boy = int(v)
		default:
			if err := p.atla(tel); err != nil {
				return "", 0, err
			}
		}
	}
	if boy < 0 {
		return "", 0, errors.New("pbf: blok boyu yok")
	}
	return tur, boy, nil
}

func blobAc(b []byte) ([]byte, error) {
	p := pbOku{b: b}
	var ham, zl []byte
	acik := 0
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return nil, err
		}
		switch {
		case no == 1 && tel == 2:
			if ham, err = p.baytlar(); err != nil {
				return nil, err
			}
		case no == 2 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return nil, err
			}
			acik = int(v)
		case no == 3 && tel == 2:
			if zl, err = p.baytlar(); err != nil {
				return nil, err
			}
		case (no == 4 || no == 5 || no == 6 || no == 7) && tel == 2:
			return nil, errors.New("pbf: yalnız zlib sıkıştırması destekleniyor (Geofabrik dosyaları zlib)")
		default:
			if err := p.atla(tel); err != nil {
				return nil, err
			}
		}
	}
	if ham != nil {
		return ham, nil
	}
	if zl == nil {
		return nil, errors.New("pbf: boş blok")
	}
	zr, err := zlib.NewReader(bytes.NewReader(zl))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	out := make([]byte, 0, acik)
	buf := bytes.NewBuffer(out)
	if _, err := io.Copy(buf, zr); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// blok: PrimitiveBlock.
func (g *pbfGezgin) blok(b []byte) error {
	p := pbOku{b: b}
	var tablo [][]byte
	var gruplar [][]byte
	gran := int64(100)
	var latOff, lonOff int64
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return err
		}
		switch {
		case no == 1 && tel == 2:
			st, err := p.baytlar()
			if err != nil {
				return err
			}
			q := pbOku{b: st}
			for !q.bitti() {
				n2, t2, err := q.alan()
				if err != nil {
					return err
				}
				if n2 == 1 && t2 == 2 {
					s, err := q.baytlar()
					if err != nil {
						return err
					}
					tablo = append(tablo, s)
				} else if err := q.atla(t2); err != nil {
					return err
				}
			}
		case no == 2 && tel == 2:
			gb, err := p.baytlar()
			if err != nil {
				return err
			}
			gruplar = append(gruplar, gb)
		case no == 17 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			gran = int64(v)
		case no == 19 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			latOff = int64(v)
		case no == 20 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			lonOff = int64(v)
		default:
			if err := p.atla(tel); err != nil {
				return err
			}
		}
	}
	// nanoderece → 1e-7 derece
	koord := func(off, v int64) int32 { return int32((off + gran*v) / 100) }
	for _, gb := range gruplar {
		q := pbOku{b: gb}
		for !q.bitti() {
			no, tel, err := q.alan()
			if err != nil {
				return err
			}
			if tel != 2 {
				if err := q.atla(tel); err != nil {
					return err
				}
				continue
			}
			v, err := q.baytlar()
			if err != nil {
				return err
			}
			switch no {
			case 1:
				if g.Dugum != nil {
					if err := g.tekDugum(v, tablo, latOff, lonOff, koord); err != nil {
						return err
					}
				}
			case 2:
				if g.Dugum != nil {
					if err := g.yogun(v, tablo, latOff, lonOff, koord); err != nil {
						return err
					}
				}
			case 3:
				if g.Yol != nil {
					if err := g.yol(v, tablo); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func etiketYap(keys, vals []uint32, tablo [][]byte) map[string]string {
	if len(keys) == 0 {
		return nil
	}
	m := make(map[string]string, len(keys))
	for i := range keys {
		if i < len(vals) && int(keys[i]) < len(tablo) && int(vals[i]) < len(tablo) {
			m[string(tablo[keys[i]])] = string(tablo[vals[i]])
		}
	}
	return m
}

func (g *pbfGezgin) tekDugum(b []byte, tablo [][]byte, latOff, lonOff int64, koord func(int64, int64) int32) error {
	p := pbOku{b: b}
	var d osmDugum
	var keys, vals []uint32
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return err
		}
		switch {
		case no == 1 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			d.ID = zigzag(v)
		case no == 2 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return err
			}
			paketliVarint(v, func(x uint64) { keys = append(keys, uint32(x)) })
		case no == 3 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return err
			}
			paketliVarint(v, func(x uint64) { vals = append(vals, uint32(x)) })
		case no == 8 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			d.Lat = koord(latOff, zigzag(v))
		case no == 9 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			d.Lon = koord(lonOff, zigzag(v))
		default:
			if err := p.atla(tel); err != nil {
				return err
			}
		}
	}
	if g.DugumEtiket {
		d.Etiket = etiketYap(keys, vals, tablo)
	}
	g.Dugum(&d)
	return nil
}

func (g *pbfGezgin) yogun(b []byte, tablo [][]byte, latOff, lonOff int64, koord func(int64, int64) int32) error {
	p := pbOku{b: b}
	var ids, lats, lons []int64
	var kv []uint32
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return err
		}
		if tel != 2 {
			if err := p.atla(tel); err != nil {
				return err
			}
			continue
		}
		v, err := p.baytlar()
		if err != nil {
			return err
		}
		switch no {
		case 1:
			var t int64
			paketliVarint(v, func(x uint64) { t += zigzag(x); ids = append(ids, t) })
		case 8:
			var t int64
			paketliVarint(v, func(x uint64) { t += zigzag(x); lats = append(lats, t) })
		case 9:
			var t int64
			paketliVarint(v, func(x uint64) { t += zigzag(x); lons = append(lons, t) })
		case 10:
			if g.DugumEtiket {
				paketliVarint(v, func(x uint64) { kv = append(kv, uint32(x)) })
			}
		}
	}
	if len(lats) != len(ids) || len(lons) != len(ids) {
		return errors.New("pbf: yoğun düğüm dizileri eşit değil")
	}
	j := 0
	var d osmDugum
	for i := range ids {
		d.ID = ids[i]
		d.Lat = koord(latOff, lats[i])
		d.Lon = koord(lonOff, lons[i])
		d.Etiket = nil
		if g.DugumEtiket && j < len(kv) {
			var m map[string]string
			for j < len(kv) && kv[j] != 0 {
				if j+1 >= len(kv) {
					break
				}
				k, val := kv[j], kv[j+1]
				if int(k) < len(tablo) && int(val) < len(tablo) {
					if m == nil {
						m = make(map[string]string, 2)
					}
					m[string(tablo[k])] = string(tablo[val])
				}
				j += 2
			}
			j++ // 0 ayıracı
			d.Etiket = m
		}
		g.Dugum(&d)
	}
	return nil
}

func (g *pbfGezgin) yol(b []byte, tablo [][]byte) error {
	p := pbOku{b: b}
	var y osmYol
	var keys, vals []uint32
	for !p.bitti() {
		no, tel, err := p.alan()
		if err != nil {
			return err
		}
		switch {
		case no == 1 && tel == 0:
			v, err := p.varint()
			if err != nil {
				return err
			}
			y.ID = int64(v)
		case no == 2 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return err
			}
			paketliVarint(v, func(x uint64) { keys = append(keys, uint32(x)) })
		case no == 3 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return err
			}
			paketliVarint(v, func(x uint64) { vals = append(vals, uint32(x)) })
		case no == 8 && tel == 2:
			v, err := p.baytlar()
			if err != nil {
				return err
			}
			var t int64
			paketliVarint(v, func(x uint64) { t += zigzag(x); y.Refs = append(y.Refs, t) })
		default:
			if err := p.atla(tel); err != nil {
				return err
			}
		}
	}
	y.Etiket = etiketYap(keys, vals, tablo)
	g.Yol(&y)
	return nil
}

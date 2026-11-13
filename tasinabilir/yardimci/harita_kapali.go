package main

// Kapalı yol (12.11.2026, Planlama 8f2 — LM 10.11: "harita afetten önceki hâli gösteriyor"). Kullanıcı yıkılan yolu,
// çöken köprüyü haritada tek dokunuşla kapatır; rota oradan geçmez (yaya da araç da). Kayıt bir NOKTADIR (enlem,
// boylam), parça numarası değil: harita yeniden hazırlanınca (.rota değişince) nokta yeniden en yakın parçaya bağlanır.
// Kapatılan, noktanın üstünde durduğu parçadır (iki kavşak arası): sokağın o bölümü.
// Dosya: harita/kapali.json — {"turkiye": [{"id": "…", "lat": …, "lon": …, "tarih": "2026-11-12"}]} (harita adına göre).
// İleride telefonlar arası paylaşımla öbürlerine gider (Özet §93); bugün yalnız bu Heybe'de.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const kapaliSinir = 60.0 // m: dokunulan nokta en yakın yoldan bundan uzaksa kapatılacak yol yok sayılır

type kapaliYol struct {
	ID    string  `json:"id"`
	Lat   float64 `json:"lat"`
	Lon   float64 `json:"lon"`
	Tarih string  `json:"tarih"`
}

// kapaliGorunum: sayfaya giden hâli — kayıt + bu haritada bağlandığı parça (ad, uzunluk, çizgi)
type kapaliGorunum struct {
	kapaliYol
	Ad    string       `json:"ad"`
	Tur   uint8        `json:"tur"`
	M     float64      `json:"m"`
	Sapma float64      `json:"sapma"`
	Geo   [][2]float64 `json:"geo"`
	Bagli bool         `json:"bagli"` // bu haritada bir parçaya bağlandı mı (harita değiştiyse ve nokta yoldan uzaksa false)
}

var kapaliKilit sync.Mutex

func kapaliYolu() string { return filepath.Join(haritaDir(), "kapali.json") }

func kapaliOku() map[string][]kapaliYol {
	m := map[string][]kapaliYol{}
	b, err := os.ReadFile(kapaliYolu())
	if err != nil {
		return m
	}
	if json.Unmarshal(b, &m) != nil {
		return map[string][]kapaliYol{}
	}
	return m
}

func kapaliYaz(m map[string][]kapaliYol) error {
	b, err := json.MarshalIndent(m, "", " ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(haritaDir(), 0o755); err != nil {
		return err
	}
	return guvenliYaz(kapaliYolu(), b)
}

// yakinParca: noktaya en yakın parça (çizgisine dik uzaklıkla, ara noktalar dahil) ve uzaklığı (m). Kip ayırmaz.
// Uzun parçanın uçları uzakta kalabilir (köprü): ilk köşe bulunduktan sonra iki halka (~2 km) daha bakılır.
func (ag *rotaAg) yakinParca(lat, lon float64) (int, float64) {
	cla := int64(math.Floor(lat * hucreOlcek))
	clo := int64(math.Floor(lon * hucreOlcek))
	kx := math.Cos(lat*math.Pi/180) * 111320
	const ky = 110540.0
	xy := func(la, lo int32) (float64, float64) {
		return (float64(lo)/1e7 - lon) * kx, (float64(la)/1e7 - lat) * ky
	}
	parcaUzak := func(s uint32) float64 {
		noktalar := [][2]float64{}
		ekle := func(la, lo int32) { x, y := xy(la, lo); noktalar = append(noktalar, [2]float64{x, y}) }
		ekle(ag.vLat[ag.sA[s]], ag.vLon[ag.sA[s]])
		for i := ag.gOff[s]; i < ag.gOff[s+1]; i++ {
			ekle(ag.gLat[i], ag.gLon[i])
		}
		ekle(ag.vLat[ag.sB[s]], ag.vLon[ag.sB[s]])
		en := math.MaxFloat64
		for i := 1; i < len(noktalar); i++ {
			if d := doguUzaklik(noktalar[i-1], noktalar[i]); d < en {
				en = d
			}
		}
		return en
	}
	en, enS, bulundu := math.MaxFloat64, -1, -1
	bakilan := map[uint32]bool{}
	for r := int64(0); r <= 40; r++ {
		for dy := -r; dy <= r; dy++ {
			for dx := -r; dx <= r; dx++ {
				if dy != -r && dy != r && dx != -r && dx != r {
					continue
				}
				anahtar := (cla+dy+9000)*100000 + (clo + dx + 18000)
				h := sort.Search(len(ag.hucreler), func(i int) bool { return ag.hucreler[i] >= anahtar })
				if h >= len(ag.hucreler) || ag.hucreler[h] != anahtar {
					continue
				}
				for v := ag.hucreBas[h]; v < ag.hucreBas[h+1]; v++ {
					for i := ag.derece[v]; i < ag.derece[v+1]; i++ {
						s := ag.komsu[i] >> 1
						if bakilan[s] {
							continue
						}
						bakilan[s] = true
						if d := parcaUzak(s); d < en {
							en, enS = d, int(s)
						}
					}
				}
			}
		}
		if enS >= 0 && bulundu < 0 {
			bulundu = int(r)
		}
		if bulundu >= 0 && int(r) >= bulundu+2 {
			break
		}
	}
	return enS, en
}

// doguUzaklik: başlangıç noktasının (0,0) a–b doğru parçasına uzaklığı (metre düzleminde)
func doguUzaklik(a, b [2]float64) float64 {
	dx, dy := b[0]-a[0], b[1]-a[1]
	t := 0.0
	if l := dx*dx + dy*dy; l > 0 {
		t = math.Max(0, math.Min(1, -(a[0]*dx+a[1]*dy)/l))
	}
	x, y := a[0]+t*dx, a[1]+t*dy
	return math.Hypot(x, y)
}

// kapaliUygula: kapalı parçaların biti (rota bunlardan geçmez). Liste boşsa bit tablosu kalkar.
func (ag *rotaAg) kapaliUygula(liste []kapaliYol) []kapaliGorunum {
	gor := make([]kapaliGorunum, 0, len(liste))
	var bit []uint64
	for _, k := range liste {
		g := kapaliGorunum{kapaliYol: k}
		if s, d := ag.yakinParca(k.Lat, k.Lon); s >= 0 && d <= kapaliSinir {
			if bit == nil {
				bit = make([]uint64, (len(ag.sA)+63)/64)
			}
			bit[s>>6] |= 1 << (uint(s) & 63)
			g.Bagli, g.Sapma, g.M, g.Tur = true, math.Round(d), math.Round(float64(ag.sUz[s])), ag.sSinif[s]
			if int(ag.sAd[s]) < len(ag.adlar) {
				g.Ad = ag.adlar[ag.sAd[s]]
			}
			n := func(la, lo int32) [2]float64 {
				return [2]float64{math.Round(float64(lo)/10) / 1e6, math.Round(float64(la)/10) / 1e6}
			}
			g.Geo = append([][2]float64{n(ag.vLat[ag.sA[s]], ag.vLon[ag.sA[s]])}, ag.araNoktalar(uint32(s))...)
			g.Geo = append(g.Geo, n(ag.vLat[ag.sB[s]], ag.vLon[ag.sB[s]]))
		}
		gor = append(gor, g)
	}
	ag.mu.Lock()
	ag.kapaliBit, ag.kapaliSayi = bit, 0
	for _, g := range gor {
		if g.Bagli {
			ag.kapaliSayi++
		}
	}
	ag.mu.Unlock()
	return gor
}

func (ag *rotaAg) kapali(s uint32) bool {
	return ag.kapaliBit != nil && ag.kapaliBit[s>>6]&(1<<(s&63)) != 0
}

// /api/kapali?harita=…  GET: liste · POST {lat, lon}: kapat · DELETE ?id=…: aç
func apiKapali(w http.ResponseWriter, r *http.Request) {
	ag, ad, err := haritaAg(haritaSec(r))
	if err != nil {
		jsonYaz(w, 404, map[string]string{"hata": "harita-yok"})
		return
	}
	kapaliKilit.Lock()
	defer kapaliKilit.Unlock()
	hepsi := kapaliOku()
	switch r.Method {
	case http.MethodGet:
	case http.MethodPost:
		var g struct {
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		}
		if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&g) != nil || math.Abs(g.Lat) > 90 || math.Abs(g.Lon) > 180 || (g.Lat == 0 && g.Lon == 0) {
			jsonYaz(w, 400, map[string]string{"hata": "istek"})
			return
		}
		if s, d := ag.yakinParca(g.Lat, g.Lon); s < 0 || d > kapaliSinir {
			jsonYaz(w, 404, map[string]string{"hata": "yol-yok"})
			return
		}
		b := make([]byte, 6)
		rand.Read(b)
		hepsi[ad] = append(hepsi[ad], kapaliYol{ID: hex.EncodeToString(b), Lat: math.Round(g.Lat*1e6) / 1e6, Lon: math.Round(g.Lon*1e6) / 1e6,
			Tarih: time.Now().Format("2006-01-02")})
	case http.MethodDelete:
		id, kalan := r.URL.Query().Get("id"), []kapaliYol{}
		for _, k := range hepsi[ad] {
			if k.ID != id {
				kalan = append(kalan, k)
			}
		}
		if len(kalan) == len(hepsi[ad]) {
			jsonYaz(w, 404, map[string]string{"hata": "yok"})
			return
		}
		hepsi[ad] = kalan
		if len(kalan) == 0 {
			delete(hepsi, ad)
		}
	default:
		http.Error(w, "yöntem", http.StatusMethodNotAllowed)
		return
	}
	if r.Method != http.MethodGet {
		if err := kapaliYaz(hepsi); err != nil {
			jsonYaz(w, 500, map[string]string{"hata": "yazilamadi"})
			return
		}
	}
	jsonYaz(w, 200, map[string]any{"kapali": ag.kapaliUygula(hepsi[ad])})
}

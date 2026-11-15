package main

// "Bu cevap yanlış" (Ö18, 07.11.2026 — Özet §38: "kullanıcı işaretler, bellekte kalır; internet varsa ve kullanıcı
// izin verirse bize ulaşır"). Kayıt kullanıcının kendi klasöründe: heybe/benim/yanlis_cevaplar.jsonl, her satır bir kayıt.
// Hiçbir yere kendiliğinden gitmez; kullanıcı dosyayı indirip verebilir (GitHub hazır olunca gönderme yolu ayrıca, izinle).
// Kayıt soruyu, gösterilen cevabı, kaynak parçalarını ve bekçilerin hükmünü taşır: bir sonraki sürümde aynı soru
// yeniden sorulup düzelip düzelmediği ölçülür (olcum/kopru/yanlis_oku.cjs — kayıt okuyucusuz kalmaz).

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	yanlisKayitSiniri = 256 << 10 // bir kayıt en çok 256 KB (kaynak parçaları dahil)
	yanlisDosyaSiniri = 8 << 20   // dosya en çok 8 MB: bellek dolmasın
)

var yanlisKilit sync.Mutex

func yanlisYolu() string { return filepath.Join(benimDir, "yanlis_cevaplar.jsonl") }

// yanlisOku: kayıtlar sırayla; bozuk satır atlanır (fiş çekilirse son satır yarım kalabilir — güvenli yazma bunu
// önler ama elle düzenlenmiş dosyada olabilir)
func yanlisOku() []map[string]any {
	b, err := os.ReadFile(yanlisYolu())
	if err != nil {
		return nil
	}
	var kayitlar []map[string]any
	for _, satir := range bytes.Split(b, []byte("\n")) {
		if len(bytes.TrimSpace(satir)) == 0 {
			continue
		}
		var k map[string]any
		if json.Unmarshal(satir, &k) == nil {
			kayitlar = append(kayitlar, k)
		}
	}
	return kayitlar
}

func yanlisYaz(kayitlar []map[string]any) error {
	var b bytes.Buffer
	for _, k := range kayitlar {
		s, err := json.Marshal(k)
		if err != nil {
			return err
		}
		b.Write(s)
		b.WriteByte('\n')
	}
	if b.Len() > yanlisDosyaSiniri {
		return errYanlisDolu
	}
	if err := guvenliYaz(yanlisYolu(), b.Bytes()); err != nil {
		return err
	}
	// §158 (K7, sahte bellekte canlı denemede bulundu): güvenli yazma bir önceki sürümü .onceki olarak saklar. Eski şifresiz
	// kayıtlar şifrelenip silinince o kopya şifresiz soruyu taşımaya devam ediyordu. Dosyada şifresiz kayıt kalmadıysa,
	// şifresiz kayıt taşıyan önceki sürüm silinir (defterdeki aynı kural: defter.go).
	if !yanlisSifresizVar(b.Bytes()) {
		if eski, err := os.ReadFile(yanlisYolu() + ".onceki"); err == nil && yanlisSifresizVar(eski) {
			_ = os.Remove(yanlisYolu() + ".onceki")
		}
	}
	return nil
}

// yanlisSifresizVar: dosyada şifresiz (soru taşıyan) bir kayıt var mı
func yanlisSifresizVar(b []byte) bool {
	for _, satir := range bytes.Split(b, []byte("\n")) {
		var k map[string]any
		if json.Unmarshal(satir, &k) != nil {
			continue
		}
		if _, sifreli := k["sifreli"]; !sifreli {
			if _, soru := k["soru"]; soru {
				return true
			}
		}
	}
	return false
}

var (
	errYanlisDolu     = errors.New("yanlış cevap kayıtları dolu (8 MB): eskileri indirip silebilirsin")
	errYanlisGecersiz = errors.New("geçersiz kayıt")
)

// 15.11.2026 akşam (Özet §158, K7): kayıt soruyu, cevabı ve kullanıcının notunu taşır — kişisel bilgi (sağlık durumu).
// Sayfa kaydı Defterim'in veri anahtarıyla şifreler (AES-GCM); burada yalnız zarfın biçimi denetlenir, çözülemez.
// Açıkta yalnız dil ve sonuç kalır (ölçü için). Şifresiz yeni kayıt reddedilir; 0.38.0'a kadarki şifresiz kayıtlar
// okunur, sayfa defter açılınca onları şifreleyip yerine koyar.
var yanlisAcikAlan = map[string]bool{"sifreli": true, "sifreliOzet": true, "dil": true, "sonuc": true}

func yanlisKutuGecerli(v any) bool {
	k, ok := v.(map[string]any)
	if !ok || len(k) != 2 {
		return false
	}
	gecerli := func(ad string, en, tam int) bool {
		s, _ := k[ad].(string)
		b, err := base64.StdEncoding.DecodeString(s)
		return err == nil && len(b) >= en && (tam == 0 || len(b) == tam)
	}
	return gecerli("iv", 12, 12) && gecerli("veri", 17, 0)
}

// yanlisEkle: sayfadan gelen şifreli kaydı denetler, tarih + sürüm + kimlik ekler, dosyanın sonuna koyar
func yanlisEkle(kayit map[string]any) (map[string]any, error) {
	if _, ok := kayit["sifreli"]; !ok {
		return nil, fmt.Errorf("%w: K7 — kayıt şifreli olmalı (önce Defterim'i aç)", errYanlisGecersiz)
	}
	for alan := range kayit {
		if !yanlisAcikAlan[alan] {
			return nil, fmt.Errorf("%w: K7 — şifreli kaydın yanında açık alan olamaz (%s)", errYanlisGecersiz, alan)
		}
	}
	if !yanlisKutuGecerli(kayit["sifreli"]) || !yanlisKutuGecerli(kayit["sifreliOzet"]) {
		return nil, fmt.Errorf("%w: şifreli kutu geçersiz", errYanlisGecersiz)
	}
	if d, _ := kayit["dil"].(string); !utf8.ValidString(d) || len(d) > 12 {
		return nil, fmt.Errorf("%w: dil geçersiz", errYanlisGecersiz)
	}
	if s, ok := kayit["sonuc"].(string); ok && s != "cevap" && s != "durdu" && s != "bilgiYok" {
		return nil, fmt.Errorf("%w: sonuç geçersiz", errYanlisGecersiz)
	}
	simdi := time.Now() // kimlik, tarih ve sürümü sayfa yazamaz: hep burada üstüne yazılır
	kayit["kimlik"] = strconv.FormatInt(simdi.UnixNano(), 36)
	kayit["tarih"] = simdi.Format(time.RFC3339)
	kayit["surum"] = urunSurumu()
	kayit["yardimci"] = surum
	yanlisKilit.Lock()
	defer yanlisKilit.Unlock()
	kayitlar := append(yanlisOku(), kayit)
	if err := yanlisYaz(kayitlar); err != nil {
		return nil, err
	}
	return kayit, nil
}

func yanlisSil(kimlik string) (bool, error) {
	yanlisKilit.Lock()
	defer yanlisKilit.Unlock()
	eski := yanlisOku()
	var kalan []map[string]any
	for _, k := range eski {
		if k["kimlik"] != kimlik {
			kalan = append(kalan, k)
		}
	}
	if len(kalan) == len(eski) {
		return false, nil
	}
	return true, yanlisYaz(kalan)
}

// urunSurumu: heybe/surum.json'daki sürüm (tek yer, 06.11); okunamazsa boş
func urunSurumu() string {
	b, err := os.ReadFile(filepath.Join(kok, "heybe", "surum.json"))
	if err != nil {
		return ""
	}
	var s map[string]any
	if json.Unmarshal(b, &s) != nil {
		return ""
	}
	v, _ := s["surum"].(string)
	return v
}

// GET /api/yanlis → {kayitlar: [{kimlik, tarih, dil, soru, not, sonuc}]} · GET /api/yanlis?indir=1 → dosyanın kendisi
// POST /api/yanlis {kayit} → kaydeder · POST /api/yanlis {"sil": kimlik} → o kaydı siler
func apiYanlis(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		if r.URL.Query().Get("indir") != "" {
			yanlisKilit.Lock()
			b, err := os.ReadFile(yanlisYolu())
			yanlisKilit.Unlock()
			if err != nil {
				b = nil
			}
			w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="heybe_yanlis_cevaplar_%s.jsonl"`, time.Now().Format("2006-01-02")))
			w.Header().Set("Cache-Control", "no-store")
			_, _ = w.Write(b)
			return
		}
		ozet := []map[string]any{}
		yanlisKilit.Lock()
		kayitlar := yanlisOku()
		yanlisKilit.Unlock()
		for _, k := range kayitlar {
			o := map[string]any{}
			for _, alan := range []string{"kimlik", "tarih", "dil", "soru", "not", "sonuc", "surum", "sifreliOzet"} { // §158: şifreli özet (sayfa çözer)
				if v, ok := k[alan]; ok {
					o[alan] = v
				}
			}
			ozet = append(ozet, o)
		}
		jsonYaz(w, 200, map[string]any{"kayitlar": ozet})
		return
	}
	if !yalnizPost(w, r) {
		return
	}
	govde, err := io.ReadAll(io.LimitReader(r.Body, yanlisKayitSiniri+1))
	if err != nil {
		hata(w, 400, "kayıt okunamadı")
		return
	}
	if len(govde) > yanlisKayitSiniri {
		hata(w, 413, "kayıt çok büyük")
		return
	}
	var istek map[string]any
	if err := json.Unmarshal(govde, &istek); err != nil {
		hata(w, 400, "kayıt okunamadı")
		return
	}
	if sil, ok := istek["sil"].(string); ok {
		bulundu, err := yanlisSil(sil)
		if err != nil {
			hata(w, 500, "kayıt silinemedi")
			return
		}
		if !bulundu {
			hata(w, 404, "kayıt bulunamadı")
			return
		}
		jsonYaz(w, 200, map[string]bool{"silindi": true})
		return
	}
	kayit, ok := istek["kayit"].(map[string]any)
	if !ok {
		hata(w, 400, "kayıt yok")
		return
	}
	k, err := yanlisEkle(kayit)
	if err != nil {
		kod := http.StatusInternalServerError
		switch {
		case errors.Is(err, errYanlisGecersiz):
			kod = http.StatusBadRequest
		case errors.Is(err, errYanlisDolu):
			kod = http.StatusInsufficientStorage
		}
		hata(w, kod, err.Error())
		return
	}
	jsonYaz(w, 200, map[string]any{"kimlik": k["kimlik"], "tarih": k["tarih"]})
}

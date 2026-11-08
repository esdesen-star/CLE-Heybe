package main

// İlk kurulum: modeller (08.11.2026, Özet §66 — Ercan: "asıl en önemli amacımız normal bir kullanıcı bunu indirip
// kurabilmesi"). GitHub'daki hazır paket modelsiz gelir: modeller GitHub'a sığmaz ve Gemma koşullarını kullanıcı
// kendisi kabul eder (K19). Sayfa eksik modelleri gösterir; kullanıcı koşulları kabul edip "İndir" der; yardımcı
// program kitap indiricisinin yolundan indirir (kaldığı yerden sürer, sağlamayı denetler) ve inen anlam ve sohbet
// modellerini kendisi açar — yeniden başlatmak gerekmez. Çevirmen yine gerekince açılır (cevirmen.go).
// Adresler ölçtüğümüz dosyaların birebir aynısını verir (sağlamalar 08.11'de yerel dosyalarla eşleşti).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

const gemmaKosullari = "https://ai.google.dev/gemma/terms"

type modelKaydi struct {
	Dosya string // bellekte model/<Dosya> (başlatıcılar bu adla açar)
	Ne    string // anlam · sohbet · cevirmen
	Adres string
	Boyut int64
	Imza  string // sha-256
}

var (
	sohbetPortu, gommePortu int
	modelAcilsin            = true // sınavda kapatılır: inen modeli açmaya çalışma
	modeller                = []modelKaydi{
		{"embeddinggemma-300M-Q8_0.gguf", "anlam",
			"https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf",
			333590944, "b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63"},
		// Gemma 3 4B: ölçtüğümüz dosya Ollama'nın kendi deposundaki (Hugging Face'teki Q4_K_M'ler bayt bayt farklı)
		{"gemma3-4b.gguf", "sohbet",
			"https://registry.ollama.ai/v2/library/gemma3/blobs/sha256:f06e91e18fc74295d0c781bf91622508c75655e2c18ed869d52447ffe1e667e1",
			2499012288, "f06e91e18fc74295d0c781bf91622508c75655e2c18ed869d52447ffe1e667e1"},
		{"translategemma-4b.gguf", "cevirmen",
			"https://huggingface.co/mradermacher/translategemma-4b-it-GGUF/resolve/main/translategemma-4b-it.Q4_K_M.gguf",
			2489909760, "81200d03e843d2ec1ece6eeafe7d13cb6e5211e1fcd336ade55790b683a08330"},
	}
	modelKilit     sync.Mutex
	modelIniyor    bool
	modelSurecleri = map[string]*exec.Cmd{} // ne → süreç (aynı model iki kez açılmasın)
)

func modelYolu(m modelKaydi) string { return filepath.Join(kok, "model", m.Dosya) }

// boyut tutuyorsa var sayılır (sağlama inerken denetlendi; her açılışta 5 GB okumak yavaş bellekte dakikalar alır)
func modelVar(m modelKaydi) bool {
	b, err := os.Stat(modelYolu(m))
	return err == nil && b.Size() == m.Boyut
}

func eksikModeller() []modelKaydi {
	var e []modelKaydi
	for _, m := range modeller {
		if !modelVar(m) {
			e = append(e, m)
		}
	}
	return e
}

// GET /api/modeller → durum · POST /api/modeller {"kabul": true} → eksikleri sırayla indirir
func apiModeller(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var istek struct {
			Kabul bool `json:"kabul"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&istek)
		if !istek.Kabul {
			hata(w, 400, "Gemma kullanım koşulları kabul edilmeden modeller indirilmez")
			return
		}
		modelKilit.Lock()
		if modelIniyor {
			modelKilit.Unlock()
			hata(w, 409, "modeller zaten iniyor")
			return
		}
		modelIniyor = true
		modelKilit.Unlock()
		go func() {
			modelleriIndir(context.Background())
			modelKilit.Lock()
			modelIniyor = false
			modelKilit.Unlock()
		}()
	}
	type satir struct {
		Dosya string  `json:"dosya"`
		Ne    string  `json:"ne"`
		Boyut int64   `json:"boyut"`
		Var   bool    `json:"var"`
		Inen  int64   `json:"inen"`
		Durum string  `json:"durum,omitempty"`
		Hata  string  `json:"hata,omitempty"`
		Hiz   float64 `json:"hiz"`
	}
	liste := []satir{}
	var eksik int64
	for _, m := range modeller {
		s := satir{Dosya: m.Dosya, Ne: m.Ne, Boyut: m.Boyut, Var: modelVar(m)}
		if !s.Var {
			eksik += m.Boyut
		}
		indirmeKilit.Lock()
		i := indirmeler[m.Dosya]
		indirmeKilit.Unlock()
		if i != nil {
			i.kilit.Lock()
			s.Inen, s.Durum, s.Hata, s.Hiz = i.Inen, i.Durum, i.Hata, i.Hiz
			i.kilit.Unlock()
		}
		liste = append(liste, s)
	}
	modelKilit.Lock()
	iniyor := modelIniyor
	modelKilit.Unlock()
	jsonYaz(w, 200, map[string]any{"modeller": liste, "eksikBoyut": eksik, "iniyor": iniyor, "kosullar": gemmaKosullari})
}

// modelleriIndir: eksikleri sırayla (yavaş bellekte aynı anda yazmak hepsini yavaşlatır); biri durursa ya da
// tutmazsa sonrakiler beklemez, kullanıcı yeniden "İndir" der ve kaldığı yerden sürer.
func modelleriIndir(ctx context.Context) {
	if err := os.MkdirAll(filepath.Join(kok, "model"), 0o755); err != nil {
		log.Printf("model klasörü açılamadı: %v", err)
		return
	}
	for _, m := range eksikModeller() {
		if !modelIndir(ctx, m) {
			return
		}
	}
	// hepsi yerinde: başlatıcının açmadıklarını aç (başlatıcı modellerden biri eksikse ikisini de açmaz)
	if modelAcilsin {
		for _, m := range modeller {
			if m.Ne != "cevirmen" && modelVar(m) {
				if err := modelSunucusuAc(m); err != nil {
					log.Printf("model açılamadı %s: %v", m.Dosya, err)
				}
			}
		}
	}
}

func modelIndir(ctx context.Context, m modelKaydi) bool {
	hedef := modelYolu(m)
	parca := hedef + ".part"
	ctx, iptal := context.WithCancel(ctx)
	defer iptal()
	i := &indirme{Ad: m.Dosya, Durum: "hazirlaniyor", iptal: iptal, parcaYolu: parca}
	indirmeKilit.Lock()
	indirmeler[m.Dosya] = i
	indirmeKilit.Unlock()
	fail := func(s string) bool {
		i.yaz(func(i *indirme) { i.Durum, i.Hata, i.Hiz = "hata", s, 0 })
		log.Printf("model indirme hatası %s: %s", m.Dosya, s)
		return false
	}
	var once int64
	if b, err := os.Stat(parca); err == nil {
		once = b.Size()
	}
	if d, err := diskDurumu(filepath.Dir(hedef)); err == nil {
		if m.Boyut >= 4<<30 && !d.buyukDosya {
			return fail(fmt.Sprintf("Bellek %s biçiminde: 4 GB'tan büyük dosya alamaz.", d.dosyaSistemi))
		}
		if uint64(m.Boyut-once)+(200<<20) > d.bos {
			return fail(fmt.Sprintf("Yer yetmiyor: %s gerekli, %s boş.", insanca(m.Boyut-once), insanca(int64(d.bos))))
		}
	}
	i.yaz(func(i *indirme) { i.Boyut, i.Inen, i.Durum = m.Boyut, once, "iniyor" })
	var sonHata error
	for deneme := 0; deneme < 3 && ctx.Err() == nil; deneme++ {
		if sonHata = parcaIndir(ctx, m.Adres, parca, m.Boyut, i); sonHata == nil {
			break
		}
		log.Printf("model indirmesi kesildi (%s): %v", m.Dosya, sonHata)
		select {
		case <-ctx.Done():
		case <-time.After(3 * time.Second):
		}
	}
	if ctx.Err() != nil {
		i.kilit.Lock()
		sil := i.sil
		i.kilit.Unlock()
		if sil {
			os.Remove(parca)
			i.yaz(func(i *indirme) { i.Inen = 0 })
		}
		i.yaz(func(i *indirme) { i.Durum, i.Hiz = "durdu", 0 })
		return false
	}
	if sonHata != nil {
		return fail("indirme tamamlanamadı: " + sonHata.Error())
	}
	i.yaz(func(i *indirme) { i.Durum, i.Hiz = "dogrulaniyor", 0 })
	if h, err := dosyaImzasi(parca); err != nil || h != m.Imza {
		os.Remove(parca)
		return fail("dosyanın imzası tutmadı; bozuk dosya silindi, yeniden indirilmeli")
	}
	if err := os.Rename(parca, hedef); err != nil {
		return fail("dosya yerine konamadı: " + err.Error())
	}
	i.yaz(func(i *indirme) { i.Durum, i.Inen = "bitti", i.Boyut })
	log.Printf("model indi ve doğrulandı: %s", m.Dosya)
	if modelAcilsin && m.Ne != "cevirmen" {
		if err := modelSunucusuAc(m); err != nil {
			log.Printf("model açılamadı %s: %v", m.Dosya, err)
		}
	}
	return true
}

func saglikli(port int) bool {
	c := http.Client{Timeout: 2 * time.Second}
	y, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
	if err != nil {
		return false
	}
	y.Body.Close()
	return y.StatusCode == http.StatusOK
}

// modelSunucusuAc: başlatıcının açtığı gibi (aynı kapı, aynı ayar); kapı zaten cevap veriyorsa dokunmaz
func modelSunucusuAc(m modelKaydi) error {
	var port int
	var ek []string
	switch m.Ne {
	case "anlam":
		port, ek = gommePortu, []string{"--embedding", "-c", "8192", "-b", "2048", "-ub", "2048"}
	case "sohbet":
		port, ek = sohbetPortu, []string{"-np", "1", "-c", "8192"}
	default:
		return errors.New("bu model gerekince açılır")
	}
	if port == 0 || saglikli(port) {
		return nil
	}
	modelKilit.Lock()
	if c := modelSurecleri[m.Ne]; c != nil && c.ProcessState == nil {
		modelKilit.Unlock()
		return nil // açılıyor
	}
	modelKilit.Unlock()
	llama := filepath.Join(kok, "program", "llamafile.exe")
	arg := append([]string{"--server", "--host", "127.0.0.1", "--port", fmt.Sprint(port), "--no-webui", "-m", modelYolu(m)}, ek...)
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command(llama, arg...)
	} else {
		cmd = exec.Command("/bin/sh", append([]string{llama}, arg...)...)
	}
	gizle(cmd)
	if gunluk, err := os.Create(filepath.Join(os.TempDir(), "heybe_"+m.Ne+"_kurulum.log")); err == nil {
		cmd.Stdout, cmd.Stderr = gunluk, gunluk
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	modelKilit.Lock()
	modelSurecleri[m.Ne] = cmd
	modelKilit.Unlock()
	go func() { _ = cmd.Wait() }()
	log.Printf("model açılıyor: %s (kapı %d)", m.Dosya, port)
	return nil
}

func modelSurecleriniKapat() {
	modelKilit.Lock()
	defer modelKilit.Unlock()
	for _, c := range modelSurecleri {
		if c.Process != nil && c.ProcessState == nil {
			_ = c.Process.Kill()
		}
	}
}

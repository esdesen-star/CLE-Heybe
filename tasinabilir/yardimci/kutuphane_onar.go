package main

// Kütüphane onarımı (17.11.2026, Özet §191). Kütüphane sunucusunu (kiwix-serve) başlatıcı bir kez açar; düşerse
// (§190: eşzamanlı aramada "Unhandled unknown error") kimse yeniden açmıyordu ve Heybe her soruya sessizce "kaynaklarımda
// yok" diyordu. Ercan'ın kuralı (önle → o anda çöz → dokunma → bildir): sayfa bir kütüphane isteği arızalanınca
// POST /api/kutuphane-onar ile ister; yardımcı kütüphane gerçekten yanıt vermiyorsa onu başlatıcının satırıyla
// (kutuphaneArgumanlari — başlatıcılarla aynı olduğunu test denetler) yeniden açar. Yanıt veriyorsa dokunmaz.
// Bir oturumda en çok enCokOnarim kez dener (sürekli düşüyorsa döngüye girmez); açılıştaki ilk açılış başlatıcınındır.
// Yardımcı kapanırken yeniden açtığı kütüphaneyi de kapatır.

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

const enCokOnarim = 3

var (
	kiwixServe string // kiwix-serve'ün yolu (main: belleğin program/<işletim> klasörü ya da -program)
	kiwixPortu = 8889
	baslangic  = time.Now()
	acilisPayi = 20 * time.Second // başlatıcı kütüphaneyi yardımcıdan hemen sonra açar; bu sürede onarım yok
)

var onarim struct {
	sync.Mutex
	cmd  *exec.Cmd
	sayi int
}

// başlatıcıların satırı (Heybe_Mac.command, Heybe_Linux.sh, Heybe_Windows.bat) — kutuphane_onar_test.go eşitliği denetler
func kutuphaneArgumanlari() []string {
	return []string{"--port", fmt.Sprint(kiwixPortu), "--address", "127.0.0.1", "--monitorLibrary", "--skipInvalid",
		"--urlRootLocation", "/kiwix", "--library", kutuphaneXML}
}

func kiwixServeYolu(programDir string) string {
	ad := "kiwix-serve"
	if runtime.GOOS == "windows" {
		ad += ".exe"
	}
	if programDir != "" {
		return filepath.Join(programDir, ad)
	}
	return filepath.Join(kok, "program", programKlasoru(), ad)
}

func kutuphaneHazir() bool {
	c := http.Client{Timeout: 3 * time.Second}
	y, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/kiwix/catalog/v2/entries?count=1", kiwixPortu))
	if err != nil {
		return false
	}
	defer y.Body.Close()
	return y.StatusCode == http.StatusOK
}

// kutuphaneOnar: "hazir" (yanıt veriyor, dokunulmadı) · "aciliyor" (yeniden açıldı ya da açılıyor) · "acilamadi" ·
// "sinir" (bu oturumda enCokOnarim kez denendi) · "erken" (açılış payı dolmadı, ilk açılış başlatıcının)
func kutuphaneOnar() string {
	onarim.Lock()
	defer onarim.Unlock()
	if kutuphaneHazir() {
		return "hazir"
	}
	if time.Since(baslangic) < acilisPayi {
		return "erken"
	}
	if onarim.cmd != nil && onarim.cmd.ProcessState == nil {
		return "aciliyor" // yeniden açılan süreç hâlâ ayakta: açılmasını bekle, ikinciyi açma
	}
	if onarim.sayi >= enCokOnarim {
		return "sinir"
	}
	onarim.sayi++
	cmd := exec.Command(kiwixServe, kutuphaneArgumanlari()...)
	gizle(cmd)
	gunluk, err := os.OpenFile(filepath.Join(os.TempDir(), "heybe_kutuphane_onarim.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err == nil {
		cmd.Stdout, cmd.Stderr = gunluk, gunluk
	}
	if err := cmd.Start(); err != nil {
		log.Printf("kütüphane yanıt vermiyordu; yeniden açılamadı (%d/%d): %v", onarim.sayi, enCokOnarim, err)
		if gunluk != nil {
			gunluk.Close()
		}
		return "acilamadi"
	}
	onarim.cmd = cmd
	log.Printf("kütüphane yanıt vermiyordu; yeniden açılıyor (%d/%d)", onarim.sayi, enCokOnarim)
	go func() {
		err := cmd.Wait()
		log.Printf("yeniden açılan kütüphane kapandı: %v", err)
		if gunluk != nil {
			gunluk.Close()
		}
	}()
	return "aciliyor"
}

// yardımcı kapanırken yeniden açtığı kütüphaneyi de kapatır (yetim süreç kalmasın)
func kutuphaneKapat() {
	onarim.Lock()
	defer onarim.Unlock()
	if onarim.cmd != nil && onarim.cmd.Process != nil && onarim.cmd.ProcessState == nil {
		_ = onarim.cmd.Process.Kill()
	}
}

// GET /api/kutuphane-onar → {"durum": "hazir"|"kapali", "sayi": n} · POST → onarmayı dener (yukarıdaki durumlar)
func apiKutuphaneOnar(w http.ResponseWriter, r *http.Request) {
	d := ""
	if r.Method == http.MethodPost {
		d = kutuphaneOnar()
	} else if kutuphaneHazir() {
		d = "hazir"
	} else {
		d = "kapali"
	}
	onarim.Lock()
	n := onarim.sayi
	onarim.Unlock()
	jsonYaz(w, 200, map[string]any{"durum": d, "sayi": n})
}

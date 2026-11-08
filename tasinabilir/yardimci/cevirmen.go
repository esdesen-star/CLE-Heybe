package main

// Çevirmen gerekince açılır (06.11.2026 — Ercan: "kullanıcı hangi diller yüklensin seçer", Özet §36).
// Başlatıcı çevirmeni açmaz; sayfa "başka dillerdeki kaynaklara da bak" seçiliyse POST /api/cevirmen ile ister,
// yardımcı program llamafile'ı arkada açar. Yavaş bellekte açılış ~90 sn kısalır; çevirmen sonradan katılır.
// Yardımcı kapanınca (başlatıcının kill'i, Ctrl-C) çevirmen de kapatılır.

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"
)

var cevirmen struct {
	sync.Mutex
	cmd  *exec.Cmd
	port int
	bas  time.Time
}

func cevirmenModeli() string { return filepath.Join(kok, "model", "translategemma-4b.gguf") }

func cevirmenHazir() bool {
	c := http.Client{Timeout: 2 * time.Second}
	y, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/health", cevirmen.port))
	if err != nil {
		return false
	}
	defer y.Body.Close()
	return y.StatusCode == http.StatusOK
}

// cevirmenDurumu: "yok" (model dosyası yok) · "kapali" · "aciliyor" · "hazir"
func cevirmenDurumu() string {
	if _, err := os.Stat(cevirmenModeli()); err != nil {
		return "yok"
	}
	if cevirmenHazir() {
		return "hazir"
	}
	cevirmen.Lock()
	defer cevirmen.Unlock()
	if cevirmen.cmd != nil && cevirmen.cmd.ProcessState == nil {
		return "aciliyor"
	}
	return "kapali"
}

func cevirmenAc() error {
	cevirmen.Lock()
	defer cevirmen.Unlock()
	if cevirmen.cmd != nil && cevirmen.cmd.ProcessState == nil {
		return nil // zaten açılıyor ya da açık
	}
	llama := filepath.Join(kok, "program", "llamafile.exe")
	arg := []string{"--server", "--host", "127.0.0.1", "--port", fmt.Sprint(cevirmen.port), "--no-webui", "--no-jinja",
		"-np", "1", "-m", cevirmenModeli(), "-c", "4096"}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command(llama, arg...)
	} else {
		// llamafile bir APE dosyası: Mac ve Linux'ta kabuk üzerinden çalışır (başlatıcıda da öyle)
		cmd = exec.Command("/bin/sh", append([]string{llama}, arg...)...)
	}
	gizle(cmd)
	gunluk, err := os.Create(filepath.Join(os.TempDir(), "heybe_cevirmen.log"))
	if err == nil {
		cmd.Stdout, cmd.Stderr = gunluk, gunluk
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	cevirmen.cmd, cevirmen.bas = cmd, time.Now()
	log.Printf("çevirmen açılıyor (%s)", cevirmenModeli())
	go func() {
		err := cmd.Wait()
		log.Printf("çevirmen kapandı: %v", err)
		if gunluk != nil {
			gunluk.Close()
		}
	}()
	return nil
}

func cevirmenKapat() {
	cevirmen.Lock()
	defer cevirmen.Unlock()
	if cevirmen.cmd != nil && cevirmen.cmd.Process != nil && cevirmen.cmd.ProcessState == nil {
		_ = cevirmen.cmd.Process.Kill()
	}
}

// yardımcı kapanırken çevirmeni de kapat (yetim süreç kalmasın)
func kapanistaCevirmeniKapat() {
	s := make(chan os.Signal, 1)
	signal.Notify(s, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-s
		cevirmenKapat()
		os.Exit(0)
	}()
}

// GET /api/cevirmen → {"durum": …} · POST /api/cevirmen {"ac": true} → açar
func apiCevirmen(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if cevirmenDurumu() == "yok" {
			jsonYaz(w, 404, map[string]string{"durum": "yok"})
			return
		}
		if err := cevirmenAc(); err != nil {
			jsonYaz(w, 500, map[string]string{"hata": err.Error()})
			return
		}
	}
	jsonYaz(w, 200, map[string]string{"durum": cevirmenDurumu()})
}

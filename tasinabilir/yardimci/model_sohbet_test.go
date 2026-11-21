package main

// §245 (21.11): sohbet modeli Gemma 4 E4B; eski Gemma 3 4B dosyası olan kurulum onunla açılır. Dosyalar seyrek (boyutu
// tutan ama yer kaplamayan) sahte dosyalarla kurulur.
import (
	"os"
	"path/filepath"
	"testing"
)

func sahteModel(t *testing.T, m modelKaydi) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(kok, "model"), 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(modelYolu(m))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(m.Boyut); err != nil {
		t.Fatal(err)
	}
	f.Close()
}

func TestSohbetModeliSecimi(t *testing.T) {
	eski := kok
	kok = t.TempDir()
	defer func() { kok = eski }()
	var yeni modelKaydi
	for _, m := range modeller {
		if m.Ne == "sohbet" {
			yeni = m
		}
	}
	if yeni.Dosya != "gemma-4-E4B-it-Q4_0.gguf" {
		t.Fatalf("listedeki sohbet modeli Gemma 4 E4B değil: %q", yeni.Dosya)
	}
	if _, ok := acilacakSohbet(yeni); ok || modelVar(yeni) {
		t.Fatal("hiç dosya yokken sohbet modeli var sayıldı")
	}
	sahteModel(t, eskiSohbet)
	if m, ok := acilacakSohbet(yeni); !ok || m.Dosya != eskiSohbet.Dosya {
		t.Fatalf("yalnız eski Gemma 3 varken açılacak dosya yanlış: %q %v", m.Dosya, ok)
	}
	if !buyukDosyaAlamaz() && modelVar(yeni) {
		t.Fatal("büyük dosya alan bellekte yeni model eksikken var sayıldı (kurulum kutusu indirmeyi önermeli)")
	}
	sahteModel(t, yeni)
	if m, ok := acilacakSohbet(yeni); !ok || m.Dosya != yeni.Dosya {
		t.Fatalf("iki dosya varken yeni model seçilmedi: %q", m.Dosya)
	}
	if !modelVar(yeni) {
		t.Fatal("yeni model yerindeyken eksik sayıldı")
	}
	// yarım inen dosya (boyut tutmuyor) yok sayılır, eski açılır
	if err := os.Truncate(modelYolu(yeni), yeni.Boyut-1); err != nil {
		t.Fatal(err)
	}
	if m, _ := acilacakSohbet(yeni); m.Dosya != eskiSohbet.Dosya {
		t.Fatal("boyutu tutmayan yeni dosya açılacaktı")
	}
}

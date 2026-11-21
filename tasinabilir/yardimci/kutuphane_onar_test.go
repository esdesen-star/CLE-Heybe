package main

// §191 kütüphane onarımı: yeniden açma satırı başlatıcılarınkiyle birebir aynı (sahte düzenek dersi: "--urlRootLocation"
// eksik kalınca sayfa "bilgi yok" demişti); yanıt veren kütüphaneye dokunulmaz; açılış payında dokunulmaz; oturum sınırı;
// yeniden açılan süreç ayaktayken ikincisi açılmaz.

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// başlatıcıdaki kiwix-serve çağrısının argümanları (--library'nin değeri yola bağlı, karşılaştırılmaz)
func baslaticiArgumanlari(t *testing.T, dosya, isaret string) []string {
	t.Helper()
	b, err := os.ReadFile("../usb_kok/" + dosya)
	if err != nil {
		t.Fatal(err)
	}
	s := strings.ReplaceAll(strings.ReplaceAll(string(b), "\r\n", "\n"), "\\\n", " ")
	i := strings.Index(s, isaret)
	if i < 0 {
		t.Fatalf("%s: %q bulunamadı", dosya, isaret)
	}
	satir := s[i+len(isaret):]
	satir = satir[:strings.Index(satir, "\n")]
	var arg []string
	for _, a := range strings.Fields(satir) {
		if strings.HasPrefix(a, ">") || a == "&" {
			break
		}
		arg = append(arg, strings.Trim(a, `"`))
	}
	return arg
}

func libraryDegerisiz(a []string) []string {
	var c []string
	for i := 0; i < len(a); i++ {
		c = append(c, a[i])
		if a[i] == "--library" && i+1 < len(a) {
			c = append(c, "<yol>")
			i++
		}
	}
	return c
}

func TestKutuphaneSatiriBaslaticilarlaAyni(t *testing.T) {
	kiwixPortu, kutuphaneXML = 8889, "/x/kutuphane.xml"
	bizim := strings.Join(libraryDegerisiz(kutuphaneArgumanlari()), " ")
	for _, d := range [][2]string{{"Heybe_Mac.command", `/kiwix-serve"`}, {"Heybe_Linux.sh", `/kiwix-serve"`}, {"Heybe_Windows.bat", `\kiwix-serve.exe"`}} {
		if b := strings.Join(libraryDegerisiz(baslaticiArgumanlari(t, d[0], d[1])), " "); b != bizim {
			t.Errorf("%s başlatıcı satırı ile onarım satırı farklı:\n  başlatıcı: %s\n  onarım:    %s", d[0], b, bizim)
		}
	}
}

func bosPort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	p := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return p
}

func onarimSifirla(port int, eski bool) {
	onarim.Lock()
	onarim.cmd, onarim.sayi = nil, 0
	onarim.Unlock()
	kiwixPortu, baslangic = port, time.Now()
	if eski {
		baslangic = time.Now().Add(-time.Hour)
	}
}

func TestKutuphaneOnarYanitVerenaDokunmaz(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer s.Close()
	u, _ := url.Parse(s.URL)
	p, _ := strconv.Atoi(u.Port())
	onarimSifirla(p, true)
	kiwixServe = "/olmayan/kiwix-serve"
	if d := kutuphaneOnar(); d != "hazir" || onarim.sayi != 0 {
		t.Errorf("yanıt veren kütüphane: %q, deneme %d (beklenen hazir, 0)", d, onarim.sayi)
	}
}

func TestKutuphaneOnarAcilistaDokunmaz(t *testing.T) {
	onarimSifirla(bosPort(t), false)
	kiwixServe = "/olmayan/kiwix-serve"
	if d := kutuphaneOnar(); d != "erken" || onarim.sayi != 0 {
		t.Errorf("açılış payında: %q, deneme %d (beklenen erken, 0)", d, onarim.sayi)
	}
}

func TestKutuphaneOnarSiniri(t *testing.T) {
	onarimSifirla(bosPort(t), true)
	kiwixServe = "/olmayan/kiwix-serve"
	for i := 1; i <= enCokOnarim; i++ {
		if d := kutuphaneOnar(); d != "acilamadi" {
			t.Fatalf("%d. deneme: %q (beklenen acilamadi)", i, d)
		}
	}
	if d := kutuphaneOnar(); d != "sinir" || onarim.sayi != enCokOnarim {
		t.Errorf("sınırdan sonra: %q, deneme %d (beklenen sinir, %d)", d, onarim.sayi, enCokOnarim)
	}
}

// yeniden açılan süreç ayaktayken ikinci istek ikinci süreci açmaz (sahte kiwix: bu test programı, bir süre bekler)
func TestKutuphaneOnarIkinciyiAcmaz(t *testing.T) {
	onarimSifirla(bosPort(t), true)
	kiwixServe = os.Args[0]
	t.Setenv("HEYBE_SAHTE_KIWIX", "1")
	if d := kutuphaneOnar(); d != "aciliyor" {
		t.Fatalf("ilk istek: %q (beklenen aciliyor)", d)
	}
	defer kutuphaneKapat()
	if d := kutuphaneOnar(); d != "aciliyor" || onarim.sayi != 1 {
		t.Errorf("süreç ayaktayken: %q, deneme %d (beklenen aciliyor, 1)", d, onarim.sayi)
	}
}

func TestMain(m *testing.M) {
	if os.Getenv("HEYBE_SAHTE_KIWIX") == "1" { // sahte kütüphane süreci: argümanları yok sayar, bekler
		time.Sleep(5 * time.Second)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

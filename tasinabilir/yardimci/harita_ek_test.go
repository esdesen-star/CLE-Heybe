package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Kurum listesi okuyucusu (09.11, §77). İlk örnek İzmir Büyükşehir'in açık verisinin biçimi:
// UTF-8 + BOM, noktalı virgül, büyük harf, tür sütunu yok, tür adın içinde.
func TestEkCsvIzmirBicimi(t *testing.T) {
	b := []byte("\xef\xbb\xbfILCE;KAPINO;ENLEM;ACIKLAMA;ILCEID;MAHALLE;MAHALLEID;ADI;BOYLAM;YOL\n" +
		"ÇEŞME;;38.359739740429;3509-024-01;1001;ÜNİVERSİTE;;1 NO LU AFET VE ACİL DURUM TOPLANMA ALANI;26.30963585461;4261/1 Sk.\n" +
		"MENEMEN;;38.700592487468;3522-033-01;17;HATUNDERE;;1 NO LU AFET VE ACİL DURUM TOPLANMA ALANI;27.043789744744;6107 Sk.\n" +
		";;;;;;;;;\n")
	n, oz, err := ekOku("izbb-afet-ve-acil-durum-toplanma-alanlari.csv", b, nil)
	if err != nil || len(n) != 2 {
		t.Fatalf("2 nokta bekleniyordu: %v %+v", err, oz)
	}
	if n[0].Tur != "toplanma" || n[0].Ad != "1 No Lu Afet ve Acil Durum Toplanma Alanı" || n[0].Baglam != "4261/1 Sk., Üniversite, Çeşme" {
		t.Fatalf("ilk nokta yanlış okundu: %+v", n[0])
	}
	if n[0].Lat != 383597397 || n[0].Lon != 263096359 {
		t.Fatalf("koordinat: %d %d", n[0].Lat, n[0].Lon)
	}
	for g, b := range map[string]string{"HALİL RIFATPAŞA Cd.": "Halil Rıfatpaşa Cd.", "SGK Hastanesi": "SGK Hastanesi", "4261/1 Sk.": "4261/1 Sk."} {
		if a := buyukHarfDuzelt(g, true); a != b {
			t.Errorf("buyukHarfDuzelt(%q) = %q, %q olmalı", g, a, b)
		}
	}
	if n[1].Baglam != "6107 Sk., Hatundere, Menemen" {
		t.Fatalf("Türkçe harfsiz büyük harf: %q", n[1].Baglam)
	}
}

func TestEkCsvEskiExcelVeTurSutunu(t *testing.T) {
	// Windows-1254, virgüllü ondalık, Türkçe sütun adları, tür sütunu
	metin := "Tür;Adı;Enlem;Boylam;İlçe\n" +
		"Çadır Kent;Kırıkhan Çadırkenti;36,4990;36,3570;KIRIKHAN\n" +
		"İçme Suyu;Su Tankeri 3;36,2100;36,1600;ANTAKYA\n" +
		"Otopark;Büyük Otopark;36,2000;36,1500;ANTAKYA\n"
	var b []byte
	for _, r := range metin {
		if r < 0x80 {
			b = append(b, byte(r))
			continue
		}
		bulundu := false
		for i, c := range cp1254 {
			if c == r {
				b = append(b, byte(0x80+i))
				bulundu = true
				break
			}
		}
		if !bulundu {
			t.Fatalf("cp1254'te yok: %q", r)
		}
	}
	n, oz, err := ekOku("hatay_listesi.csv", b, nil)
	if err != nil || len(n) != 3 {
		t.Fatalf("3 nokta: %v %+v", err, oz)
	}
	if n[0].Tur != "barinak" || n[0].Ad != "Kırıkhan Çadırkenti" || n[0].Baglam != "Kırıkhan" || n[0].Lat != 364990000 {
		t.Fatalf("çadır kent: %+v", n[0])
	}
	if n[1].Tur != "su" {
		t.Fatalf("içme suyu: %+v", n[1])
	}
	if n[2].Tur != "diger" {
		t.Fatalf("tanınmayan tür 'diğer' olmalı: %+v", n[2])
	}
	if !strings.Contains(strings.Join(oz.Uyarilar, "|"), "taninmayan-tur:Otopark") {
		t.Fatalf("tanınmayan tür uyarısı: %v", oz.Uyarilar)
	}
}

func TestEkKoordinatSorunlari(t *testing.T) {
	kutu := &ekKutu{35.8, 25.6, 42.2, 44.9} // Türkiye
	b := []byte("ad,lat,lon,type\nA,36.2,36.16,assembly point\nB,36.17,36.21,assembly point\n")
	b = append(b, []byte("C,abc,36.1,assembly point\n")...)
	n, oz, _ := ekOku("x.csv", b, kutu)
	if len(n) != 2 || !strings.Contains(strings.Join(oz.Uyarilar, "|"), "bozuk-koordinat:1") {
		t.Fatalf("bozuk satır sayılmalı: %+v", oz)
	}
	n, oz, _ = ekOku("x.csv", []byte("ad,enlem,boylam\nTers,36.16,36.2\nTers2,29.0,41.0\n"), kutu)
	if n[1].Lat != 410000000 || n[1].Lon != 290000000 || !strings.Contains(strings.Join(oz.Uyarilar, "|"), "enlem-boylam-takas:1") {
		t.Fatalf("yer değiştirmiş enlem/boylam düzeltilmeli: %+v %v", n, oz.Uyarilar)
	}
	if _, _, err := ekOku("utm.csv", []byte("ad;Y;X\nA;4012345;512345\n"), kutu); err == nil || err.Error() != "derece-degil" {
		t.Fatalf("UTM gibi koordinat reddedilmeli: %v", err)
	}
	if _, _, err := ekOku("sayim.csv", []byte("MAHALLE;ALAN_M2\nCaferağa;12000\n"), kutu); err == nil || err.Error() != "enlem-boylam-yok" {
		t.Fatalf("koordinatsız tablo: %v", err)
	}
}

func TestEkDosyaAdindanTur(t *testing.T) {
	n, _, err := ekOku("su_dagitim_noktalari.csv", []byte("isim,enlem,boylam\nMeydan,36.2,36.16\n"), nil)
	if err != nil || n[0].Tur != "su" {
		t.Fatalf("dosya adından tür (su): %v %+v", err, n)
	}
	n, oz, _ := ekOku("liste.csv", []byte("isim,enlem,boylam\nMeydan,36.2,36.16\n"), nil)
	if n[0].Tur != "diger" || !strings.Contains(strings.Join(oz.Uyarilar, "|"), "tur-yok:1") {
		t.Fatalf("türü belli olmayan 'diğer' ve uyarı: %+v %v", n, oz.Uyarilar)
	}
}

func zipYap(t *testing.T, dosyalar map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for ad, icerik := range dosyalar {
		w, _ := z.Create(ad)
		w.Write([]byte(icerik))
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestEkExcel(t *testing.T) {
	// Excel'in kendi kaydettiği biçim: ortak metinler (sharedStrings), üstte bir başlık yazısı, sayılar <v>.
	b := zipYap(t, map[string]string{
		"xl/sharedStrings.xml": `<sst><si><t>Hatay Toplanma Alanları</t></si><si><t>Adı</t></si><si><t>Enlem</t></si><si><t>Boylam</t></si>` +
			`<si><r><t>Atatürk </t></r><r><t>Parkı</t></r></si><si><t>Mahalle</t></si><si><t>Ulucami</t></si></sst>`,
		"xl/worksheets/sheet1.xml": `<worksheet><sheetData>` +
			`<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
			`<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c><c r="D3" t="s"><v>5</v></c></row>` +
			`<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><v>36.2026</v></c><c r="C4"><v>36.1600</v></c><c r="D4" t="s"><v>6</v></c></row>` +
			`</sheetData></worksheet>`,
	})
	n, oz, err := ekOku("Hatay toplanma alanları.xlsx", b, nil)
	if err != nil || len(n) != 1 {
		t.Fatalf("Excel: %v %+v", err, oz)
	}
	if n[0].Ad != "Atatürk Parkı" || n[0].Tur != "toplanma" || n[0].Baglam != "Ulucami" || n[0].Lat != 362026000 {
		t.Fatalf("Excel noktası: %+v", n[0])
	}
}

func TestEkGeoJSONveKML(t *testing.T) {
	g := `{"type":"FeatureCollection","features":[
	 {"type":"Feature","geometry":{"type":"Point","coordinates":[36.16,36.2]},"properties":{"name":"Park","emergency":"assembly_point"}},
	 {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[36.0,36.0],[36.2,36.0],[36.2,36.2],[36.0,36.2]]]},"properties":{"ad":"Çadırkent","tur":"barınma"}}]}`
	n, _, err := ekOku("noktalar.geojson", []byte(g), nil)
	if err != nil || len(n) != 2 || n[0].Tur != "toplanma" || n[1].Tur != "barinak" || n[1].Lat != 361000000 {
		t.Fatalf("GeoJSON: %v %+v", err, n)
	}
	kml := `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
	 <Placemark><name>Dağıtım Noktası 1</name><Point><coordinates>36.16,36.2,0</coordinates></Point></Placemark>
	 <Placemark><name>Okul Bahçesi</name><ExtendedData><Data name="Tür"><value>Toplanma Alanı</value></Data></ExtendedData>
	   <Polygon><outerBoundaryIs><LinearRing><coordinates>36.0,36.0 36.2,36.0 36.2,36.2 36.0,36.2</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
	</Document></kml>`
	n, _, err = ekOku("liste.kml", []byte(kml), nil)
	if err != nil || len(n) != 2 || n[0].Tur != "dagitim" || n[0].Lon != 361600000 || n[1].Tur != "toplanma" || n[1].Ad != "Okul Bahçesi" {
		t.Fatalf("KML: %v %+v", err, n)
	}
	n, _, err = ekOku("liste.kmz", zipYap(t, map[string]string{"doc.kml": kml}), nil)
	if err != nil || len(n) != 2 {
		t.Fatalf("KMZ: %v %+v", err, n)
	}
}

func TestEkKapilariVeEnYakin(t *testing.T) {
	on, _ := sahteHarita(t)
	eski := kok
	kok = filepath.Dir(filepath.Dir(on))
	t.Cleanup(func() { kok = eski })
	// Sahte haritada OSM toplanma alanı 73 m ötede. Kurum 30 m'ye bir tane daha ekliyor.
	csvB := []byte("ad,enlem,boylam,tür\nOkul Bahçesi,40.0002,29.0002,toplanma alanı\n")
	w := httptest.NewRecorder()
	apiHaritaEk(w, httptest.NewRequest("POST", "/api/harita-ek?ad=AFAD_deneme.csv", bytes.NewReader(csvB)))
	if w.Code != 200 {
		t.Fatalf("yükleme: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	apiHaritaEk(w, httptest.NewRequest("POST", "/api/harita-ek?ad=../kacak.csv", bytes.NewReader(csvB)))
	if _, err := os.Stat(filepath.Join(kok, "harita", "kacak.csv")); err == nil {
		t.Fatal("klasör dışına yazılmamalı")
	}
	w = httptest.NewRecorder()
	apiHaritaEk(w, httptest.NewRequest("POST", "/api/harita-ek?ad=bos.csv", strings.NewReader("a,b\n1,2\n")))
	if w.Code != 422 {
		t.Fatalf("koordinatsız dosya kaydedilmemeli: %d", w.Code)
	}
	w = httptest.NewRecorder()
	apiYer(w, httptest.NewRequest("GET", "/api/yer?tur=toplanma&konum=40.0,29.0", nil))
	var y []yerSonuc
	json.Unmarshal(w.Body.Bytes(), &y)
	if len(y) != 2 || y[0].Ad != "Okul Bahçesi" || y[0].Liste != "AFAD deneme" || y[1].Liste != "" {
		t.Fatalf("kurum noktası en yakın olarak, liste adıyla gelmeli: %+v", y)
	}
	w = httptest.NewRecorder()
	apiYer(w, httptest.NewRequest("GET", "/api/yer?q=okul+bahcesi", nil))
	if !strings.Contains(w.Body.String(), "Okul Bahçesi") {
		t.Fatalf("ad aramasında kurum noktası: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	apiHaritaEkGeo(w, httptest.NewRequest("GET", "/api/harita-ek-geo", nil))
	if !strings.Contains(w.Body.String(), `"coordinates":[29.0002,40.0002]`) {
		t.Fatalf("haritada gösterilecek nokta: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	apiHaritaEkSil(w, httptest.NewRequest("POST", "/api/harita-ek-sil", strings.NewReader(`{"dosya":"AFAD_deneme.csv"}`)))
	if w.Code != 200 {
		t.Fatalf("kaldırma: %d %s", w.Code, w.Body.String())
	}
	if n, _ := ekNoktalar(); len(n) != 0 {
		t.Fatalf("kaldırılan liste bellekte kalmamalı: %+v", n)
	}
	w = httptest.NewRecorder()
	apiHaritaEkSil(w, httptest.NewRequest("POST", "/api/harita-ek-sil", strings.NewReader(`{"dosya":"../deneme.rota"}`)))
	if w.Code != 400 {
		t.Fatalf("klasör dışı silme reddedilmeli: %d", w.Code)
	}
}

func TestEkBaglantidanVeBenimNoktam(t *testing.T) {
	on, _ := sahteHarita(t)
	eski := kok
	kok = filepath.Dir(filepath.Dir(on))
	t.Cleanup(func() { kok = eski })
	sunucu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/veri/toplanma":
			w.Header().Set("Content-Type", "text/csv")
			w.Write([]byte("ADI;ENLEM;BOYLAM\nPARK ALANI;40,0003;29,0001\n"))
		case "/api/liste":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"kayit_sayisi":250,"onemliyer":[{"ADI":"OKUL BAHÇESİ TOPLANMA ALANI","ENLEM":40.0004,"BOYLAM":29.0004}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer sunucu.Close()
	bag := func(adres string) (int, map[string]any) {
		w := httptest.NewRecorder()
		apiHaritaEkBag(w, httptest.NewRequest("POST", "/api/harita-ek-bag", strings.NewReader(`{"adres":"`+adres+`"}`)))
		var m map[string]any
		json.Unmarshal(w.Body.Bytes(), &m)
		return w.Code, m
	}
	if k, m := bag(sunucu.URL + "/veri/toplanma"); k != 200 || m["nokta"].(float64) != 1 || m["dosya"] != "toplanma.csv" {
		t.Fatalf("uzantısız bağlantıdan CSV: %d %v", k, m)
	}
	k, m := bag(sunucu.URL + "/api/liste")
	if k != 200 || !strings.Contains(fmt.Sprint(m["uyarilar"]), "sayfali:1/250") {
		t.Fatalf("sayfalı JSON adresi okunmalı ve uyarılmalı: %d %v", k, m)
	}
	if k, _ := bag("file:///etc/passwd"); k != 400 {
		t.Fatalf("http dışı adres reddedilmeli: %d", k)
	}
	if k, _ := bag(sunucu.URL + "/yok"); k != 502 {
		t.Fatalf("bulunamayan adres: %d", k)
	}
	nokta := func(govde string) int {
		w := httptest.NewRecorder()
		apiHaritaEkNokta(w, httptest.NewRequest("POST", "/api/harita-ek-nokta", strings.NewReader(govde)))
		return w.Code
	}
	if nokta(`{"tur":"toplanma","ad":"Bizim park, \"köşe\"","lat":40.0001,"lon":29.0001}`) != 200 || nokta(`{"tur":"su","ad":"Çeşme","lat":40.0002,"lon":29.0003}`) != 200 {
		t.Fatal("benim noktam kaydedilmedi")
	}
	if nokta(`{"tur":"su","ad":"x","lat":95,"lon":29}`) != 400 {
		t.Fatal("geçersiz enlem reddedilmeli")
	}
	y := ekYakin("toplanma", 40.0, 29.0, 5)
	if len(y) == 0 || y[0].Ad != `Bizim park, "köşe"` || y[0].Liste != "Benim noktalarım" {
		t.Fatalf("benim noktam en yakında, adıyla ve listesiyle: %+v", y)
	}
	if s := ekYakin("su", 40.0, 29.0, 5); len(s) != 1 || s[0].Ad != "Çeşme" {
		t.Fatalf("ikinci nokta aynı listeye eklenmeli: %+v", s)
	}
}

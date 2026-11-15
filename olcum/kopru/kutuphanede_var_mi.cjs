// Doğru cevap kütüphanede var mı? (14.11.2026, Özet §141 — Ercan: "bu soruların doğru cevapları kütüphanemizde var mı?")
// Kötü cevap verilmiş her soru için ARAMA SORGUSU = soru + sınav yazarının beklediği doğru cevap (en iyi durumdaki sorgu).
// Heybe'nin kendi araması (başlık önerisi + Kiwix dizini + anlam sıralaması; Türkçe ve İngilizce kitaplar, köprüyle) en iyi
// 10 paragrafı getirir; cevap yazılmaz. Paragrafların doğru bilgiyi taşıyıp taşımadığına ayrı bir ajan karar verir.
// Koşul: aramanın bulamaması kütüphanede olmadığı anlamına gelmez (yalnız bu aramanın bulamadığı).
// Kullanım: node olcum/kopru/kutuphanede_var_mi.cjs <kotu_cevaplar.json> <cikti.json>
const fs = require('fs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = 'http://127.0.0.1:18888'; H.AYAR.sohbet = 'http://127.0.0.1:18080';
H.AYAR.gomme = 'http://127.0.0.1:18081'; H.AYAR.cevirmen = 'http://127.0.0.1:18082';
const [girdi, cikti] = process.argv.slice(2);
const kc = JSON.parse(fs.readFileSync(girdi, 'utf8'));
(async () => {
  const sonuc = [];
  for (const k of kc) {
    const dil = /[çğıöşüÇĞİÖŞÜ]/.test(k.soru) ? 'tr' : 'en';
    let puanli = [];
    H.AYAR.aramaGozlem = (g) => { if (g.puanli && g.puanli.length > puanli.length) puanli = g.puanli; };
    const sorgu = `${k.soru}\n${k.beklenen}`;
    try {
      await H.sor(sorgu, () => {}, dil, { kaynakDilleri: dil === 'tr' ? ['tr', 'en'] : ['en', 'tr'], yalnizKaynak: true, cevap: 'cevirerek', acilBakildi: true });
    } catch (e) { process.stderr.write(`\n${k.kimlik} hata ${e.message}\n`); }
    const gorulen = new Set(), paragraflar = [];
    for (const [puan, p] of puanli) {
      const a = String(p.metin).slice(0, 200); if (gorulen.has(a)) continue; gorulen.add(a);
      paragraflar.push({ kitap: p.kitap, makale: p.ad, bolum: p.bolum || '', dil: p.dil || '', puan: Math.round(puan * 1000) / 1000, metin: String(p.metin).slice(0, 900) });
      if (paragraflar.length === 10) break;
    }
    sonuc.push({ kimlik: k.kimlik, hukum: k.hukum, soru: k.soru, beklenen: k.beklenen, paragraflar });
    fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
    process.stderr.write('.');
  }
  process.stderr.write('\n');
})();

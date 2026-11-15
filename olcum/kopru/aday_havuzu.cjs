// Heybe yalnız soruyla aradığında hangi bölümler aday (14.11.2026, Özet §141): kütüphanede doğru bölüm varsa, Heybe'nin
// kendi aramasının aday havuzunda kaçıncı sırada? (Ercan'ın eleme fikri ancak doğru bölüm adaylardaysa işe yarar.)
// Arama: Türkçe ve İngilizce kitaplar birlikte (köprü), cevap yazılmaz. Çıktı: her soru için makale sırası (en iyi puanıyla).
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
    try { await H.sor(k.soru, () => {}, dil, { kaynakDilleri: dil === 'tr' ? ['tr', 'en'] : ['en', 'tr'], yalnizKaynak: true, cevap: 'cevirerek', acilBakildi: true }); } catch (e) { /* boş */ }
    const makaleler = [];
    for (const [puan, p] of puanli) if (!makaleler.some((m) => m.makale === p.ad)) makaleler.push({ makale: p.ad, kitap: p.kitap, puan: Math.round(puan * 1000) / 1000 });
    sonuc.push({ kimlik: k.kimlik, makaleler: makaleler.slice(0, 25), ilkMetinler: puanli.slice(0, 40).map(([, p]) => ({ makale: p.ad, metin: String(p.metin).slice(0, 600) })) });
    fs.writeFileSync(cikti, JSON.stringify(sonuc));
    process.stderr.write('.');
  }
})();

// Notlama (Ö21): bir banka sonucundaki notlanmamış cevapları okunur biçimde gösterir; not dosyası verilince
// hükümleri cevabın iziyle banka/notlar.json'a yazar. Not insanın (ya da Can'ın) okumasıdır, beklenen cevap
// tıbbi otorite değildir — her hükmün yanına kısa gerekçe yazılır.
// Kullanım:
//   node olcum/banka/notla.cjs <sonuc.jsonl>                 → notlanmamışları göster (HEPSI=1: hepsini)
//   node olcum/banka/notla.cjs <sonuc.jsonl> <hukumler.json> → {"Y01": ["doğru", "gerekçe"], …} yazılır
const fs = require('fs');
const B = require('./banka.cjs');
const [dosya, hukumDosyasi] = process.argv.slice(2);
if (!dosya) { console.log('kullanım: node olcum/banka/notla.cjs <sonuc.jsonl> [hukumler.json]'); process.exit(1); }
const kayitlar = fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x));

if (!hukumDosyasi) {
  const n0 = B.notlar();
  for (const k of kayitlar) {
    const nt = B.notBul(n0, k.kimlik, k.iz);   // not, ölçümden sonra da yazılmış olabilir
    if (nt) k.hukum = nt.hukum;
    if (k.hukum && !process.env.HEPSI) continue;
    console.log(`\n═══ ${k.kimlik} [${k.dil}] ${k.soru}`);
    console.log(`  BEKLENEN: ${k.beklenen}`);
    if (k.tuzak) console.log(`  TUZAK   : ${k.tuzak}`);
    console.log(`  SONUÇ   : ${k.sonuc}${k.eksik.length ? ' · ' + k.eksik.join('; ') : ''}${k.hukum ? ' · NOT: ' + k.hukum : ''}`);
    console.log(`  CEVAP   : ${B.sade(k.cevap)}`);
    if (k.ozgun) console.log(`  ÖZGÜN (${k.ozgun.dil}): ${B.sade(k.ozgun.cevap).slice(0, 500)}`);
    k.parcalar.slice(0, 4).forEach((p, i) => console.log(`  [${i + 1}] ${p.makale}${p.bolum ? ' — ' + p.bolum : ''} (${p.dil}): ${B.sade(p.metin).slice(0, 220)}`));
  }
  process.exit(0);
}

const hukumler = JSON.parse(fs.readFileSync(hukumDosyasi, 'utf8'));
const n = B.notlar();
let yazilan = 0;
for (const k of kayitlar) {
  const h = hukumler[k.kimlik];
  if (!h) continue;
  const [hukum, gerekce] = h;
  if (!B.HUKUMLER.includes(hukum)) { console.log(`GEÇERSİZ HÜKÜM ${k.kimlik}: ${hukum}`); process.exit(1); }
  if (k.sonuc === 'durdu' && hukum !== 'durdu') console.log(`  not: ${k.kimlik} durmuş cevap "${hukum}" diye notlandı (durduğu hâlde içerik notu)`);
  n[k.kimlik] = (n[k.kimlik] || []).filter((x) => x.iz !== k.iz);
  n[k.kimlik].push({ iz: k.iz, hukum, not: gerekce || '', surum: k.surum, sonuc: k.sonuc, cevap: B.sade(k.cevap).slice(0, 160), tarih: new Date().toISOString().slice(0, 10) });
  yazilan++;
}
B.notlariYaz(n);
console.log(`${yazilan} hüküm yazıldı → ${B.NOTLAR}`);

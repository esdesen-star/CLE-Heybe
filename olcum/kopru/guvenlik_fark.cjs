// Güvenlik turu (15.11.2026 akşam, Özet §153): kalıp değişikliğinin kayıtlı bütün sorulardaki ve cevaplardaki farkı.
// Acil kartı (acilBelirti, yalnız kalıp — hakem modelsiz) her kayıtlı soruya, eylem bekçisi (eylemDenetle) her kayıtlı
// soru + cevap çiftine bakar. "kaydet" bugünkü hâli yazar; değişiklikten sonra "karsilastir" yeni tetiklenenleri ve
// susanları listeler (elle okunmak için: yeni tetiklenen doğruya boş alarm mı, gerçek tehlike mi).
// Kullanım: node olcum/kopru/guvenlik_fark.cjs kaydet eski.json · node olcum/kopru/guvenlik_fark.cjs karsilastir eski.json
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const KOK = path.join(__dirname, '..');
const DIZINLER = ['sonuc', 'banka', 'betik', 'sinav', 'okuma', 'rota', 'sadakat', 'denklik', 'kardes'];

function* dosyalar() {
  for (const d of DIZINLER) {
    const y = path.join(KOK, d);
    if (!fs.existsSync(y)) continue;
    for (const f of fs.readdirSync(y)) if (/\.(jsonl?|json)$/.test(f) && !/onbellek|kapi|ceviri_onceki/.test(f)) yield path.join(y, f);
  }
}
function* nesneler(x) {
  if (Array.isArray(x)) { for (const y of x) yield* nesneler(y); return; }
  if (x && typeof x === 'object') { yield x; for (const v of Object.values(x)) if (v && typeof v === 'object') yield* nesneler(v); }
}
function topla() {
  const sorular = new Map(), ciftler = new Map();
  for (const f of dosyalar()) {
    let kayitlar;
    try {
      const metin = fs.readFileSync(f, 'utf8');
      kayitlar = f.endsWith('.jsonl') ? metin.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [JSON.parse(metin)];
    } catch (e) { continue; }
    for (const k of kayitlar) for (const o of nesneler(k)) {
      const dil = typeof o.dil === 'string' && /^(tr|en)$/.test(o.dil) ? o.dil : 'tr';
      if (typeof o.soru === 'string' && o.soru.trim()) {
        sorular.set(`${dil}|${o.soru}`, { soru: o.soru, dil, dosya: path.basename(f) });
        if (typeof o.cevap === 'string' && o.cevap.trim().length > 20) ciftler.set(`${dil}|${o.soru}|${o.cevap}`, { soru: o.soru, cevap: o.cevap, dil, dosya: path.basename(f) });
        const oz = typeof o.ozgun === 'string' ? o.ozgun : (o.ozgun && typeof o.ozgun.cevap === 'string' ? o.ozgun.cevap : '');
        if (oz && typeof o.ceviri === 'string' && o.ceviri.trim()) ciftler.set(`en|${o.ceviri}|${oz}`, { soru: o.ceviri, cevap: oz, dil: 'en', dosya: path.basename(f) });
      }
    }
  }
  return { sorular: [...sorular.values()], ciftler: [...ciftler.values()] };
}
function olc() {
  const { sorular, ciftler } = topla();
  const acil = {}, eylem = {};
  for (const s of sorular) { const b = H.acilBelirti(s.soru, s.dil); if (b.length) acil[`${s.dil}|${s.soru}`] = { ...s, b }; }
  for (const c of ciftler) { const b = H.eylemDenetle(c.soru, c.cevap, c.dil); if (b.length) eylem[`${c.dil}|${c.soru}|${c.cevap}`] = { ...c, b }; }
  return { soruSayisi: sorular.length, ciftSayisi: ciftler.length, acil, eylem };
}
const [kip, dosya] = process.argv.slice(2);
const simdi = olc();
if (kip === 'kaydet') {
  fs.writeFileSync(dosya, JSON.stringify(simdi));
  console.log(`kayıtlı soru ${simdi.soruSayisi} · çift ${simdi.ciftSayisi} · acil kartı ${Object.keys(simdi.acil).length} · eylem bekçisi ${Object.keys(simdi.eylem).length}`);
} else {
  const eski = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  console.log(`soru ${eski.soruSayisi} → ${simdi.soruSayisi} · çift ${eski.ciftSayisi} → ${simdi.ciftSayisi}`);
  for (const ad of ['acil', 'eylem']) {
    const yeni = Object.keys(simdi[ad]).filter((k) => !eski[ad][k] || JSON.stringify(eski[ad][k].b) !== JSON.stringify(simdi[ad][k].b));
    const susan = Object.keys(eski[ad]).filter((k) => !simdi[ad][k]);
    console.log(`\n=== ${ad}: ${Object.keys(eski[ad]).length} → ${Object.keys(simdi[ad]).length} · yeni ya da değişen ${yeni.length} · susan ${susan.length}`);
    for (const k of yeni) {
      const x = simdi[ad][k];
      console.log(`+ [${x.dosya}] ${x.dil} «${x.soru.slice(0, 120)}» → ${x.b.join(' | ')}${eski[ad][k] ? ` (eskisi: ${eski[ad][k].b.join(' | ')})` : ''}`);
      if (x.cevap) console.log(`    ${x.cevap.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    for (const k of susan) console.log(`- [${eski[ad][k].dosya}] «${eski[ad][k].soru.slice(0, 120)}» (eskisi: ${eski[ad][k].b.join(' | ')})`);
  }
}

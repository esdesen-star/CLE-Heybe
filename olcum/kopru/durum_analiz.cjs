// Durum denetçisi için analiz (07.11, Özet §45): notlu cevaplarda kötüler (yanlış/tehlikeli geçen) neyle ayrılıyor?
// Her geçen cevap için: (1) sorudaki özel kişi (bebek/çocuk/gebe/yaşlı) atıf yapılan kaynakta var mı, (2) sorunun
// içerik köklerinden kaçı atıf yapılan kaynakta, (3) soru ↔ kaynak anlam benzerliği (aramadaki puan), (4) soru ↔ cevap.
// Kullanım: GOMME=http://127.0.0.1:18081 node olcum/kopru/durum_analiz.cjs sonuc1.jsonl [sonuc2.jsonl …]
const fs = require('fs');
const B = require('../banka/banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const GOMME = process.env.GOMME || 'http://127.0.0.1:18081';
const katla = (w) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
const onb = new Map();
async function gom(metinler) {
  const eksik = [...new Set(metinler)].filter((m) => !onb.has(m));
  for (let i = 0; i < eksik.length; i += 32) {
    const parti = eksik.slice(i, i + 32);
    const y = await (await fetch(`${GOMME}/v1/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: parti }) })).json();
    [...y.data].sort((a, b) => a.index - b.index).forEach((d, j) => { const b = Math.hypot(...d.embedding) || 1; onb.set(parti[j], d.embedding.map((x) => x / b)); });
  }
  return metinler.map((m) => onb.get(m));
}
const ic = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
const belge = (p) => `title: ${p.makale}${p.bolum ? ' — ' + p.bolum : ''} | text: ${String(p.metin).slice(0, 600)}`;

function atiflar(cevap, n) {
  const s = new Set();
  for (const m of String(cevap).matchAll(/\[([\d,\s]+)\]/g)) for (const x of m[1].split(/[,\s]+/)) { const k = Number(x); if (k >= 1 && k <= n) s.add(k - 1); }
  return [...s];
}
function kokler(soru, dil) {
  const D = H.dilBilgi(dil);
  const kucuk = D.kucuk || ((m) => m.toLowerCase());
  return [...new Set((kucuk(soru).match(/\p{L}+/gu) || []).filter((w) => w.length >= 4).map((w) => katla(w).slice(0, 4))
    .filter((k) => !(D.durak && [...D.durak].some((d) => katla(d).startsWith(k)))))];
}

// KULLANILAN=1: atıf numarası yerine cevabın satırlarının metinden geldiği paragraflar (07.11: Y02'de model yetişkin
// paragrafını kullanıp numarayı bebek paragrafına vermişti)
const KULLANILAN = !!process.env.KULLANILAN;
const kokSet = (m) => new Set((katla(m).match(/\p{L}{4,}/gu) || []).map((w) => w.slice(0, 5)));
function kullanilan(r) {
  const pk = r.parcalar.map((p) => kokSet(p.metin));
  const secilen = new Set();
  for (const satir of String(r.ozgun ? r.ozgun.cevap : r.cevap).split(/\n|(?<=[.!?])\s+/)) {
    const sk = kokSet(satir.replace(/\[[\d,\s]+\]/g, ''));
    if (sk.size < 3) continue;
    let en = -1, ei = -1;
    pk.forEach((k, i) => { let o = 0; for (const x of sk) if (k.has(x)) o++; const oran = o / sk.size; if (oran > en) { en = oran; ei = i; } });
    if (en >= 0.3) secilen.add(ei);
  }
  return (secilen.size ? [...secilen] : r.parcalar.map((_, i) => i)).map((i) => r.parcalar[i]);
}

(async () => {
  const n = B.notlar();
  const satirlar = [];
  for (const dosya of process.argv.slice(2)) {
    for (const r of fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x))) {
      if (r.sonuc !== 'cevap') continue;
      const nt = B.notBul(n, r.kimlik, r.iz);
      if (!nt) continue;
      const at = atiflar(r.cevap, r.parcalar.length);
      const kaynak = KULLANILAN ? kullanilan(r) : (at.length ? at : r.parcalar.map((_, i) => i)).map((i) => r.parcalar[i]);
      // (1) kişi
      const soruKisi = [...(H.kisiler(r.soru, r.dil) || [])].filter((k) => k !== 'yetiskin');
      const kaynakKisi = new Set(kaynak.flatMap((p) => [...(H.kisiler(`${p.makale} ${p.bolum || ''} ${p.metin}`, p.dil || r.dil) || [])]));
      const kisiUymaz = soruKisi.length > 0 && !soruKisi.some((k) => kaynakKisi.has(k));
      // (2) kökler (yalnız aynı dildeki kaynaklar)
      const kk = kokler(r.soru, r.dil);
      const ayniDil = kaynak.filter((p) => (p.dil || r.dil) === r.dil);
      const metin = katla(ayniDil.map((p) => `${p.makale} ${p.bolum || ''} ${p.metin}`).join(' '));
      const baslik = katla(ayniDil.map((p) => `${p.makale} ${p.bolum || ''}`).join(' '));
      const kapsam = ayniDil.length && kk.length ? kk.filter((k) => metin.includes(k)).length / kk.length : null;
      const baslikKapsam = ayniDil.length && kk.length ? kk.filter((k) => baslik.includes(k)).length / kk.length : null;
      // (3)(4) anlam
      const [q, ...v] = await gom([`task: search result | query: ${r.soru}`, ...kaynak.map(belge), `title: none | text: ${B.sade(r.cevap).slice(0, 600)}`]);
      const kaynakPuan = v.slice(0, -1).map((x) => ic(q, x));
      const cevapPuan = ic(q, v[v.length - 1]);
      satirlar.push({ kimlik: r.kimlik, hukum: nt.hukum, kisiUymaz, kapsam, baslikKapsam, enIyi: Math.max(...kaynakPuan), ort: kaynakPuan.reduce((a, b) => a + b, 0) / kaynakPuan.length, cevapPuan, atif: at.length, kk: kk.join(',') });
    }
  }
  const f = (x) => (x == null ? '  - ' : x.toFixed(2));
  console.log('kimlik  hüküm      kişi  kapsam başlık enİyi  ort   cevap  kökler');
  for (const s of satirlar.sort((a, b) => a.enIyi - b.enIyi)) {
    console.log(`${s.kimlik.padEnd(6)} ${s.hukum.padEnd(10)} ${s.kisiUymaz ? 'UYMAZ' : '  .  '} ${f(s.kapsam)}  ${f(s.baslikKapsam)}  ${f(s.enIyi)}  ${f(s.ort)}  ${f(s.cevapPuan)}  ${s.kk}`);
  }
  fs.writeFileSync(require('path').join(__dirname, '..', 'sonuc', 'durum_analiz.json'), JSON.stringify(satirlar, null, 1));
  const kotu = (s) => ['yanlış', 'tehlikeli'].includes(s.hukum);
  for (const [ad, kural] of [['kişi uymaz', (s) => s.kisiUymaz], ['kapsam < 0.34', (s) => s.kapsam != null && s.kapsam < 0.34],
    ['başlık kapsamı 0', (s) => s.baslikKapsam === 0], ['en iyi kaynak < 0.45', (s) => s.enIyi < 0.45], ['en iyi kaynak < 0.50', (s) => s.enIyi < 0.5],
    ['cevap benzerliği < 0.45', (s) => s.cevapPuan < 0.45]]) {
    const yakalanan = satirlar.filter((s) => kural(s) && kotu(s)).map((s) => s.kimlik);
    const bos = satirlar.filter((s) => kural(s) && s.hukum === 'doğru').map((s) => s.kimlik);
    const kismen = satirlar.filter((s) => kural(s) && s.hukum === 'kısmen').map((s) => s.kimlik);
    console.log(`${ad.padEnd(24)} kötü ${yakalanan.length}/${satirlar.filter(kotu).length} (${yakalanan.join(' ')}) · doğruya boş alarm ${bos.length} (${bos.join(' ')}) · kısmen ${kismen.length}`);
  }
})();

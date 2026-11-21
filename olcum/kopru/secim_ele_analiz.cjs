// §217 (20.11.2026, Ercan: "Seçimde elemeyi düşün"): SEÇİMDE ELEME — teşhis. Başka durumun paragrafı modele gitmeden elenebilir mi?
// Kural E1 (başlık): modele giden 6 paragrafın her biri için soru ↔ "madde — bölüm" adı anlam benzerliği; en iyi başlığın δ altında
// kalan paragraf elenir. Kayıtlı cevaplarla (görülmüş → δ burada seçilir, karar görülmemiş setle). Kapı: sonuc/kaynak_goz/secim_ele_kapi_2011.txt
// Gerekenler: anlam modeli (GOMME, 18081) + çevirmen (CEVIRMEN, 18082; Türkçe sorunun İngilizcesi için, önbellekli).
// Kullanım: node olcum/kopru/secim_ele_analiz.cjs [ayrinti]
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const GOMME = process.env.GOMME || 'http://127.0.0.1:18081';
const KLS = path.join(__dirname, '..', 'sonuc', 'kaynak_goz');
const ONB = path.join(KLS, 'secim_ele_onbellek.json');
const onb = fs.existsSync(ONB) ? JSON.parse(fs.readFileSync(ONB, 'utf8')) : { ceviri: {}, vek: {} };
const ayrinti = process.argv[2] === 'ayrinti';

const parcaBul = (ps, n) => ps.find((p) => +p.n === n) || ps[n - 1];
function atifNolari(cevap, ps) {   // cevabın atıf yaptığı paragraf numaraları (kaynak_goz_analiz.cjs'teki bölme)
  const s = new Set();
  for (const c of String(cevap).split(/\n+|(?<=[.!?])\s+(?=\S)/)) {
    for (const g of c.match(/\[([\d,\s]+)\]/g) || []) for (const n of g.match(/\d+/g).map(Number)) if (parcaBul(ps, n)) s.add(n);
  }
  return s;
}
function derlemK() {
  return JSON.parse(fs.readFileSync(path.join(KLS, 'kosul_etiketli_1911.json'), 'utf8')).map((x) => ({ d: 'K', id: x.id, no: x.no,
    soru: x.soru, cevap: x.ozgun || x.cevap, ps: x.kaynaklar.map((p, i) => ({ ...p, n: p.n || i + 1 })), sinif: x.s1, kn: x.kn || [],
    ulasti: /ulaştı/.test(x.sonuc), hukum: 'tehlikeli', dil: /_en/.test(x.yol) ? 'en' : 'tr' }));
}
function derlemN() {
  const n = B.notlar(); const gor = new Set(); const L = [];
  const S = path.join(__dirname, '..', 'sonuc');
  for (const f of fs.readdirSync(S).filter((x) => /^banka_.*\.jsonl$/.test(x)).sort()) {
    for (const l of fs.readFileSync(path.join(S, f), 'utf8').split('\n')) {
      if (!l.trim()) continue; let r; try { r = JSON.parse(l); } catch (e) { continue; }
      if (r.sonuc !== 'cevap' || !(r.parcalar || []).length || !r.parcalar[0].metin) continue;
      const nt = B.notBul(n, r.kimlik, r.iz); if (!nt || nt.hukum === 'bilgi yok') continue;
      const k = `${r.kimlik}|${r.iz}`; if (gor.has(k)) continue; gor.add(k);
      L.push({ d: 'N', id: k, no: r.kimlik, soru: r.soru, cevap: r.ozgun && r.ozgun.cevap ? r.ozgun.cevap : r.cevap,
        ps: r.parcalar.map((p, i) => ({ ...p, n: i + 1 })), hukum: nt.hukum, ulasti: true, dil: r.dil || 'tr' });
    }
  }
  return L;
}
// başlık: forumun ve ready.gov'un ek adı, forumun "11 Answers11" bölüm adı atılır
const baslik = (p) => {
  const m = String(p.makale || '').replace(/\s+-\s+The Great Outdoors Stack Exchange$/i, '').replace(/\s*\|\s*Ready\.gov$/i, '').trim();
  const b = /^\d+\s+Answers?\d*$/i.test(String(p.bolum || '').trim()) ? '' : String(p.bolum || '').trim();
  return b ? `${m} — ${b}` : m;
};
async function vekler(metinler) {
  const yeni = [...new Set(metinler.filter((m) => !(m in onb.vek)))];
  for (let i = 0; i < yeni.length; i += 32) {
    const parca = yeni.slice(i, i + 32);
    const y = await (await fetch(`${GOMME}/v1/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: parca }) })).json();
    y.data.forEach((d, j) => { const v = d.embedding; const b = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1; onb.vek[parca[j]] = v.map((x) => Math.round((x / b) * 1e5) / 1e5); });
  }
  return metinler.map((m) => onb.vek[m]);
}
const ic = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
async function ingilizce(soru) {
  if (!(soru in onb.ceviri)) onb.ceviri[soru] = String(await H.cevir(soru, 'tr', 'en', 120)).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || soru;
  return onb.ceviri[soru];
}

(async () => {
  const L = [...derlemK(), ...derlemN()];
  for (const x of L) {
    x.atif = atifNolari(x.cevap, x.ps);
    const sorgular = { tr: [x.soru], en: x.dil === 'en' ? [x.soru] : [x.soru, await ingilizce(x.soru)] };
    const q = {};
    for (const [d, s] of Object.entries(sorgular)) q[d] = await vekler(s.map((m) => `task: search result | query: ${m}`));
    const bas = x.ps.map(baslik);
    const bv = await vekler(bas.map((b) => `title: ${b} | text: ${b}`));
    x.simT = x.ps.map((p, i) => { const qs = x.dil === 'en' ? q.en : (p.dil === 'en' ? q.en : q.tr); return qs.reduce((t, s) => t + ic(s, bv[i]), 0) / qs.length; });
  }
  fs.writeFileSync(ONB, JSON.stringify(onb));
  const DK = L.filter((x) => x.d === 'K' && 'DK'.includes(x.sinif));
  const DOGRU = L.filter((x) => x.d === 'N' && x.hukum === 'doğru');
  const grup = (h) => L.filter((x) => x.d === 'N' && x.hukum === h);
  const elenen = (x, delta) => { const en = Math.max(...x.simT); return new Set(x.ps.filter((p, i) => x.simT[i] < en - delta).map((p) => +p.n)); };
  const tehElendi = (x, d) => { const e = elenen(x, d); return x.kn.length && x.kn.every((n) => e.has(n)); };
  const atifElendi = (x, d) => { const e = elenen(x, d); return [...x.atif].some((n) => e.has(n)); };
  const hepsiElendi = (x, d) => { const e = elenen(x, d); return x.atif.size && [...x.atif].every((n) => e.has(n)); };
  console.log('δ     | D+K tehlikeli elendi | ulaşan | doğruda atıflı elenen (hepsi) | tehlikeli N | yanlış N | kısmen N | ort. kalan');
  for (const d of [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20]) {
    const say = (A, f) => A.filter((x) => f(x, d)).length;
    const kalan = L.reduce((t, x) => t + x.ps.length - elenen(x, d).size, 0) / L.length;
    console.log(`${d.toFixed(2)}  | ${say(DK, tehElendi)}/${DK.length} | ${say(DK.filter((x) => x.ulasti), tehElendi)}/${DK.filter((x) => x.ulasti).length} | ${say(DOGRU, atifElendi)}/${DOGRU.length} (${say(DOGRU, hepsiElendi)}) | ${say(grup('tehlikeli'), atifElendi)}/${grup('tehlikeli').length} | ${say(grup('yanlış'), atifElendi)}/${grup('yanlış').length} | ${say(grup('kısmen'), atifElendi)}/${grup('kısmen').length} | ${kalan.toFixed(2)}`);
  }
  // E2 (ikinci ve son aday, kapı dosyasında): adında sorunun hiçbir içerik kökü geçmeyen paragraf, kök geçen biri varken elenir
  const kokVar = (x, p) => {
    const d = x.dil === 'en' || p.dil === 'en' ? 'en' : 'tr';
    const q = d === 'en' ? (x.dil === 'en' ? x.soru : onb.ceviri[x.soru]) : x.soru;
    return H.kelimeSirala([{ ad: '', bolum: '', metin: baslik(p) }], q, H.dilBilgi(d)).length > 0;
  };
  for (const x of L) x.kok = x.ps.map((p) => kokVar(x, p));
  const elenen2 = (x) => (x.kok.some(Boolean) ? new Set(x.ps.filter((p, i) => !x.kok[i]).map((p) => +p.n)) : new Set());
  {
    const f = (x, tur) => { const e = elenen2(x); return tur === 'teh' ? x.kn.length && x.kn.every((n) => e.has(n)) : [...x.atif].some((n) => e.has(n)); };
    const say = (A, tur) => A.filter((x) => f(x, tur)).length;
    const hepsi = DOGRU.filter((x) => x.atif.size && [...x.atif].every((n) => elenen2(x).has(n))).length;
    const kalan = L.reduce((t, x) => t + x.ps.length - elenen2(x).size, 0) / L.length;
    console.log(`E2 kök | ${say(DK, 'teh')}/${DK.length} | ${say(DK.filter((x) => x.ulasti), 'teh')}/${DK.filter((x) => x.ulasti).length} | ${say(DOGRU, 'atif')}/${DOGRU.length} (${hepsi}) | ${say(grup('tehlikeli'), 'atif')}/${grup('tehlikeli').length} | ${say(grup('yanlış'), 'atif')}/${grup('yanlış').length} | ${say(grup('kısmen'), 'atif')}/${grup('kısmen').length} | ${kalan.toFixed(2)}`);
    if (process.env.KURAL === 'E2' && ayrinti) {
      for (const x of [...DK, ...DOGRU.filter((y) => f(y, 'atif'))]) {
        const e = elenen2(x);
        console.log(`\n${x.d === 'K' ? x.id + (x.ulasti ? ' ULAŞTI' : ' durdu') + (f(x, 'teh') ? ' ✓ELENDİ' : '') : 'DOĞRU ' + x.no} | ${x.soru.slice(0, 70)}${x.dil === 'tr' ? ' → ' + String(onb.ceviri[x.soru] || '').slice(0, 60) : ''}`);
        x.ps.forEach((p) => console.log(`  ${x.kn && x.kn.includes(+p.n) ? '★' : x.atif.has(+p.n) ? '@' : ' '}${e.has(+p.n) ? '✗' : ' '} ${baslik(p).slice(0, 70)}`));
      }
    }
  }
  if (ayrinti && process.env.KURAL !== 'E2') {
    const d = +(process.env.DELTA || 0.08);
    for (const x of DK) {
      const e = elenen(x, d);
      console.log(`\n${x.id} ${x.ulasti ? 'ULAŞTI' : 'durdu'} ${tehElendi(x, d) ? '✓ELENDİ' : ''} | ${x.soru.slice(0, 70)}`);
      x.ps.forEach((p, i) => console.log(`  ${x.kn.includes(+p.n) ? '★' : ' '}${e.has(+p.n) ? '✗' : ' '} ${x.simT[i].toFixed(3)} ${baslik(p).slice(0, 70)}`));
    }
    for (const x of DOGRU.filter((y) => atifElendi(y, d))) {
      const e = elenen(x, d);
      console.log(`\nDOĞRU ${x.no} | ${x.soru.slice(0, 70)}`);
      x.ps.forEach((p, i) => console.log(`  ${x.atif.has(+p.n) ? '@' : ' '}${e.has(+p.n) ? '✗' : ' '} ${x.simT[i].toFixed(3)} ${baslik(p).slice(0, 70)}`));
    }
  }
})();

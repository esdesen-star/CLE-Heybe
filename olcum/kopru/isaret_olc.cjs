// §216 (20.11.2026, Ercan: "İşaretlemeyi ölç"): İŞARETLEME — bekçi durdurmaz, cevap satırının yanına not koyar:
// "kaynakta şu durum için yazılmış: …". Not, §215'in iki adımlı biçiminin birinci adımı (s1: model soruyu görmez, paragraf +
// o paragraftan alınan satırlar, en çok 12 kelime; kararlar sonuc/kaynak_goz/karar_s_K.json ve karar_s_N.json'da kayıtlı).
// Soru Türkçeyse not ürünün çevirmeniyle (H.cevir, TranslateGemma) çevrilir — kullanıcının göreceği hâl.
// Bu betik yalnız hakeme gidecek öğeleri hazırlar (sonuc/kaynak_goz/isaret_ogeler.json); ürün kodu değişmez.
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/isaret_olc.cjs
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const KLS = path.join(__dirname, '..', 'sonuc', 'kaynak_goz');
const CONB = path.join(KLS, 'isaret_ceviri.json');
const conb = fs.existsSync(CONB) ? JSON.parse(fs.readFileSync(CONB, 'utf8')) : {};
const AZAMI = 6;   // karar_s_* bu sınırla üretildi

// kaynak_goz_analiz.cjs'teki ile aynı (satırları paragrafa göre toplar)
const kes = (s, n) => { const a = Array.from(String(s || '')); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const parcaBul = (ps, n) => ps.find((p) => +p.n === n) || ps[n - 1];
function atiflar(cevap, ps) {
  const say = new Map();
  for (const c of String(cevap).split(/\n+|(?<=[.!?])\s+(?=\S)/)) {
    const ns = [...new Set((c.match(/\[([\d,\s]+)\]/g) || []).flatMap((g) => g.match(/\d+/g).map(Number)))];
    const temiz = c.replace(/\[[\d,\s]+\]/g, '').replace(/^[\s*•\-\d.)]+/, '').replace(/\s+/g, ' ').trim();
    if (!temiz) continue;
    for (const n of ns) { if (!parcaBul(ps, n)) continue; if (!say.has(n)) say.set(n, []); say.get(n).push(temiz); }
  }
  return [...say.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, AZAMI);
}
function derlemK() {
  const L = JSON.parse(fs.readFileSync(path.join(KLS, 'kosul_etiketli_1911.json'), 'utf8'));
  return L.map((x) => ({ d: 'K', id: x.id, no: x.no, yol: x.yol, soru: x.soru, cevap: x.ozgun || x.cevap, gorunen: x.cevap, ps: x.kaynaklar,
    sinif: x.s1, sinif2: x.s2, kn: x.kn || [], kn2: x.kn2 || [], ulasti: /ulaştı/.test(x.sonuc), hukum: 'tehlikeli',
    dil: /_en/.test(x.yol) ? 'en' : 'tr' }));
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
      L.push({ d: 'N', id: k, no: r.kimlik, yol: f, soru: r.soru, cevap: r.ozgun && r.ozgun.cevap ? r.ozgun.cevap : r.cevap,
        gorunen: r.cevap, ps: r.parcalar, hukum: nt.hukum, ulasti: true, dil: r.dil || 'tr' });
    }
  }
  return L;
}
const turkce = (s) => /[çğıöşüÇĞİÖŞÜ]/.test(s) || /\b(bir|ve|için|sonra|kişi|sırasında|olan)\b/i.test(s);
async function turkceNot(not) {
  if (turkce(not)) return { metin: not, cevrildi: false };
  const k = `en>tr:${not}`;
  if (!(k in conb)) {
    const ham = String(await H.cevir(not, 'en', 'tr', 80));
    conb[k] = (ham.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || '').replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '');
    fs.writeFileSync(CONB, JSON.stringify(conb));
  }
  return { metin: conb[k], cevrildi: true };
}

(async () => {
  const kararlar = new Map();
  for (const f of ['karar_s_K.json', 'karar_s_N.json']) for (const k of JSON.parse(fs.readFileSync(path.join(KLS, f), 'utf8'))) kararlar.set(`${k.d}|${k.id}`, k);
  const L = [...derlemK(), ...derlemN().filter((x) => x.hukum === 'doğru' || x.hukum === 'tehlikeli')];
  const cikti = []; let eksik = 0, cevrilen = 0;
  for (const x of L) {
    const kr = kararlar.get(`${x.d}|${x.id}`);
    if (!kr) { eksik++; continue; }
    const at = new Map(atiflar(x.cevap, x.ps));
    const notlar = [];
    for (const z of kr.kararlar) {
      const p = parcaBul(x.ps, z.n); const satirlar = at.get(z.n) || [];
      const notEn = String(z.durum || '').trim();
      const tr = x.dil === 'tr' ? await turkceNot(notEn) : { metin: notEn, cevrildi: false };
      if (tr.cevrildi) cevrilen++;
      notlar.push({ n: z.n, makale: p.makale, bolum: p.bolum || '', kitap: p.kitap || '', paragraf: kes(p.metin, 900),
        satirlar: satirlar.map((s) => kes(s, 300)), not_ozgun: notEn, not: tr.metin, cevrildi: tr.cevrildi });
    }
    cikti.push({ d: x.d, id: x.id, no: x.no, yol: x.yol, dil: x.dil, hukum: x.hukum, sinif: x.sinif, sinif2: x.sinif2,
      kn: x.kn, kn2: x.kn2, ulasti: x.ulasti, soru: x.soru, notlar });
  }
  fs.writeFileSync(path.join(KLS, 'isaret_ogeler.json'), JSON.stringify(cikti, null, 1));
  const say = (f) => cikti.filter(f).length;
  console.log(`öğe ${cikti.length} (K ${say((x) => x.d === 'K')} · N doğru ${say((x) => x.hukum === 'doğru' && x.d === 'N')} · N tehlikeli ${say((x) => x.hukum === 'tehlikeli' && x.d === 'N')}) · not ${cikti.reduce((t, x) => t + x.notlar.length, 0)} · çevrilen not ${cevrilen} · kararı olmayan ${eksik}`);
})();

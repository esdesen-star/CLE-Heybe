// Ekran ve not çevirilerinin ortak temizlik kuralları (07.11 gece — "Kural tek yerde": arayuz_cevir.cjs ve
// basla_cevir.cjs aynı kuralları kullanır). Çevirmen: H.AYAR.cevirmen (çağıran ayarlar).
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const { dilBetigi, yabanciKelimeler, KORUNAN } = require('./alfabe.cjs');

const yerTutucu = (m) => (m.match(/\{\d\}/g) || []).sort().join('');

// temizCevir (07.11, Özet §43): çeviri başka alfabeden kelime taşıyorsa ("പുസ്തകoteca", Svahilide Arapça) cümle cümle
// bir kez daha çevrilir; yine bozuksa null → sayfa o metni İngilizce gösterir (bozuk yazıdan iyidir).
// Sırpçada Latin kısımlar önce Kiril'e çevrilir (srKiril). Ölçü alfabe.cjs'te, denetçiyle ortak.
async function cevir1(metin, dil) {
  let c = '';
  try { c = (await H.cevir(metin, 'en', dil, 300)).trim(); } catch (e) { c = ''; }
  if (c && dil === 'sr') c = srKiril(c);
  return c;
}
const temiz = (c, metin, dil) => c && yerTutucu(c) === yerTutucu(metin) && !yabanciKelimeler(c, dilBetigi(dil)).length;
// korunan adlar çeviriye yer tutucu olarak gider ({5}…), sonra geri konur: çevirmen yer tutucuya dokunmaz
const koru = (m) => KORUNAN.reduce((x, ad, i) => x.split(ad).join(`{${5 + i}}`), m);
const geriKoy = (m) => KORUNAN.reduce((x, ad, i) => x.split(`{${5 + i}}`).join(ad), m);
async function temizCevir(metin, dil) {
  const km = koru(metin);
  const c = await cevir1(km, dil);
  if (temiz(c, km, dil)) return geriKoy(c);
  const cumleler = km.split(/(?<=[.!?:])\s+/).filter(Boolean);
  if (cumleler.length > 1) {
    const parca = [];
    for (const x of cumleler) parca.push(await cevir1(x, dil));
    const c2 = parca.join(' ');
    if (parca.every(Boolean) && temiz(c2, km, dil)) return geriKoy(c2);
  }
  return null;   // null → sayfa İngilizcesini kullanır
}

const SR_TEK = { a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к',
  l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж' };
const SR_CIFT = { lj: 'љ', nj: 'њ', dž: 'џ' };
const SR_KORU = new Set(['kutuphane', 'benim', 'zim', 'heybe', 'en', 'medicine', 'nopic', 'wikipedia']);
function srHarf(k) {
  let o = '';
  for (let i = 0; i < k.length; i++) {
    const iki = k.slice(i, i + 2), ikiK = iki.toLowerCase();
    if (SR_CIFT[ikiK]) { const c = SR_CIFT[ikiK]; o += iki[0] === iki[0].toUpperCase() ? c.toUpperCase() : c; i++; continue; }
    const h = k[i], hk = h.toLowerCase();
    o += SR_TEK[hk] ? (h === hk ? SR_TEK[hk] : SR_TEK[hk].toUpperCase()) : h;
  }
  return o;
}
function srKiril(m) {
  return m.replace(/[\p{L}]+/gu, (k, i, tum) => {
    if (!/[a-zčćđšž]/i.test(k)) return k;                       // zaten Kiril
    if (/[qwxy]/i.test(k) || /^[A-ZČĆĐŠŽ]{2,}$/.test(k.replace(/[^\p{L}]/gu, '')) && !/[Ѐ-ӿ]/.test(k)) return k;
    if (SR_KORU.has(k.toLowerCase())) return k;
    if (/[_/.\\]/.test(tum[i - 1] || '') || /^([_/\\]|:\/\/)/.test(tum.slice(i + k.length, i + k.length + 3))) return k;   // dosya adı, yol, adres
    return srHarf(k);
  });
}
const srNesne = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, srNesne(v)]))
  : typeof o === 'string' ? srKiril(o) : o);

// 06.11 (Ercan'ın Bulgarca testi): "stick" çevirmende "çubuk / asa / kalem" oluyordu → çeviriye "USB drive" gider.
// 13.11 (§124): arayuz_cevir.cjs'ten buraya — anlam denetçisi de çevirmene giden metni ölçsün
const bellekli = (m) => m.replace(/\b(the|this) stick\b/gi, '$1 USB drive').replace(/\bstick\b/gi, 'USB drive');
module.exports = { yerTutucu, cevir1, temiz, koru, geriKoy, temizCevir, srKiril, srNesne, bellekli };

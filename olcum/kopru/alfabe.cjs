// Alfabe karışması ölçüsü (07.11.2026, Özet §43): çevirmen kimi dilde başka dilin kelimesini bırakıyor —
// Sırpçada Kiril + Latin ("Одговори koje ste označili"), Malayalamda İspanyolca ve Rusça ("പുസ്തകoteca", "аллергии"),
// Kannadada "ಪoli" (polis). Kural tek yerde: çevirici (arayuz_cevir.cjs) ve denetçi (arayuz_denetle.cjs) bunu kullanır.
// Tablo arkadas.js'te (BETIK — 09.11, Özet §86): cevaptaki yazı sistemi bekçisi de aynısını kullanır, kural tek yerde.
const { BETIK } = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const BETIKLER = BETIK.liste;
// birlikte yazılan alfabeler (Japonca üçünü, Korece Hangul + Han'ı karıştırır; bu hata değil)
const AILE = BETIK.aile;
// yabancı ad (q/w/x/y), kısaltma, dosya adı yanında olmayan ama bilerek İngilizce kalan kelimeler
const TEKNIK = new Set(['zim', 'kutuphane', 'wikipedia', 'en', 'medicine', 'nopic', 'back', 'forward', 'hot', 'cold', 'drive', 'library', 'u']);

const harfBetigi = (h) => (BETIKLER.find(([, re]) => re.test(h)) || [null])[0];
const betikleri = (k) => new Set([...k].map(harfBetigi).filter(Boolean));

// anaBetik: metnin en çok harfinin alfabesi (Japoncada Han/Hiragana/Katakana tek aile sayılır)
function anaBetik(metin) {
  const say = {};
  for (const h of metin.match(/\p{L}/gu) || []) { const b = harfBetigi(h); if (b) { const a = AILE[b] === 'ja' ? 'ja' : b; say[a] = (say[a] || 0) + 1; } }
  return Object.entries(say).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// her dilin ana alfabesi (tabloda yoksa Latin)
const ANA = BETIK.ana;
const dilBetigi = (dil) => ANA[dil] || 'Latin';
const latinTeknik = (k) => /[qwxy]/i.test(k) || /^[A-Z]/.test(k) || TEKNIK.has(k.toLowerCase());

// yabanciKelimeler: ana alfabesi `ana` olan metinde yeri olmayan kelimeler. Kelime alfabe parçalarına bölünür:
// Japonca/Korece/İbranicede "USB", "Heybe" kelimeye bitişik yazılır (このUSBドライブ, Heybe는, הUSB) — bu hata değil.
function yabanciKelimeler(metin, ana = anaBetik(metin)) {
  const sonuc = [];
  for (const m of metin.matchAll(/\p{L}+/gu)) {
    const k = m[0], once = metin[m.index - 1] || '', sonra = metin.slice(m.index + k.length, m.index + k.length + 3);
    if (/[_/.\\]/.test(once) || /^([_/\\]|:\/\/)/.test(sonra)) continue;   // dosya adı, yol, adres
    const parca = [];   // [alfabe, harfler]
    for (const h of k) {
      let b = harfBetigi(h);
      if (b && AILE[b] === 'ja' && ana === 'ja') b = 'ja';
      if (ana === 'Hangul' && b === 'Han') b = 'Hangul';
      if (parca.length && parca[parca.length - 1][0] === b) parca[parca.length - 1][1] += h; else parca.push([b, h]);
    }
    const kotu = parca.some(([b, p], i) => {
      if (!b || b === ana) return false;
      if (b !== 'Latin') return true;                                        // üçüncü bir alfabe (Malayalamda Arapça)
      if (ana === 'Latin') return false;
      // Latin parça: ana alfabeye bitişikse yalnız ad/kısaltma olabilir; tek başınaysa gerçek kelime mi
      const bitisik = parca.length > 1;
      return bitisik ? !(/^[A-Z]/.test(p) || /[qwxy]/i.test(p)) : !latinTeknik(p);
    });
    if (kotu) sonuc.push(k);
  }
  return sonuc;
}

// korunan adlar (07.11): kullanıcının bellekte arayacağı klasör/dosya adları çeviride harfi harfine kalmalı —
// 21 dilde "kutuphane" klasörü çevrilmişti ("Bibliothek"), kullanıcı o klasörü bulamazdı.
const KORUNAN = ['kutuphane', 'LISANSLAR', '.zim', 'FAT32'];
const eksikAdlar = (ceviri, kaynak) => KORUNAN.filter((ad) => kaynak.includes(ad) && !ceviri.includes(ad));

module.exports = { anaBetik, dilBetigi, yabanciKelimeler, TEKNIK, KORUNAN, eksikAdlar };

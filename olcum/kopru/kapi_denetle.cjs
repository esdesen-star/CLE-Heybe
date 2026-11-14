// Anlam kapısı — modelsiz denetim (13.11.2026 harita, Özet §123; 14.11 ana sayfa, §124; önceki adı harita_kapi_denetle.cjs).
// SAYFA=harita → harita yön metinleri + adım okları; SAYFA'sız → ana sayfanın "bilgi yok" ve "kaynağının yasakladığı". Çevirmen (arayuz_cevir.cjs) her yön ve
// "buradan/buraya" çevirisini Türkçeye geri çevirip anlam_kapi.cjs'in kuralından geçirir; kanıtı harita_kapi.json'a yazar.
// Burada model yok: sayfaya giden (harita_metin_ek.js) her kapı metni için kanıt var mı, kanıttaki çeviri gönderilenle aynı
// mı, kanıttaki geri çeviri kuraldan geçiyor mu? Kapıdan geçmeyen null'dır (sayfa İngilizce gösterir) — o da sayılır.
// Ayrıca sayfa her yön adımında dilden bağımsız oku göstermeli (YON_OK, bütün yon anahtarları).
// Kullanım: SAYFA=harita node olcum/kopru/kapi_denetle.cjs · node olcum/kopru/kapi_denetle.cjs
//   (bozma denemesi için EK=…, KANIT=…, SAYFA_YOL=…)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HARITA = process.env.SAYFA === 'harita';
const { KAPI: KAPI_HARITA, KAPI_SAYFA, kapiGecer } = require('./anlam_kapi.cjs');
const KAPI = HARITA ? KAPI_HARITA : KAPI_SAYFA;
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const c = { window: {} };
vm.createContext(c);
vm.runInContext(fs.readFileSync(process.env.EK || path.join(HEYBE, HARITA ? 'harita_metin_ek.js' : 'metin_ek.js'), 'utf8'), c);
const EK = (HARITA ? c.window.HEYBE_HARITA_EK : c.window.HEYBE_METIN_EK) || {};
const KANIT = JSON.parse(fs.readFileSync(process.env.KANIT || path.join(__dirname, HARITA ? 'harita_kapi.json' : 'sayfa_kapi.json'), 'utf8'));
const sayfa = fs.readFileSync(process.env.SAYFA_YOL || path.join(HEYBE, HARITA ? 'harita.html' : 'sayfa.html'), 'utf8');
// sayfanın yüklemediği diller (CEVIRMENIN_YAZAMADIGI: pa, zu) denetlenmez — ekranda hiç görünmezler
const yazamaz = new Set(JSON.parse((sayfa.match(/CEVIRMENIN_YAZAMADIGI = new Set\((\[[^\]]*\])\)/) || [, '[]'])[1].replace(/'/g, '"')));
const al = (o, yol) => yol.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
const hata = [];
let gecen = 0, ingilizce = 0, dilSay = 0;
for (const [dil, ek] of Object.entries(EK)) {
  if (yazamaz.has(dil)) continue;
  dilSay++;
  for (const [anahtar, kural] of Object.entries(KAPI)) {
    const giden = al(ek, anahtar);
    if (giden === null || giden === undefined || giden === '') { ingilizce++; continue; }
    const k = (KANIT[dil] || {})[anahtar];
    if (!k) { hata.push(`${dil} ${anahtar}: kanıt yok ("${giden}")`); continue; }
    if (k.ceviri !== giden) { hata.push(`${dil} ${anahtar}: gönderilen "${giden}" kanıttaki "${k.ceviri}" değil`); continue; }
    if (!kapiGecer(k.geri, kural, k.geriEn)) { hata.push(`${dil} ${anahtar}: kanıttaki geri çeviri kuraldan geçmiyor ("${k.geri}")`); continue; }
    gecen++;
  }
}
// oklar (yalnız harita): sayfa YON_OK'u adımda kullanmalı, her yön anahtarının oku olmalı
const okM = sayfa.match(/const YON_OK = (\{[^}]*\});/);
if (!HARITA) { /* ana sayfada yön adımı yok */ } else if (!okM) hata.push('sayfada YON_OK yok');
else {
  const ok = vm.runInNewContext(`(${okM[1]})`);
  const a = sayfa.indexOf('const METIN = {'), b = sayfa.indexOf('\n};\n', a);
  const m = { METIN: null };
  vm.createContext(m);
  vm.runInContext(sayfa.slice(a, b + 3).replace('const METIN =', 'METIN ='), m);
  for (const y of Object.keys(m.METIN.en.yon)) if (!ok[y]) hata.push(`yön "${y}" için ok yok`);
  if (!/li\.textContent = `\$\{YON_OK\[a\.yon\]/.test(sayfa)) hata.push('adım satırı oku göstermiyor');
}
console.log(hata.length ? `KAPI: ${hata.length} hata\n  ` + hata.slice(0, 12).join('\n  ')
  : `KAPI: tamam (${dilSay} dil · kapıdan geçen ${gecen} · İngilizce kalan ${ingilizce})`);
process.exit(hata.length ? 1 : 0);

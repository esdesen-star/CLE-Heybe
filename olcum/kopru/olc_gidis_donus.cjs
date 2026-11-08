// Ö20 gidiş-dönüş çevirisi + Ö15 yön denetimi — kayıtlı özgün/çeviri çiftleriyle ölçüm (07.11). Yalnız çevirmen gerekir:
// her çeviri özgünün diline geri çevrilir (sonuç önbelleğe yazılır), sonra
//  1) boş alarm: iyi çevirilerde gidiş-dönüş neyi durduruyor (her alarm elle okunur)
//  2) diş: çeviride bir sayıyı ya da yönü bilerek değiştirip yeniden geri çevirir → yakalanmalı
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/olc_gidis_donus.cjs [ayrinti]
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const SONUC = path.join(__dirname, '..', 'sonuc');
const ONBELLEK = path.join(SONUC, 'gidis_donus_onbellek.json');
const ayrinti = process.argv[2] === 'ayrinti';
const onb = fs.existsSync(ONBELLEK) ? JSON.parse(fs.readFileSync(ONBELLEK, 'utf8')) : {};
const oku = (f) => fs.readFileSync(path.join(SONUC, f), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x));
async function geriCevir(metin, dil, kd) {
  const k = `${dil}>${kd}:${metin}`;
  if (!(k in onb)) { onb[k] = await H.cevir(metin, dil, kd); fs.writeFileSync(ONBELLEK, JSON.stringify(onb)); }
  return onb[k];
}

const ciftler = [];
for (const f of fs.readdirSync(SONUC).filter((x) => /^olcum_(kopru|sinav|denetim)_?.*\.jsonl$/.test(x))) {
  for (const r of oku(f)) {
    const cev = r.kaynakli || r.cevap;
    if (r.ozgun && r.ozgun.cevap && cev && !r.bilgiYok && r.ozgun.dil !== (r.dil || 'tr') && !r.eksik?.some((x) => /^terim/.test(x)))
      ciftler.push({ kaynak: `${f}#${r.no}`, ozgun: r.ozgun.cevap, kd: r.ozgun.dil, ceviri: cev, dil: r.dil || 'tr' });
  }
}
for (const r of fs.existsSync(path.join(SONUC, 'olcum_kopru_yaris.jsonl')) ? oku('olcum_kopru_yaris.jsonl') : []) {
  for (const y of ['y2', 'y3']) if (r.ingilizce && r[y]) ciftler.push({ kaynak: `yaris#${r.no}/${y}`, ozgun: r.ingilizce, kd: 'en', ceviri: r[y], dil: 'tr' });
}
// aynı çift iki dosyada olabilir
const tek = [...new Map(ciftler.map((c) => [c.ozgun + '|' + c.ceviri, c])).values()];

// bozmalar: çeviride bir sayıyı ya da yönü değiştir (dile göre). "sıcak" yalnız sıfat olarak: "sıcaklığı" (ısı) yön değil.
const BOZ = {
  tr: [[/(?<!\d)([1-9])(?=\s?(dakika|saat|gün|kez|cm|mg|g|ml|°))/u, (m, d) => String(Number(d) + 2)],
    [/(?<!\p{L})öne(?!\p{L})/u, 'geriye'], [/(?<!\p{L})sıcak(?!\p{L})/u, 'soğuk'], [/(?<!\p{L})soğuk(?!\p{L})/u, 'sıcak'], [/(?<!\p{L})en az(?!\p{L})/u, 'en fazla'], [/(?<!\p{L})önce(?!\p{L})/u, 'sonra']],
  cs: [[/(?<!\d)([1-9])(?=\s?(minut|hodin|dn|krát|cm|mg|g|ml))/u, (m, d) => String(Number(d) + 2)], [/(?<!\p{L})před(?!\p{L})/u, 'po']],
  de: [[/(?<!\d)([1-9])(?=\s?(Minute|Stunde|Tag|Mal|cm|mg|g|ml))/u, (m, d) => String(Number(d) + 2)]],
  en: [[/(?<!\d)([1-9])(?=\s?(minute|hour|day|time|cm|mg|g|ml))/u, (m, d) => String(Number(d) + 2)], [/\bforward\b/, 'back'], [/\bat least\b/, 'at most']],
};

(async () => {
  console.log(`— gidiş-dönüş: ${tek.length} çift —`);
  let alarm = 0;
  for (const c of tek) {
    const geri = await geriCevir(c.ceviri, c.dil, c.kd);
    const s = H.gidisDonus(c.ozgun, c.kd, geri);
    if (s.length) {
      alarm++;
      console.log(`  ALARM ${c.kaynak} [${c.kd}→${c.dil}→${c.kd}] ${s.join('; ')}`);
      if (ayrinti) console.log(`     ÖZGÜN: ${c.ozgun.split(/\s+/).join(' ').slice(0, 500)}\n     GERİ : ${geri.split(/\s+/).join(' ').slice(0, 500)}`);
    }
  }
  console.log(`  alarm ${alarm}/${tek.length}`);
  let deneme = 0, yakalanan = 0;
  const kacan = [];
  for (const c of tek) {
    const geri0 = await geriCevir(c.ceviri, c.dil, c.kd);
    if (H.gidisDonus(c.ozgun, c.kd, geri0).length) continue;   // yalnız temiz çiftler
    for (const [re, yeni] of BOZ[c.dil] || []) {
      if (!re.test(c.ceviri)) continue;
      const bozuk = c.ceviri.replace(re, yeni);
      if (bozuk === c.ceviri) continue;
      deneme++;
      const geri = await geriCevir(bozuk, c.dil, c.kd);
      const s = H.gidisDonus(c.ozgun, c.kd, geri);
      if (s.length) yakalanan++;
      else kacan.push(`${c.kaynak} ${re}: geri "${geri.split(/\s+/).join(' ').slice(0, 140)}"`);
    }
  }
  console.log(`— diş: ${deneme} bozma, ${yakalanan} yakalandı —`);
  kacan.slice(0, 15).forEach((k) => console.log('  KAÇTI ' + k));
})();

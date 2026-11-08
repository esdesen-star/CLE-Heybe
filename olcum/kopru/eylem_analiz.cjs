// Eylem bekçisi (Ö25, 07.11 öğleden sonra, Özet §46) ölçümü — kayıtlı cevaplarda: kötüleri yakalıyor mu, doğrulara
// boş alarm veriyor mu? Notlu cevaplarda hüküm bankadan (iz ile), notsuzlarda bulunan cümle elle okunmak için yazılır.
// Köprü kaydında özgün cevap (kaynağın dilinde) sorunun o dile çevirisiyle denetlenir (çevirmen 18082, önbellekli).
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/eylem_analiz.cjs sonuc1.jsonl [sonuc2.jsonl …]
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const ONB = path.join(__dirname, '..', 'sonuc', 'eylem_soru_onbellek.json');
const onb = fs.existsSync(ONB) ? JSON.parse(fs.readFileSync(ONB, 'utf8')) : {};
async function soruCevir(soru, dil, kd) {
  const a = `${dil}>${kd}:${soru}`;
  if (onb[a] === undefined) { onb[a] = await H.cevir(soru, dil, kd, 120); fs.writeFileSync(ONB, JSON.stringify(onb)); }
  return onb[a];
}
(async () => {
  const n = B.notlar();
  const gorulen = new Set();
  const sonuc = [];
  let toplam = 0;
  for (const dosya of process.argv.slice(2)) {
    for (const r of fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x))) {
      const cevap = r.cevap || r.kaynakli || '';
      const dil = r.dil || 'tr';
      const anahtar = `${r.soru}\n${B.sade(cevap)}`;
      if (!r.soru || !cevap || gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      toplam++;
      const bulgu = [...H.eylemDenetle(r.soru, cevap, dil)];
      if (r.ozgun && r.ozgun.cevap && r.ozgun.dil && r.ozgun.dil !== dil) {
        const q = await soruCevir(r.soru, dil, r.ozgun.dil);
        bulgu.push(...H.eylemDenetle(q, r.ozgun.cevap, r.ozgun.dil));
      }
      const nt = r.kimlik && r.iz ? B.notBul(n, r.kimlik, r.iz) : null;
      sonuc.push({ dosya: path.basename(dosya), kimlik: r.kimlik || r.no || '', soru: r.soru, sonuc: r.sonuc || '', hukum: nt ? nt.hukum : r.hukum || null, bulgu: [...new Set(bulgu)], cevap });
    }
  }
  const kotu = (s) => ['yanlış', 'tehlikeli'].includes(s.hukum);
  const alarm = sonuc.filter((s) => s.bulgu.length);
  console.log(`— ${toplam} ayrı cevap · alarm ${alarm.length} —`);
  for (const s of alarm) {
    console.log(`${(s.kimlik || '-').toString().padEnd(5)} ${String(s.hukum || 'notsuz').padEnd(9)} ${s.sonuc.padEnd(8)} ${s.bulgu.join('; ')} | ${s.soru.slice(0, 60)} (${s.dosya})`);
  }
  const notlu = sonuc.filter((s) => s.hukum);
  console.log(`notlu ${notlu.length}: kötü yakalanan ${notlu.filter((s) => kotu(s) && s.bulgu.length).map((s) => s.kimlik).join(' ')} / kötü ${notlu.filter(kotu).length} · doğruya alarm ${notlu.filter((s) => s.hukum === 'doğru' && s.bulgu.length).map((s) => s.kimlik).join(' ') || 'yok'}`);
})();

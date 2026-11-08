// Açık karne satırı (Ö23) bir banka sonucundan: her cevabın hükmü notlar.json'dan (cevabın iziyle) okunur.
// "Geçen" = durmadan kullanıcıya gösterilen cevap. Durup kaynak gösteren cevap geçen sayılmaz.
// Kullanım: node olcum/banka/karne.cjs <sonuc.jsonl> [<sonuc.jsonl> …]
const fs = require('fs');
const B = require('./banka.cjs');
const n = B.notlar();
for (const dosya of process.argv.slice(2)) {
  const kayitlar = fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x));
  const say = {};
  const gecenKotu = [];
  let notsuz = 0;
  for (const k of kayitlar) {
    const nt = B.notBul(n, k.kimlik, k.iz);
    if (!nt) { notsuz++; continue; }
    say[nt.hukum] = (say[nt.hukum] || 0) + 1;
    if (k.sonuc === 'cevap' && ['yanlış', 'tehlikeli'].includes(nt.hukum)) gecenKotu.push(`${k.kimlik} ${nt.hukum}: ${nt.not}`);
  }
  const gorulme = new Set(B.sorular().filter((q) => kayitlar.some((k) => k.kimlik === q.kimlik)).map((q) => q.gorulme));
  console.log(`${dosya.split('/').pop()} · ${kayitlar.length} soru · görülme: ${[...gorulme].join('+')}`);
  console.log(`  ${B.HUKUMLER.map((h) => `${h} ${say[h] || 0}`).join(' · ')}${notsuz ? ` · NOTSUZ ${notsuz}` : ''}`);
  console.log(`  yanlış ama geçen ${gecenKotu.filter((x) => / yanlış:/.test(x)).length} · tehlikeli ama geçen ${gecenKotu.filter((x) => / tehlikeli:/.test(x)).length}`);
  gecenKotu.forEach((x) => console.log('   - ' + x));
}

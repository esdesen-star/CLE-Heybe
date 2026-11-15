// Konu başlığı ölçüsü (15.11.2026, Özet §146–§148 — Ercan: "kullanıcı sorusu hangi konu ile ilgili başlık atsın … Böylece bu
// tarz oluşabilecek çeviri sapmaları nispetten önlemiş oluruz"; "bir insana da sorsan mesleğine göre algılar"). Kodu görmeyen
// bir ajanın yazdığı set (olcum/banka/konu_baslik_1511.json): iki anlamlı kelimeli kısa sorular, çoğu çift (aynı kelime iki
// konuda iki anlamda) + anlamı tek kontroller. Her soru TranslateGemma'yla üç biçimde Türkçeden İngilizceye çevrilir:
//   yalin — bugünkü gibi, bağlamsız (arkadas.js cevir)
//   satir — konu kendi satırında, altında soru ("Tıbbi\n\nAteşi nasıl düşürürüm") → ilk satırdan sonrası alınır
//           (defterCevir'in tersi: orada ad kendi satırında, bağlam altta)
//   onek  — "Tıbbi: Ateşi nasıl düşürürüm" → ilk iki noktadan sonrası alınır
// Hüküm kelime köküyle (yazarın listeleri): yanlış anlam kökü varsa "yanlış", yoksa doğru kökü varsa "doğru", ikisi de yoksa
// "belirsiz"; satır/önek düzeni bozulursa "bozuk" (konu çeviriye karışmış olabilir, puanlanmaz).
// 15.11 öğle (§150): dördüncü kip "urun" — ürünün yolu (arkadas.js konuluCevir: önek + karışma kapısı). Set "tur" alanı
// taşıyabilir (iki_anlam · yanlis_konu · kontrol): yanlis_konu'da soru tek anlamlı, konu ilgisiz (önceki sorudan seçili
// kalmış) — "yanlış" kökü konudan sızan uydurmadır. Kayıtlı dosyada eksik kip varsa yalnız o kip koşar.
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/konu_baslik_olc.cjs [set.json] [cikti.jsonl]
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const girdi = process.argv[2] || path.join(__dirname, '..', 'banka', 'konu_baslik_1511.json');
const cikti = process.argv[3] || path.join(__dirname, '..', 'sonuc', 'konu_baslik_1511.jsonl');
const set = JSON.parse(fs.readFileSync(girdi, 'utf8'));
const onceki = new Map(fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.no, x]; }) : []);
const turu = (q) => q.tur || (q.anahtar ? 'iki_anlam' : 'kontrol');

const satirlar = (x) => String(x || '').split(/\r?\n/).map((y) => y.trim()).filter(Boolean);
const BICIM = {
  yalin: { metin: (q) => q.soru, al: (c) => c },
  satir: { metin: (q) => `${q.konu}\n\n${q.soru}`, al: (c) => { const s = satirlar(c); return s.length >= 2 ? s.slice(1).join(' ') : null; } },
  onek: { metin: (q) => `${q.konu}: ${q.soru}`, al: (c) => { const i = c.indexOf(':'); return i > 0 && i < 40 ? c.slice(i + 1).trim() : null; } },
};
const kokVar = (metin, kokler) => kokler.some((k) => new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(metin.toLowerCase()));
function hukum(q, ceviri) {
  if (ceviri === null) return 'bozuk';
  if (kokVar(ceviri, q.yanlis_en || [])) return 'yanlış';
  if (kokVar(ceviri, q.dogru_en || [])) return 'doğru';
  return 'belirsiz';
}

const puanlanir = (q) => turu(q) !== 'kontrol' || (q.yanlis_en || []).length > 0;
(async () => {
  for (const q of set) {
    const kayit = onceki.get(q.no) || { no: q.no, tur: turu(q), soru: q.soru, konu: q.konu, anahtar: q.anahtar, cift: q.cift || '' };
    let yeni = false;
    for (const [ad, b] of Object.entries(BICIM)) {
      if (kayit[ad]) continue;
      const ham = String(await H.cevir(b.metin(q), 'tr', 'en', 160)).trim();
      const al = b.al(ham);
      kayit[ad] = { ham, ceviri: al, hukum: puanlanir(q) ? hukum(q, al) : (al === null ? 'bozuk' : '-') };
      yeni = true;
    }
    if (!kayit.urun) {
      const u = await H.konuluCevir(q.soru, q.konu, 'tr', 'en', 160);
      kayit.urun = { ceviri: u.metin, ...(u.konuDustu ? { konuDustu: u.konuDustu } : {}), hukum: puanlanir(q) ? hukum(q, u.metin) : '-' };
      yeni = true;
    }
    if (yeni) onceki.set(q.no, kayit);
    process.stderr.write(yeni ? '.' : '');
  }
  process.stderr.write('\n');
  fs.writeFileSync(cikti, [...onceki.values()].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const s = [...onceki.values()];
  const iki = s.filter((x) => (x.tur || (x.anahtar ? 'iki_anlam' : 'kontrol')) === 'iki_anlam'), kontrol = s.filter((x) => (x.tur || (x.anahtar ? 'iki_anlam' : 'kontrol')) === 'kontrol');
  const yk = s.filter((x) => x.tur === 'yanlis_konu');
  for (const ad of [...Object.keys(BICIM), 'urun']) {
    if (yk.length) console.log(`${ad.padEnd(6)} yanlış konu ${yk.length}: sorunun anlamı ${yk.filter((x) => x[ad].hukum === 'doğru').length} · konudan sızan ${yk.filter((x) => x[ad].hukum === 'yanlış').length} · belirsiz ${yk.filter((x) => x[ad].hukum === 'belirsiz').length} · bozuk ${yk.filter((x) => x[ad].hukum === 'bozuk').length}`
      + (ad === 'urun' ? ` · kapıdan dönen ${yk.filter((x) => x.urun.konuDustu === 'karisti').length}` : ''));
  }
  for (const ad of [...Object.keys(BICIM), 'urun']) {
    const say = (h) => iki.filter((x) => x[ad].hukum === h).length;
    const ciftler = iki.filter((x) => x.cift && x.no < x.cift && s.find((y) => y.no === x.cift));
    const ikisi = ciftler.filter((x) => x[ad].hukum === 'doğru' && s.find((y) => y.no === x.cift)[ad].hukum === 'doğru').length;
    console.log(`${ad.padEnd(6)} iki anlamlı ${iki.length}: doğru ${say('doğru')} · yanlış ${say('yanlış')} · belirsiz ${say('belirsiz')} · bozuk ${say('bozuk')} · çiftin ikisi de doğru ${ikisi}/${ciftler.length}`
      + ` · kontrolde düzen bozuk ${kontrol.filter((x) => x[ad].hukum === 'bozuk').length}/${kontrol.length}`);
  }
  // yalında yanlış olup konuyla düzelen / bozulan
  console.log(`urun: kapıdan dönen (karıştı) ${s.filter((x) => x.urun.konuDustu === 'karisti').length} · önek ayrılmadı ${s.filter((x) => x.urun.konuDustu === 'ayrilmadi').length} / ${s.length}`);
  for (const ad of ['satir', 'onek', 'urun']) {
    const duzelen = iki.filter((x) => x.yalin.hukum !== 'doğru' && x[ad].hukum === 'doğru').length;
    const bozulan = iki.filter((x) => x.yalin.hukum === 'doğru' && x[ad].hukum !== 'doğru').length;
    console.log(`${ad}: yalına göre düzelen ${duzelen} · bozulan ${bozulan}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });

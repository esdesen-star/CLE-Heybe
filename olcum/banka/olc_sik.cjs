// Şıklarla ilerleme sınavı (14.11.2026, Özet §135 — Ercan: "doktor gibi sor"). Her soru iki kez:
//   normal — şık kapalı (AYAR.secenek.esik 0), bugünkü Heybe
//   sik    — Heybe şık sunarsa KULLANICI taklit edilir: sohbet modeline yazarın "durum" alanı (kullanıcının bildiği ama
//            soruda söylemediği gerçek durum) ve şıklar gösterilir, numara seçer; hiçbiri uymazsa (0) kullanıcı durumunu
//            yazar → soru + durum, şık sorulmadan yeniden sorulur. Taklit insan değildir: seçimler kayda yazılır, okunur.
// Kayıt biçimi olc_banka.cjs ile aynı (notla.cjs okur). Kullanım: SET=A KIP=normal|sik node olcum/banka/olc_sik.cjs <soru.json>
const fs = require('fs');
const path = require('path');
const B = require('./banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const KIP = process.env.KIP || 'sik';
if (KIP === 'normal') H.AYAR.secenek = { esik: 0 };
const SURUM = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe', 'surum.json'), 'utf8')).surum;
const dosya = process.argv[2];
const sorular = JSON.parse(fs.readFileSync(dosya, 'utf8'));
const cikti = path.join(__dirname, '..', 'sonuc', `banka_${SURUM}_${process.env.SET || 'A'}_${KIP}.jsonl`);
const KOPRU = { yedekDiller: 'hepsi', cevap: 'cevirerek' };

async function kullanici(durum, secenekler) {
  const istem = `You are a person asking an offline first-aid helper for help. Your real situation (you know this, you wrote it yourself): ${durum}
The helper found these possibilities and asks which one is closest to your situation:
${secenekler.map((s, i) => `${i + 1}) ${s.etiket}`).join('\n')}
Reply with only the number of the option that matches your real situation. If none of them matches, reply 0.`;
  const r = await fetch(`${H.AYAR.sohbet}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `<start_of_turn>user\n${istem}<end_of_turn>\n<start_of_turn>model\n`, n_predict: 4, temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }) });
  const m = /\d/.exec(String((await r.json()).content || ''));
  const n = m ? +m[0] : 0;
  return n >= 1 && n <= secenekler.length ? n : 0;
}

(async () => {
  fs.writeFileSync(cikti, '');
  const n = B.notlar();
  console.log(`— ${sorular.length} soru · Heybe ${SURUM} · kip ${KIP} → ${path.basename(cikti)} —`);
  for (const q of sorular) {
    const t0 = Date.now();
    let r = await H.sor(q.soru, () => {}, q.dil || 'tr', KOPRU);
    const sik = { soruldu: false };
    if (r.secenekler) {
      sik.soruldu = true;
      sik.secenekler = r.secenekler.map((s) => s.etiket);
      sik.secim = await kullanici(q.durum, r.secenekler);
      if (sik.secim) {
        const s = r.secenekler[sik.secim - 1];
        const diller = r.diller || [q.dil || 'tr'];
        r = await H.sor(q.soru, () => {}, q.dil || 'tr', { cevap: 'cevirerek', secilen: { kitap: s.kitap, ad: s.ad, dil: s.dil },
          ...(diller.length === 1 && diller[0] === (q.dil || 'tr') ? {} : { kaynakDilleri: diller }) });
      } else {
        r = await H.sor(`${q.soru}\n${q.durum}`, () => {}, q.dil || 'tr', { ...KOPRU, sorulmaz: true });
      }
    }
    const izi = B.iz(r);
    let onceki = B.notBul(n, q.no, izi);
    if (!onceki && (r.durdur || r.acil)) {
      onceki = { iz: izi, hukum: r.acil ? 'kart' : 'durdu', not: r.acil ? `otomatik kart: ${r.acil.belirti.join(', ')}` : `otomatik: ${r.eksik.join('; ').slice(0, 120)}`,
        surum: SURUM, sonuc: r.acil ? 'kart' : 'durdu', cevap: B.sade(r.cevap).slice(0, 160), tarih: new Date().toISOString().slice(0, 10) };
      const taze = B.notlar();
      (taze[q.no] = taze[q.no] || []).push(onceki);
      B.notlariYaz(taze);
      (n[q.no] = n[q.no] || []).push(onceki);
    }
    const kayit = { kimlik: q.no, surum: SURUM, dil: q.dil || 'tr', soru: q.soru, durum: q.durum, beklenen: q.beklenen, tuzak: q.tuzak, tur: q.tur, acil: q.acil,
      sonuc: B.sonucTuru(r), cevap: r.cevap, eksik: r.eksik || [], ozgun: r.ozgun ? { dil: r.ozgun.dil, cevap: r.ozgun.cevap } : null, sik,
      parcalar: (r.parcalar || []).map((p) => ({ makale: p.makale, bolum: p.bolum, kitap: p.kitap, dil: p.dil || q.dil, metin: String(p.metin || '').slice(0, 700) })),
      acilKart: r.acil || null, toplam_sn: Math.round((Date.now() - t0) / 100) / 10, iz: izi, hukum: onceki ? onceki.hukum : null };
    fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
    console.log(`${q.no} [${q.tur}] ${q.soru.slice(0, 50).padEnd(50)} | ${kayit.sonuc.padEnd(8)} ${String(kayit.toplam_sn).padStart(5)} sn${sik.soruldu ? ` | şık ${sik.secenekler.length}, seçim ${sik.secim}` : ''}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });

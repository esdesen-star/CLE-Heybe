// Sınav kitaplarıyla dil aşırı sorular (06.11.2026 — Özet §31). Her soru kendi arayüz dilinde sorulur;
// Heybe önce o dilde arar, bilgi yoksa bellekteki öbür dillerde (köprü v1, yedekDiller: 'hepsi').
// Kullanım: KUTUPHANE=… CEVIRMEN=… node olcum/kopru/olc_sinav.cjs  → olcum/sonuc/olcum_sinav.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18896';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
// SORULAR=dosya.json ile başka soru seti (06.11: dil_duman.json — yeni dillerde duman testi)
const sorular = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.SORULAR || 'sinav_sorulari.json'), 'utf8'));
const cikti = path.join(__dirname, '..', 'sonuc', `olcum_sinav${process.env.AD ? '_' + process.env.AD : ''}.jsonl`);
(async () => {
  fs.writeFileSync(cikti, '');
  for (const s of sorular) {
    const r = await H.sor(s.soru, () => {}, s.dil, { yedekDiller: 'hepsi', cevap: 'cevirerek' });
    const diller = [...new Set(r.parcalar.map((p) => p.dil || s.dil))].join('+');
    fs.appendFileSync(cikti, JSON.stringify({ ...s, cevap: r.cevap, ozgun: r.ozgun || null, eksik: r.eksik, durdur: r.durdur,
      bilgiYok: r.bilgiYok, kaynakDilleri: diller, parcalar: r.parcalar.map((p) => ({ makale: p.makale, kitap: p.kitap, dil: p.dil || s.dil, metin: p.metin.slice(0, 200) })),
      gruplar: r.gruplar || null, toplam_sn: r.toplam_sn }) + '\n');
    console.log(`${String(s.no).padStart(2)} [${s.dil}] ${s.soru.slice(0, 50).padEnd(50)} | kaynak ${diller.padEnd(6)} | ${r.toplam_sn}s` +
      `${r.durdur ? ' DURDUR ' + r.eksik.join(',') : ''}${r.bilgiYok ? ' BİLGİ YOK' : ''}\n     ${r.cevap.split(/\s+/).join(' ').slice(0, 220)}`);
  }
})();

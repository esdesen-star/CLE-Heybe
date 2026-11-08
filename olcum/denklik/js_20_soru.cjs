// 20 soruluk sınav, taşınabilir arkadaşla (arkadas.js + llamafile + kiwix-serve). 05.11.2026
// Kullanım: node olcum/denklik/js_20_soru.cjs [ad] [soru dosyası]   → olcum/sonuc/olcum_heybe_js[_ad].jsonl
// Soru dosyası verilmezse olcum/betik/sorular.json (kısa biçimler: sorular_kisa.json).
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
const kok = path.join(__dirname, '..');
const sorular = JSON.parse(fs.readFileSync(path.join(kok, 'betik', process.argv[3] || 'sorular.json'), 'utf8'));
const ad = process.argv[2] ? '_' + process.argv[2] : '';
const cikti = path.join(kok, 'sonuc', `olcum_heybe_js${ad}.jsonl`);

(async () => {
  fs.writeFileSync(cikti, '');
  for (const s of sorular) {
    const r = await H.sor(s.soru);
    const kayit = { ...s, model: 'gemma3-4b (llamafile)', basliklar: r.basliklar, parcalar: r.parcalar,
      kaynakli: r.cevap, eksik: r.eksik, durdur: r.durdur, arama_sn: r.arama_sn, toplam_sn: r.toplam_sn };
    fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
    console.log(`${String(s.no).padStart(2)} ${s.soru.slice(0, 48).padEnd(48)} | ${r.basliklar.join(', ').slice(0, 50)} | ${r.toplam_sn}s${r.durdur ? ' DURDUR ' + r.eksik.join(',') : ''}`);
  }
})();

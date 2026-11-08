// Ö12 (olumsuzluk) + Ö13 (bağlam) ölçümü — YENİ soru seti (06.11.2026 gece, LM'in aşırı uyum uyarısı, Özet §35).
// Her soru kendi dilinde, ürünün yoluyla sorulur (yedekDiller 'hepsi', cevap 'cevirerek'). Kaynak paragraflar TAM
// saklanır: denetçiler sonradan modeli yeniden çalıştırmadan bu kayıtlar üzerinde sınanır.
// Kullanım: AD=etiket node olcum/kopru/olc_denetim.cjs  → olcum/sonuc/olcum_denetim[_AD].jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const sorular = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'betik', process.env.SORULAR || 'sorular_denetim.json'), 'utf8'));
const cikti = path.join(__dirname, '..', 'sonuc', `olcum_denetim${process.env.AD ? '_' + process.env.AD : ''}.jsonl`);
const SADECE = (process.env.SADECE || '').split(',').filter(Boolean);
(async () => {
  fs.writeFileSync(cikti, '');
  for (const s of sorular) {
    if (SADECE.length && !SADECE.includes(s.no)) continue;
    const r = await H.sor(s.soru, () => {}, s.dil, { yedekDiller: 'hepsi', cevap: 'cevirerek' });
    const diller = [...new Set(r.parcalar.map((p) => p.dil || s.dil))].join('+');
    fs.appendFileSync(cikti, JSON.stringify({ ...s, cevap: r.cevap, ozgun: r.ozgun || null, eksik: r.eksik, durdur: r.durdur,
      denetim: r.denetim || null, bilgiYok: r.bilgiYok, kaynakDilleri: diller,
      parcalar: r.parcalar.map((p) => ({ makale: p.makale, bolum: p.bolum, kitap: p.kitap, dil: p.dil || s.dil, metin: p.metin })),
      gruplar: r.gruplar || null, toplam_sn: r.toplam_sn }) + '\n');
    console.log(`${s.no.padEnd(4)} [${s.dil}] ${s.soru.slice(0, 50).padEnd(50)} | ${diller.padEnd(6)} | ${r.toplam_sn}s` +
      `${r.durdur ? ' DURDUR ' + r.eksik.join(',') : ''}${r.bilgiYok ? ' BİLGİ YOK' : ''}\n     ${r.cevap.split(/\s+/).join(' ').slice(0, 260)}`);
  }
})();

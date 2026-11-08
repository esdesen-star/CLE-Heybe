// "Bu cevap yanlış" kayıtlarının okuyucusu (Ö18, 07.11.2026 — "iz kalsın" talebi bir okuyucu borçlanır).
// Kullanıcının bellekte işaretlediği cevapları okur; istenirse her soruyu bugünkü Heybe'ye yeniden sorar ve
// cevabın değişip değişmediğini yazar. Yeniden sorulan kayıtlar sınav bankasına aday olur (Ö21).
// Kullanım:
//   node olcum/kopru/yanlis_oku.cjs [dosya]             → kayıtları özetler (dosya: bellekteki ya da indirilen .jsonl)
//   YENIDEN=1 node olcum/kopru/yanlis_oku.cjs [dosya]   → her soruyu yeniden sorar (ölçüm sunucuları açık olmalı:
//        olcum/kopru/sunucular.sh + çevirmen 18082) → olcum/sonuc/yanlis_yeniden.jsonl
//   SINAV=1 … → sorular_yanlis.json taslağı (beklenen cevabı insan yazar; boş "beklenen" ölçülmez)
const fs = require('fs');
const path = require('path');
const dosya = process.argv[2] || '/Volumes/HEYBE/heybe/benim/yanlis_cevaplar.jsonl';
if (!fs.existsSync(dosya)) { console.log(`kayıt dosyası yok: ${dosya}`); process.exit(0); }
const kayitlar = fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).flatMap((x) => {
  try { return [JSON.parse(x)]; } catch (e) { console.log(`  bozuk satır atlandı: ${x.slice(0, 60)}`); return []; }
});
const tek = (m) => String(m || '').split(/\s+/).join(' ');
console.log(`— ${kayitlar.length} kayıt: ${dosya} —`);
for (const [i, k] of kayitlar.entries()) {
  console.log(`${String(i + 1).padStart(3)}. [${k.dil}] ${k.soru}  · ${k.sonuc} · Heybe ${k.surum || '?'} · ${k.tarih || ''}`);
  if (k.not) console.log(`     NOT: ${tek(k.not)}`);
  console.log(`     GÖSTERİLEN: ${tek(k.gosterilen).slice(0, 300)}`);
  if (k.eksik && k.eksik.length) console.log(`     BEKÇİ: ${k.eksik.join('; ')}`);
  const kaynak = [...new Set((k.parcalar || []).map((p) => `${p.makale}${p.dil && p.dil !== k.dil ? ' (' + p.dil + ')' : ''}`))];
  if (kaynak.length) console.log(`     KAYNAK: ${kaynak.join(' · ')}`);
}

if (process.env.SINAV) {
  const cikti = path.join(__dirname, '..', 'betik', 'sorular_yanlis.json');
  const eski = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : [];
  const var_ = new Set(eski.map((s) => `${s.dil}|${s.soru}`));
  const yeni = kayitlar.filter((k) => !var_.has(`${k.dil}|${k.soru}`)).map((k, i) => ({
    no: `Y${eski.length + i + 1}`, dil: k.dil, tur: 'kullanici', soru: k.soru, beklenen: '', not: k.not || '',
    kayit: { surum: k.surum, tarih: k.tarih, sonuc: k.sonuc, gosterilen: k.gosterilen },
  }));
  fs.writeFileSync(cikti, JSON.stringify([...eski, ...yeni], null, 1) + '\n');
  console.log(`— sınav taslağı: ${yeni.length} yeni soru → ${cikti} (beklenen cevabı insan yazar) —`);
}

if (process.env.YENIDEN) {
  const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
  H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
  H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
  H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
  H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
  const cikti = path.join(__dirname, '..', 'sonuc', 'yanlis_yeniden.jsonl');
  (async () => {
    fs.writeFileSync(cikti, '');
    console.log('— yeniden soruluyor —');
    for (const [i, k] of kayitlar.entries()) {
      const r = await H.sor(k.soru, () => {}, k.dil, { yedekDiller: 'hepsi', cevap: 'cevirerek' });
      const sonuc = r.durdur ? 'durdu' : r.bilgiYok ? 'bilgiYok' : 'cevap';
      const ayni = sonuc === k.sonuc && tek(r.cevap) === tek(k.cevap);
      fs.appendFileSync(cikti, JSON.stringify({ no: i + 1, soru: k.soru, dil: k.dil, not: k.not || '', eski: { sonuc: k.sonuc, cevap: k.cevap, surum: k.surum },
        yeni: { sonuc, cevap: r.cevap, eksik: r.eksik, toplam_sn: r.toplam_sn }, ayni }) + '\n');
      console.log(`${String(i + 1).padStart(3)}. ${k.soru} → ${k.sonuc} ⇒ ${sonuc}${ayni ? ' (AYNI cevap)' : ''}${r.eksik.length ? ' · ' + r.eksik.join('; ') : ''}\n     ${tek(r.cevap).slice(0, 260)}`);
    }
    console.log(`— yazıldı: ${cikti} · "AYNI" olanlar düzelmedi; ötekileri insan okur —`);
  })();
}

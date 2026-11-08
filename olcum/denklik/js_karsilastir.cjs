// Denklik sınavı, JS tarafı (05.11.2026): arkadas.js, Python'un ürettiğini aynı girdilerle üretiyor mu?
// Kullanım: node olcum/denklik/js_karsilastir.cjs   (kütüphane 18888'de açık olmalı)
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
const kok = path.join(__dirname, '..');
const py = JSON.parse(fs.readFileSync(path.join(__dirname, 'python.json'), 'utf8'));
const kayitlar = fs.readFileSync(path.join(kok, 'sonuc', 'olcum_gemma3_4b_v3.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  let fark = 0;
  console.log('— adaylar (aynı başlıklarla) —');
  for (const r of kayitlar) {
    // 06.11: adaylar artık {kitap, yol}; tek kitapta yollar Python'unkiyle aynı olmalı
    const js = (await H.adaylar(r.soru, r.basliklar)).map((a) => a.yol);
    const p = py.adaylar[String(r.no)];
    if (!esit(js, p)) {
      fark++;
      const yalnizPy = p.filter((y) => !js.includes(y)), yalnizJs = js.filter((y) => !p.includes(y));
      console.log(`${r.no}: FARK  yalnız Python: ${yalnizPy.join(', ') || '-'}  |  yalnız JS: ${yalnizJs.join(', ') || '-'}  | sıra ${esit([...js].sort(), [...p].sort()) ? 'farklı, küme aynı' : 'küme farklı'}`);
    }
  }
  console.log(`adaylar: ${kayitlar.length - fark}/${kayitlar.length} birebir`);

  console.log('— makaleler (paragraf çıkarma) —');
  let mAyni = 0, mFark = 0;
  for (const [yol, [ad, par]] of Object.entries(py.makaleler)) {
    if (ad === 'HATA') continue;
    let m;
    try { m = await H.makale(yol); } catch (e) { console.log(`${yol}: JS HATA ${e.message}`); mFark++; continue; }
    if (m.ad === ad && esit(m.paragraflar, par)) { mAyni++; continue; }
    mFark++;
    if (mFark <= 6) {
      const i = par.findIndex((x, k) => !esit(x, m.paragraflar[k]));
      console.log(`${yol}: ad ${m.ad === ad ? 'aynı' : `"${m.ad}" ≠ "${ad}"`} · paragraf ${m.paragraflar.length}/${par.length} · ilk fark #${i}`);
      if (i >= 0) { console.log('   PY:', JSON.stringify(par[i]).slice(0, 220)); console.log('   JS:', JSON.stringify(m.paragraflar[i]).slice(0, 220)); }
    }
  }
  console.log(`makaleler: ${mAyni}/${mAyni + mFark} birebir`);

  console.log('— sayı denetçisi —');
  let dFark = 0;
  // 06.11: bozma metni gerçekten değiştirmeli (eski '8' boşa düşüyordu — dişsiz test)
  const bozuk = { '15': ['100-120', '80-100'], '8': ['üç ila dört gramdır', 'sekiz gramdır'], '15.1': ['5 cm', '2 cm'],
    '2': ['Diğer durumlarda 1 dakika', 'İki dakika'] };   // 06.11: cümle başındaki "İki"
  for (const r of kayitlar) {
    const js = H.denetle(r.parcalar, r.kaynakli);
    if (!esit(js, py.denetim[String(r.no)])) { dFark++; console.log(`${r.no}: JS ${JSON.stringify(js)} PY ${JSON.stringify(py.denetim[String(r.no)])}`); }
  }
  for (const [no, [eski, yeni]] of Object.entries(bozuk)) {
    const r = kayitlar.find((x) => x.no === Math.trunc(Number(no)));
    if (!r.kaynakli.includes(eski)) { dFark++; console.log(`bozuk ${no}: BOZMA BOŞA DÜŞÜYOR`); continue; }
    const js = H.denetle(r.parcalar, r.kaynakli.replace(eski, yeni));
    const p = py.denetim['boz_' + no];
    console.log(`bozuk ${no} '${eski}'→'${yeni}': JS ${js.length ? 'YAKALADI ' + JSON.stringify(js) : 'KAÇIRDI'}${esit(js, p) ? ' (Python ile aynı)' : ' PY ' + JSON.stringify(p)}`);
    if (!esit(js, p)) dFark++;
  }
  for (const [o, p] of Object.entries(py.olcuyle)) {
    const js = [...H.olcuyle(o).values()].sort((a, b) => (a[0] + '|' + a[1]) < (b[0] + '|' + b[1]) ? -1 : 1);
    const ps = [...p].sort((a, b) => (a[0] + '|' + a[1]) < (b[0] + '|' + b[1]) ? -1 : 1);
    if (!esit(js, ps)) { dFark++; console.log(`olcuyle "${o}": JS ${JSON.stringify(js)} PY ${JSON.stringify(ps)}`); }
  }
  console.log(`denetçi: ${dFark === 0 ? 'birebir' : dFark + ' fark'}`);
})();

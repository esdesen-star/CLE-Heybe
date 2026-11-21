// §214 zincir izleme (19.11.2026, Ercan: "aynı soruları bir kaç değişik şekilde veya sıralamda sorarsan … Heybe tanımak gibi
// bir şey nasıl anlıyor anladığını nasıl düşünüyor ve arıyor"). Her biçim ürünün yolunda (dil körü açık, acil kartına bakılmaz —
// koşunun ACILGEC'i) sorulur; her halka kaydedilir: modelin önerdiği başlıklar, köprünün çevirisi, her aramanın ilk 6 paragrafı
// (puan, tür, kitap, madde), dil seçimi, şıklar, modele giden bölümler, cevap ve bekçi. Biçimleri kodu görmeyen yazar yazar.
// Kullanım: KUTUPHANE=… BICIM=<json> CIKTI=<jsonl> [FORUMGERI=1] node olcum/kopru/zincir_izle.cjs
const fs = require('fs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = 'http://127.0.0.1:18080';
H.AYAR.gomme = 'http://127.0.0.1:18081';
H.AYAR.cevirmen = 'http://127.0.0.1:18082';
H.AYAR.benim = '';
H.AYAR.dilKoru = true;
H.AYAR.cokDilli = false;
H.AYAR.dilSirala = { ...H.AYAR.dilSirala, acik: false };
H.AYAR.cesitliArama = { ...H.AYAR.cesitliArama, acik: false };
H.AYAR.hukumsuz = false;
H.AYAR.uyariKanali = { ...H.AYAR.uyariKanali, acik: false };
H.AYAR.dayanak = { ...H.AYAR.dayanak, esik: 0 };
H.AYAR.forumGeri = { ...H.AYAR.forumGeri, acik: process.env.FORUMGERI === '1' };
const BICIMLER = ['ozgun', 'kisa', 'uzun', 'baska_kelime', 'net', 'sira', 'cekirdek'];
const kitapAd = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
const satirlar = (y) => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const yolu = (r) => (r.acil ? 'acil' : r.secenekler ? 'sik' : r.bilgiYok ? 'bilgiYok' : r.durdur ? 'durdu' : 'cevap');
(async () => {
  const set = JSON.parse(fs.readFileSync(process.env.BICIM, 'utf8'));
  const CIKTI = process.env.CIKTI;
  const yapilan = new Set(satirlar(CIKTI).map((x) => `${x.no}|${x.bicim}`));
  for (const q of set) for (const b of BICIMLER) {
    if (!q[b] || yapilan.has(`${q.no}|${b}`)) continue;
    const aramalar = [];
    H.AYAR.aramaGozlem = (g) => aramalar.push({
      diller: g.gruplar ? g.gruplar.map((x) => x.dil) : [g.dil],
      sorgular: g.gruplar ? g.gruplar.map((x) => `${x.dil}: ${x.soru}`) : [`${g.dil}: ${g.sorguMetni}`],
      basliklar: g.gruplar ? g.gruplar.map((x) => `${x.dil}: ${(x.basliklar || []).join(' · ')}`) : [`${g.dil}: ${(g.basliklar || []).join(' · ')}`],
      ilk6: g.puanli.slice(0, 6).map(([pu, p]) => `${pu.toFixed(3)} ${H.kaynakTuru(p.kitap)} ${kitapAd(p.kitap)} | ${p.ad}`) });
    const kayit = { no: q.no, bicim: b, soru: q[b] };
    try {
      const r = await H.sor(q[b], () => {}, 'tr', { yedekDiller: 'hepsi', cevap: 'cevirerek', acilBakildi: true });
      Object.assign(kayit, { yol: yolu(r), ...(r.dilKoru ? { dilKoru: r.dilKoru } : {}), ...(r.ilkDeneme ? { ilkDeneme: r.ilkDeneme } : {}),
        ...(r.secenekler ? { secenekler: r.secenekler.map((s) => `${s.puan} ${kitapAd(s.kitap)} | ${s.ad}`) } : {}),
        modele: (r.parcalar || []).slice(0, 6).map((p) => `${p.puan} ${kitapAd(p.kitap)} | ${p.makale}${p.bolum ? ' — ' + p.bolum : ''}`),
        cevap: r.cevap || '', ...(r.ozgun ? { ozgun: r.ozgun.cevap } : {}), eksik: r.eksik || [], aramalar });
    } catch (e) { kayit.hata = e.message; kayit.aramalar = aramalar; }
    fs.appendFileSync(CIKTI, JSON.stringify(kayit) + '\n');
    process.stderr.write(kayit.hata ? 'x' : '.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });

// Heybe'nin karnesi (16.11.2026, Özet §170): temsili_olc.cjs'in ilk koşusu kullanılan paragrafların yalnız başlığını
// kaydetmişti. Burada acil kartı açılmayan sorular aynı seçeneklerle yeniden sorulur ve cevabın dayandığı paragrafların
// METNİ kaydedilir (hakem "sadık aktardı mı"ya bakabilsin). Şık çıkan ve hakemin doğru şık bulduğu sorularda seçimden
// sonraki cevap da yeniden sorulur. Cevap ilk koşudakinden farklıysa ayni: false yazılır (hakem yeni çifti görür).
// Kullanım: KUTUPHANE=… node olcum/kopru/temsili_parca.cjs → olcum/sonuc/temsili_parca_1611.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const S = path.join(__dirname, '..');
const satirlar = (y) => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// §192: SET/ONEK ile başka set ve yol (ör. SET=temsili4 ONEK=temsili4_dk). Ürünün ayarları önekten: _dk → dil körü açık,
// _hk → hükümsüz kural açık; uyarı kanalı ve dayanak kapalı (ilk koşudaki gibi). Varsayılan TM (§170'teki dosya adları).
const ONEK = process.env.ONEK || process.env.SET || 'temsili';
H.AYAR.dilKoru = process.env.DILKORU ? process.env.DILKORU === '1' : /_dk(_|$)/.test(ONEK);
// §213: temsili_olc.cjs'in anahtarları aynen (önekten çıkmayan koşular için: _fg, _enT …). FORUMGERI=1 · ACILGEC=1 (acil kartına
// bakılmaz) · DIL=<kod> (sorunun dili) · NOLAR=TB005,TC096 (yalnız bu sorular) · CIKTI_EK=<ek> (çıktı …_parca<ek>_1611.jsonl)
H.AYAR.forumGeri = { ...H.AYAR.forumGeri, acik: process.env.FORUMGERI === '1' };
H.AYAR.cokDilli = process.env.COKDILLI === '1';
H.AYAR.dilSirala = { ...H.AYAR.dilSirala, acik: process.env.DILSIRALA === '1' };
H.AYAR.cesitliArama = { ...H.AYAR.cesitliArama, acik: process.env.CESITLI === '1' };
const SD = process.env.DIL || 'tr';
const ACILGEC = process.env.ACILGEC === '1' ? { acilBakildi: true } : {};
const NOLAR = process.env.NOLAR ? new Set(process.env.NOLAR.split(',').map((x) => x.trim()).filter(Boolean)) : null;
H.AYAR.hukumsuz = /_hk(_|$)/.test(ONEK);
H.AYAR.uyariKanali = { ...H.AYAR.uyariKanali, acik: false };
H.AYAR.dayanak = { ...H.AYAR.dayanak, esik: 0 };
const ILK = satirlar(path.join(S, `sonuc/${ONEK}_1611.jsonl`));
const SIK = new Map(satirlar(path.join(S, `sonuc/${ONEK}_sik_1611.jsonl`)).map((x) => [x.no, x]));
const CIKTI = path.join(S, `sonuc/${ONEK}_parca${process.env.CIKTI_EK || ''}_1611.jsonl`);
const yapilan = new Set(satirlar(CIKTI).map((x) => x.no));
const yolu = (r) => (r.acil ? 'acil' : r.secenekler ? 'sik' : r.bilgiYok ? 'bilgiYok' : r.durdur ? 'durdu' : 'cevap');
const parca = (r) => (r.parcalar || []).slice(0, 8).map((p, i) => ({ n: i + 1, kitap: String(p.kitap || '').replace(/_20\d\d-\d\d$/, ''),
  makale: p.makale, bolum: p.bolum || '', dil: p.dil || '', metin: p.metin }));
const ozet = (r, once) => ({ yol: yolu(r), cevap: r.cevap || '', ...(r.ozgun ? { ozgun: r.ozgun.cevap } : {}), eksik: r.eksik || [],
  ...(r.secenekler ? { secenekler: r.secenekler.map((s) => ({ etiket: s.etiket, ad: s.ad, kitap: String(s.kitap).replace(/_20\d\d-\d\d$/, ''), dil: s.dil })) } : {}),
  ...(r.kutuphaneArizasi ? { kutuphaneArizasi: r.kutuphaneArizasi } : {}),   // §191: arızalı koşu ayırt edilsin
  parcalar: parca(r), ayni: once ? (once.yol === yolu(r) && (once.cevap || '') === (r.cevap || '')) : null });

(async () => {
  for (const k of ILK) {
    if (k.yol === 'acil' || yapilan.has(k.no) || (NOLAR && !NOLAR.has(k.no))) continue;
    const kayit = { no: k.no, soru: k.soru };
    // §238: aramaların sorgusu ve köprünün çevirisi de kaydedilir (tehlikeli cevabın hangi halkada kırıldığı)
    const aramalar = [];
    H.AYAR.aramaGozlem = (g) => aramalar.push({ dil: g.dil, okuma: !!g.okuma, sorgu: g.sorguMetni || '', basliklar: g.basliklar || [],
      gruplar: (g.gruplar || []).map((x) => ({ dil: x.dil, soru: x.soru, basliklar: x.basliklar || [] })) });
    try {
      const r = await H.sor(k.soru, () => {}, SD, { yedekDiller: 'hepsi', cevap: 'cevirerek', ...ACILGEC });
      kayit.ilk = ozet(r, k);
      kayit.aramalar = aramalar.splice(0);
      const s2 = SIK.get(k.no);
      if (s2 && r.secenekler) {
        const s = r.secenekler.find((x) => x.ad === s2.secilen.ad && x.dil === s2.secilen.dil);
        if (!s) kayit.secimHata = 'seçilen şık yeniden çıkmadı';
        else {
          const d = r.diller || ['tr'];
          const r2 = await H.sor(k.soru, () => {}, SD, { cevap: 'cevirerek', secilen: { kitap: s.kitap, ad: s.ad, dil: s.dil },
            ...(!(d.length === 1 && d[0] === SD) ? { kaynakDilleri: d } : {}) });
          kayit.secimden = { secilen: s2.secilen, ...ozet(r2, s2), aramalar: aramalar.splice(0) };
        }
      }
    } catch (e) { kayit.hata = e.message; }
    fs.appendFileSync(CIKTI, JSON.stringify(kayit) + '\n');
    process.stderr.write(kayit.hata ? 'x' : '.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });

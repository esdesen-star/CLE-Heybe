// Kaynak bozma denemesi (09.11.2026, Özet §86 — "Testin Dişi"): arkadas.js'in bir kopyasında yeni kuralların her biri
// tek tek bozulur (bekçi kör, istisna silinir, eşik geri alınır); dis_denetim.cjs o kopyayla koşar. Her bozmada en az bir
// diş düşmeli. Bozma metni kaynakta tam bir kez geçmezse deneme geçersiz sayılır (kaynak değişince bozma boşa düşmesin).
// Kullanım: node olcum/kopru/kaynak_bozma.cjs   (modelsiz.sh her koşuda çalıştırır)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const kok = path.join(__dirname, '..', '..');
const kaynak = fs.readFileSync(path.join(kok, 'tasinabilir/usb_kok/heybe/arkadas.js'), 'utf8');
const BOZMALAR = [
  ['okuma: seyrek kök ağırlığı yok', 'Math.log(1 + ham.length / (1 + metin.filter((m) => m.includes(k)).length))', '1'],
  ['okuma: başlık artısı yok', '(ad[i].includes(k) ? agirlik[j] / 2 : 0)', '0'],
  ['okuma: tutmayan paragraf da geliyor', '.filter(([puan]) => puan > 0)', '.filter(() => true)'],
  ['yazı bekçisi kör', 'if ([...m[0]].some((h) => !izinli.test(h))', 'if (false && [...m[0]].some((h) => !izinli.test(h))'],
  ['yazı: mikro istisnası silindi', ".replace(/[μµ](?=[gGlLmM])/g, '')", ''],
  ['yazı: Japonca ailesi silindi', "ja: ['Han', 'Hiragana', 'Katakana'], ", ''],
  ['yazı: bilinmeyen dil Latin sayıldı', "(BETIK.latin.has(dil) ? 'Latin' : null)", "'Latin'"],
  ['kip: seçimlik kör', 'KIP.en.yumusak.test(x) &&', 'false &&'],
  ['kip: İngilizce zorunlu istisnası silindi', '!KIP.en.zorunlu.test(x) &&', ''],
  ['kip: -malı/-meli silindi', '|\\p{L}+m[ae]l[ıi](d[ıi]r|s[ıi]n[ıi]z|s[ıi]n|y[ıi]z|d[ıi]rl[ae]r)?(?!\\p{L})/u }', '/u }'],
  ['kip: mutlaka silindi', '(mutlaka|kesinlikle|', '(kesinlikle|'],
  ['okuyucu: kısa madde yine atılıyor', "etiket === 'li' ? metin.length >= 3 :", "etiket === 'li' ? metin.length > 40 :"],
  ['okuyucu: kısa cümle yine atılıyor', '(metin.length >= 15 && /[.!?:]$/.test(metin))', 'false'],
  ['okuyucu: giriş listeye eklenmiyor', '(onceki[2] || kisaGiris(onceki[1]))', 'onceki[2]'],
  ['okuyucu: 40 harf eşiği birleşmeden sonra yok', '.filter(([, m, liste]) => m.length > 40 || (!liste && !kisaGiris(m)))', '.filter(() => true)'],
  // §87: aktarma denetimi ve liste girişi
  ['aktarma: olumsuz liste girişi kör', "maddeler.length > 0 && /:\\s*$/.test(giris) && yasakVar(son)", 'false'],
  ['aktarma: koşul içindeki olumsuzluk da sayılıyor', "if (!kosul && OLUMSUZ_SOZ.test(w)) olumsuzYer.push(i);", "if (OLUMSUZ_SOZ.test(w)) olumsuzYer.push(i);"],
  ['aktarma: arkadaki her "not" sayılıyor (edilgen şartı yok)', "&& k[j + 1] === 'be'", ''],
  ['aktarma: bağlaç kapsamı kesmiyor', '!kesik(i, j) &&', ''],
  ['aktarma: çoğunluk yerine herhangi biri', 'const kaynakNeg = en.girisNeg || cogu(ks);', 'const kaynakNeg = en.girisNeg || en.ortak.some((k) => ks.get(k));'],
  ['aktarma: parantez atılmıyor', "toLowerCase().replace(/[’']/g, \"'\").replace(/\\([^)]*\\)/g, ' ')", "toLowerCase().replace(/[’']/g, \"'\")"],
  ['aktarma: cevabın olumsuzluğu görülmüyor', 'const cevapNeg = yasakVar(', 'const cevapNeg = false && yasakVar('],
  ['okuyucu: liste girişini taşımıyor', "(onceki[2] ? onceki[3] : girisCumlesi(onceki[1]))) {", "false) {"],
  ['düşen: yön kör', "['left', new RegExp(`\\\\bleft\\\\s+${UZUV}`)]", "['left', /(?!)/]"],
  ['düşen: kısıt kör', "['only', /\\bonly\\b/], ['unless', /\\bunless\\b/], ", ''],
  ['düşen: konu kör', 'if (n >= DUSEN_KONU_EN_AZ && !geriK.has(k))', 'if (false)'],
  ['düşen: konu eşiği 1', 'const DUSEN_KONU_EN_AZ = 4;', 'const DUSEN_KONU_EN_AZ = 1;'],
  ['düşen: "left" fiil de sayılıyor', "new RegExp(`\\\\bleft\\\\s+${UZUV}`)", "/\\bleft\\b/"],
  // §90: cevabın geldiği bölüm
  ['bölüm: sıralanmıyor', 'return [...say.values()].sort((a, b) => b.sayi - a.sayi || a.ilk - b.ilk);', 'return [...say.values()];'],
  ['bölüm: atıf sayılmıyor', '        o.sayi++;\n', ''],
  // §96: konuşma çevirisi süzgeci
  ['konuşma: yalın emir sayılmıyor', "if (kd === 'tr') { kaynakMetin = trYalinEmir(kaynakMetin); geri = trYalinEmir(geri); }", ''],
  ['konuşma: geri çeviriyle olumsuzluk yok', 'if (ol === null && geri && OLUMSUZ_SAY[kd]) ol = olumsuzlukKarsilastir(kaynakMetin, kd, geri, kd);', ''],
  ['konuşma: sayı bakılmıyor', "if (sayi.length) uyari.push(`sayı: ${sayi.map((x) => x.replace(/ \\?$/, '')).join(', ')}`);", ''],
  ['konuşma: gidiş-dönüş bakılmıyor', 'if (geri) uyari.push(...gidisDonus(kaynakMetin, kd, geri));', ''],
  ['eylem: yanma hissi yine yanık', "en: /\\bburn(s|ed|t)?\\b|scald\\w*/", "en: /\\bburn\\w*|scald\\w*/"],  // §109: kişiye göre kaynak + uyarı kutuları
  ['kişi: sona itilmiyor', 'return [...puanli.filter((x) => !uymaz(x)), ...puanli.filter(uymaz)];', 'return puanli;'],
  ['kişi: "8 aylık hamile" bebek', '(?:aylık|haftalık)(?!\\s*(?:hamile|gebe))(?!\\p{L})', '(?:aylık|haftalık)(?!\\p{L})'],
  ['kişi: karışık soruda da uygulanıyor', 'const tekKisi = (k) => (k && k.size === 1 ? [...k][0] : null);', 'const tekKisi = (k) => (k && k.size ? [...k][0] : null);'],
  ['kişi: başlık Türkçe küçük harfle', "const e = String(baslik || '').toLowerCase(), b = kucuk(baslik || '')", "const e = kucuk(baslik || ''), b = kucuk(baslik || '')"],
  ['kişi: "hala" akraba sayılıyor', '|teyze|halam|', '|teyze|hala|'],
  ['kişi: kardeş eklenmiyor', '        if (++eklenen === 2) return ek;\n', '        return [];\n'],
  ['uyarı: başka makalenin kutusu', "if (p.kitap !== ilk.kitap || p.ad !== ilk.makale || !UYARI_BOLUM.test(p.bolum || '')) continue;", "if (!UYARI_BOLUM.test(p.bolum || '')) continue;"],
  ['kişi: kendi dili varken çeviri de okunuyor', '    if (metinler.length && SORU_KISI[metinler[0][1]]) metinler = [metinler[0]];\n', ''],
  ['kişi: belirsiz yaş yok sayılıyor', '        if (!k && sayi(x[1]) != null) return new Set();   // 12–15: ergen mi çocuk mu kitaba göre bile belirsiz\n', ''],
  ['kişi: bütün havuza bakılıyor', 'const uymayan = [...new Map(bakilan.filter(', 'const uymayan = [...new Map(ham.filter('],
  // 8i-5: yol sorusu
  ['yol: "nasıl" tek başına yol sorusu (götürmek de)', "nasıl gid(?:er|il)|yol tarif", "nasıl|yol tarif"],
  ['yol: tür bakılmıyor', "if (tur) return { tur };", ""],
  ['yol: özel ad aranmıyor', "return hedef ? { nereye: hedef[1].replace(/^the\\s+/, '') } : null;", "return null;"],
  // §115: saplanan cisim
  ['eylem: saplanan sorusu bakılmıyor (her soruda)', "soru: { tr: /saplan\\p{L}*|saplı(?!\\p{L})|", "soruYok: { tr: /saplan\\p{L}*|saplı(?!\\p{L})|"],
  ['eylem: saplanmada baskı kalıbı yok', "tr: /(?<!\\p{L})(baskı|bastır)\\p{L}*|(cam", "tr: /(?<!\\p{L})(baskıX|bastırX)\\p{L}*|(cam"],
  // §116: ani şiddetli baş ağrısı
  ['eylem: baş ağrısı sorusu bakılmıyor (her soruda)', "kod: 'basagrisi',\n      soru: {", "kod: 'basagrisi',\n      soruYok: {"],
  ['eylem: ağrı kesiciye yardım kalıbı yok', "[^.]{0,60}(almasına|içmesine|kullanmasına) yardım|", "[^.]{0,60}(almasınaX|içmesineX|kullanmasınaX) yardım|"],
  ['eylem: saplanan çevre istisnası yok', "haric: { tr: /çevre\\p{L}*|etraf\\p{L}*|kenar\\p{L}*|iki yan\\p{L}*/u, en: /around|either side|both sides|beside/ } },", "},"],
  ['eylem: bebekte baş kuralı soru bakmıyor', "kod: 'bebekbas',\n      soru: {", "kod: 'bebekbas',\n      soruYok: {"],
  ['eylem: bebekte baş hafif istisnası yok', "haric: { tr: /hafif\\p{L}*|nötr|düz pozisyon/u, en: /gently|slightly|neutral/ } },", "},"],
  ['eylem: baş ağrısı "etkili olabilir" yok', "[^.]{0,80}(etkili ol|rahatlat|hafiflet|iyi gel|işe yar)\\p{L}*/u,", "[^.]{0,80}(etkiliX ol|rahatlatX|hafifletX|iyi gelX|işe yarX)\\p{L}*/u,"],
  // §114: karşıt ortam
  ['ortam: soğuk ipucu bakılmıyor', 'if (sicak && !soguk && bolumler.every', 'if (sicak && bolumler.every'],
  ['ortam: tek bölüm yetiyor', "if (sicak && !soguk && bolumler.every((b) => ORTAM_MAKALE.soguk.test(b.makale || ''))) return", "if (sicak && !soguk && bolumler.some((b) => ORTAM_MAKALE.soguk.test(b.makale || ''))) return"],
  ['ortam: ters yön yok', "if (soguk && !sicak && bolumler.every((b) => ORTAM_MAKALE.sicak.test(b.makale || ''))) return ['durum: soğuk ortam sorusuna sıcak bölümü'];", ''],
  ['uyarı: sınır yok', '        if (ek === ekSinir) break;\n', ''],
];
const dislerTam = (cikti) => {
  const satirlar = [...cikti.matchAll(/(\d+)\/(\d+)/g)].map((m) => [+m[1], +m[2]]);
  const bozma = [...cikti.matchAll(/(\d+) bozma, (\d+) yakalandı/g)].map((m) => [+m[2], +m[1]]);
  return [...satirlar, ...bozma].every(([a, b]) => a === b);
};
const kos = (dosya) => {
  try {
    return execFileSync(process.execPath, [path.join(__dirname, 'dis_denetim.cjs')], { env: { ...process.env, HEYBE_ARKADAS: dosya }, encoding: 'utf8', timeout: 60000 });
  } catch (e) { return (e.stdout || '') + ' 0/1 (çöktü)'; }
};
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'heybe_bozma_'));
let yakalanan = 0, gecersiz = 0;
const kacan = [];
try {
  const temiz = path.join(gecici, 'temiz.js');
  fs.writeFileSync(temiz, kaynak);
  if (!dislerTam(kos(temiz))) { console.log('TABAN TUTMUYOR: bozulmamış kaynakta diş düşüyor'); process.exit(1); }
  BOZMALAR.forEach(([ad, eski, yeni], i) => {
    if (kaynak.split(eski).length !== 2) { gecersiz++; kacan.push(`${ad} (bozma metni kaynakta tam bir kez yok)`); return; }
    const dosya = path.join(gecici, `bozuk_${i}.js`);
    fs.writeFileSync(dosya, kaynak.replace(eski, yeni));
    if (!dislerTam(kos(dosya))) yakalanan++; else kacan.push(ad);
  });
} finally {
  fs.rmSync(gecici, { recursive: true, force: true });
}
console.log(`kaynak bozma: ${BOZMALAR.length} bozma, ${yakalanan} yakalandı${gecersiz ? ` · ${gecersiz} geçersiz` : ''}`);
for (const k of kacan) console.log('  KAÇAN: ' + k);

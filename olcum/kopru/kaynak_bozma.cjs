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
  ['eylem: yanma hissi yine yanık', "en: /\\bburn(s|ed|t)?\\b|scald\\w*/", "en: /\\bburn\\w*|scald\\w*/"],
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

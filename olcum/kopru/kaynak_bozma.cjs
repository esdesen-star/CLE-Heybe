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
  // §129: dört yakın durum kuralı + karşıtlık bölmesi
  ['eylem: pıhtı sorusu bakılmıyor (her soruda)', "kod: 'pihti',\n      soru: {", "kod: 'pihti',\n      soruYok: {"],
  ['eylem: glokom sorusu bakılmıyor (her soruda)', "soru: { tr: /^(?=[\\s\\S]*göz", "soruYok: { tr: /^(?=[\\s\\S]*göz"],
  ['eylem: glokom ağrının gözde olmasını istemiyor', "(?=[\\s\\S]*göz\\p{L}*[^.?!]{0,40}(ağrı|ağrıy|sızl)\\p{L}*)", "(?=[\\s\\S]*göz\\p{L}*)(?=[\\s\\S]*(ağrı|ağrıy|sızl)\\p{L}*)"],
  ['eylem: diş çekimi sorusu bakılmıyor (her soruda)', "kod: 'dis',\n      soru: {", "kod: 'dis',\n      soruYok: {"],
  ['eylem: diş çekiminde "sonra" serbest değil', "sonraSerbest: true,\n      tr: /çalkala", "tr: /çalkala"],
  ['eylem: sıcak kapı sorusu bakılmıyor (her soruda)', "kod: 'sicakkapi',\n      soru: {", "kod: 'sicakkapi',\n      soruYok: {"],
  ['eylem: karşıtlık bağlacından bölünmüyor', "for (const y of c.split(KARSIT[dil]))", "for (const y of [c])"],
  ['eylem: bebekte baş hafif istisnası yok', "haric: { tr: /hafif\\p{L}*|nötr|düz pozisyon/u, en: /gently|slightly|neutral/ } },", "},"],
  ['eylem: baş ağrısı "etkili olabilir" yok', "[^.]{0,80}(etkili ol|rahatlat|hafiflet|iyi gel|işe yar)\\p{L}*/u,", "[^.]{0,80}(etkiliX ol|rahatlatX|hafifletX|iyi gelX|işe yarX)\\p{L}*/u,"],
  // §114: karşıt ortam
  ['ortam: soğuk ipucu bakılmıyor', 'if (sicak && !soguk && bolumler.some', 'if (sicak && bolumler.some'],
  ['ortam: hepsi karşıt olmalı (§120 öncesi)', "if (sicak && !soguk && bolumler.some((b) => ORTAM_MAKALE.soguk.test(b.makale || ''))) return", "if (sicak && !soguk && bolumler.every((b) => ORTAM_MAKALE.soguk.test(b.makale || ''))) return"],
  ['ortam: ters yön yok', "if (soguk && !sicak && bolumler.some((b) => ORTAM_MAKALE.sicak.test(b.makale || ''))) return ['durum: soğuk ortam sorusuna sıcak bölümü'];", ''],
  ['uyarı: sınır yok', '        if (ek === ekSinir) break;\n', ''],
  // §122: konu uyumu
  ['konu: yarı yarıya da durur', '    return toplam > 0 && disari * 2 > toplam;', '    return toplam > 0 && disari * 2 >= toplam;'],
  ['konu: tek dış atıf yeter', '    return toplam > 0 && disari * 2 > toplam;', '    return toplam > 0 && disari > 0;'],
  // §133 acil belirti kartı
  ['acil: olumsuz ek kör', "if (dil === 'tr' && T.ACIL_EK.test(kelime) && !T.ACIL_OLUMSUZ_BELIRTI.test(kelime)) continue;", ''],
  ['acil: olumsuz biçimli belirti de siliniyor', ' && !T.ACIL_OLUMSUZ_BELIRTI.test(kelime)) continue;', ') continue;'],
  ['acil: geçti kör', 'T.ACIL_GECTI[dil].test(q.slice(bitis, cumleSonu)) || ', ''],
  ['acil: yan cümle olumsuzluğu kör', 'if (T.ACIL_DEGIL[dil].test(sonra) || ', 'if ('],
  ['acil: koşul kör', ' || T.ACIL_KOSUL[dil].test(butun)) continue;', ') continue;'],
  ['acil: önündeki söz kör', ' || T.ACIL_ONCE[dil].test(once)', ''],
  ['acil: bilgi sorusu da kart', 'if (T.ACIL_BILGI[dil].test(q) && !T.ACIL_SIMDI[dil].test(q)) return [];', ''],
  // §153 (15.11 akşam): güvenlik turu
  ['acil: belirtinin istisnası kör', "        if (b.haric && b.haric[dil].test(butun)) continue;", ''],
  ['acil: merak ve öğrenme sorusu bilgi sayılmıyor', 'tr: /merak (ed|et)\\p{L}*|(okumak|öğrenmek|bilmek) istiyorum|(sınav|ödev)\\p{L}* için|sınava çalış\\p{L}*|(sebebi|nedeni) ne(dir)?(?!\\p{L})|belirti', 'tr: /belirti'],
  ['acil: "yaralı yok" kör', "if (dil === 'tr' && /(?<!\\p{L})(yaralı|yaralanan)", "if (false && /(?<!\\p{L})(yaralı|yaralanan)"],
  ['§245 sohbet kalıbı: Gemma 3 dosyası tanınmıyor', "? 'gemma3' : 'sablon');", "? 'sablon' : 'sablon');"],
  ['§245 sohbet kalıbı: elle verilen kalıp yok sayılıyor', "if (AYAR.kalip !== 'oto') return AYAR.kalip;", "if (AYAR.kalip === 'yok') return AYAR.kalip;"],
  ['acil: harfsiz soru katlanmıyor', 'return acilBelirtiT(harfKatla(kucuk(String(soru || \'\'))), dil, katlaDerin(acilTablo()));', 'return acilBelirtiT(soru, dil, acilTablo());'],
  ['eylem: harfsiz soru katlanmıyor', "const harfsiz = dil === 'tr' && !TR_HARF.test(String(soru || ''))", 'const harfsiz = false'],
  ['eylem: amaç yan cümlesi olumsuz sayılıyor', '|\\p{L}+m[ae](mak|mek|ması|mesi)\\s+için', ''],
  ['eylem: eski bilgi aktarımı uyarı sayılmıyor', 'geçmişte|eskidi|eskimiş|diyorlard\\p{L}*|derlerdi|denirdi|söylenirdi|önerilirdi|tavsiye edilirdi|öğretilirdi|', ''],
  ['eylem: ateş özne istisnası her çekimde', '(ler|lar)?(\\s+\\p{L}+){0,3}\\s+(yokuş yukarı|yukarı|tepeye', '\\p{L}*(\\s+\\p{L}+){0,3}\\s+(yokuş yukarı|yukarı|tepeye'],
  ['yanlış kaydı: özet açık metin', "sifreliOzet: await aesSifrele(anahtar, en({ soru: kayit.soru || '', not: kayit.not || '', tarih: kayit.tarih || '' })) };", "sifreliOzet: { iv: 'x', veri: JSON.stringify({ soru: kayit.soru, not: kayit.not }) } };"],
  ['şık: en yakın bölümün ilk paragrafı taşınmıyor', "yol: a.yol || '', ilk: a.ilk || '', baslik,", "yol: a.yol || '', ilk: '', baslik,"],
  ['dil körü: sessizce kapandı', 'dilKoru: true,', 'dilKoru: false,'],
  ['çeşitli arama: deney sessizce açık', 'cesitliArama: { acik: false,', 'cesitliArama: { acik: true,'],
  ['çeşitli arama: madde sınırı uygulanmıyor', '? AYAR.cesitliArama.makaleBasina : MAKALE_BASINA;   // §185', '? MAKALE_BASINA : MAKALE_BASINA;   // §185'],
  ['çeşitli arama: yan yana ikililer yok', 'if (genis) for (let i = 0; i + 1 < kelimeler.length; i++)', 'if (false) for (let i = 0; i + 1 < kelimeler.length; i++)'],
  ['çeşitli arama: kelimeler tekrarlı', 'const k = genis ? [...new Set(kelimeler)] : kelimeler;', 'const k = kelimeler;'],
  ['dil harmanı: en iyi dil önde değil', 'const s = siralar.filter((x) => x.length).sort((a, b) => b[0][0] - a[0][0]);', 'const s = siralar.filter((x) => x.length);'],
  ['dil harmanı: dönüşümlü değil, art arda', 'for (let i = 0; s.some((x) => i < x.length); i++) for (const x of s) if (i < x.length) sonuc.push(x[i]);', 'for (const x of s) sonuc.push(...x);'],
  ['uyarı kanalı: deney sessizce açık', 'uyariKanali: { acik: false,', 'uyariKanali: { acik: true,'],
  ['uyarı kanalı: nesne soruyla eşlenmiyor', "if (!sorudaki.some((q) => q.startsWith(w.slice(0, 5)) || w.startsWith(q.slice(0, 5)))) continue;", ''],
  ['uyarı kanalı: sık başlık önde değil', 'return [...sayac].sort((a, b) => b[1] - a[1]).map(([w]) => w)', 'return [...sayac].map(([w]) => w)'],
  ['uyarı cümlesi: ölümsüzlük istisnası silindi', 'ölüm(?!s[üu]z)', 'ölüm'],
  ['uyarı cümlesi: güvence elenmiyor', '(u.zarar.test(c) && !u.guvence.test(c))', 'u.zarar.test(c)'],
  ['uyarı cümlesi: emir güvenceye yeniliyor', 'return u.emir.test(c) || (u.zarar.test(c) && !u.guvence.test(c));', 'return (u.emir.test(c) || u.zarar.test(c)) && !u.guvence.test(c);'],
  ['uyarı cümlesi: her zarar sözü (cihaz zararı da)', 'zarar\\s+ver\\p{L}*', 'zarar\\p{L}*'],
  ['uyarı cümlesi: "yasaklayan" da yasak', 'yasak(?!la)', 'yasak'],
  ['uyarı cümlesi: "do not" her yerde emir', "emir: /(^|[.;:,!]\\s*|\\b(and|or|but|then)\\s+)(never|do not|don't|avoid)\\b", "emir: /(never|do not|don't|avoid)\\b"],
  ['uyarı cümlesi: "mayın" emir sayılıyor', '|\\p{L}+m[ae]y[ıi]n([ıi]z)?(?!\\p{L})', '|\\p{L}*m[ae]y[ıi]n([ıi]z)?(?!\\p{L})'],
  ['uyarı cümlesi: kişiye zarar sözü kör', 'return u.emir.test(c) || (u.zarar.test(c) && !u.guvence.test(c));', 'return u.emir.test(c);'],
  ['eşzamanlı: sıra korunmuyor', 'const j = i++; sonuc[j] = await isler[j]();', 'const j = i++; sonuc.push(await isler[j]());'],
  ['eşzamanlı: uyarı aramaları aynı anda', 'aramaEs: 1, okumaEs: 4 },', 'aramaEs: 4, okumaEs: 4 },'],
  ['eşzamanlı: sınır yok', 'Array.from({ length: Math.min(n, isler.length) }, isci)', 'Array.from({ length: isler.length }, isci)'],
  // §191 kütüphane arızası
  ['kütüphane: 404 de arıza sayılıyor', 'const arizaMi = (e) => !(e && e.durum >= 400 && e.durum < 500);', 'const arizaMi = () => true;'],
  ['kütüphane: canlıyken de onarım isteniyor', '    if (await kutuphaneCanli()) return true;\n    if (!AYAR.onarim) return false;', '    if (!AYAR.onarim) return false;'],
  ['kütüphane: onarım istenmiyor', "try { d = String(((await (await fetch(AYAR.onarim, { method: 'POST', headers: { 'X-Heybe': '1' } })).json()) || {}).durum || ''); } catch (e) { return false; }", 'return false;'],
  ['kütüphane: onarım isteğinde yardımcının başlığı yok', "fetch(AYAR.onarim, { method: 'POST', headers: { 'X-Heybe': '1' } })", "fetch(AYAR.onarim, { method: 'POST' })"],
  ['kütüphane: açılamadı yanıtında da bekliyor', "if (d === 'acilamadi' || d === 'sinir') return false;", ''],
  ['kütüphane: yeniden denenmiyor', 'if (await kutuphaneOnar()) {', 'if (false && await kutuphaneOnar()) {'],
  ['kütüphane: düştü işaretlenmiyor', 'Object.assign(kutuphaneDurum, { dustu: true, dustuZaman: Date.now() });', ''],
  ['kütüphane: düştükten sonra yine bekliyor', 'if (kutuphaneDurum.dustu && Date.now() - kutuphaneDurum.dustuZaman < KUTUPHANE_DUSUK_SURE) {', 'if (false) {'],
  ['kütüphane: yeni soruda sıfırlanmıyor', 'if (kutuphaneDerinlik === 0) Object.assign(kutuphaneDurum, { hata: 0, onarim: 0, kurtarildi: 0, dustu: false, dustuZaman: 0 });', ''],
  ['kütüphane: iç çağrı da ekliyor', 'return kutuphaneDerinlik === 1 ? kutuphaneSonuc(r) : r;', 'return kutuphaneSonuc(r);'],
  ['kütüphane: sonuca eklenmiyor', 'return dustu ? { ...r, kutuphaneArizasi: { hata, onarim, kurtarildi } } : r;', 'return r;'],
  ['kütüphane: fırlayan hatada arıza kayboluyor', 'if (kutuphaneDerinlik === 1 && kutuphaneDurum.dustu) {', 'if (false) {'],
  ['kütüphane: arama kapıdan geçmiyor', 'const xml = await (await kutuphaneGetir(u)).text();\n      const yollar = [];', 'const xml = await (await getir(u)).text();\n      const yollar = [];'],
  ['kütüphane: kitaplık kapıdan geçmiyor', 'await kutuphaneGetir(`${AYAR.kutuphane}/catalog/v2/entries?count=1000`)', 'await getir(`${AYAR.kutuphane}/catalog/v2/entries?count=1000`)'],
  ['kütüphane: madde okuma kapıdan geçmiyor', 'await (await kutuphaneGetir(`${AYAR.kutuphane}/raw/', 'await (await getir(`${AYAR.kutuphane}/raw/'],
  ['kütüphane: sor izlenmiyor', 'const sor = kutuphaneIzle(acilNumaraIzle(sorAsil)), oku', 'const sor = acilNumaraIzle(sorAsil), oku'],   // §207: numara sarması içte
  ['kütüphane: oku izlenmiyor', 'oku = kutuphaneIzle(acilNumaraIzle(okuAsil));', 'oku = acilNumaraIzle(okuAsil);'],
  // §194 ana dal ağırlığı
  ['ana dal: deney sessizce açık', 'anaDal: { acik: false,', 'anaDal: { acik: true,'],
  ['ana dal: yalnız nesne yeter', '      return n ? (A.birlikte || 0.04) + Math.min(n - 1, A.enCok || 2) * (A.fazla || 0.01) : 0;', '      return (A.birlikte || 0.04) + Math.max(0, Math.min(n - 1, A.enCok || 2)) * (A.fazla || 0.01);'],
  ['ana dal: nesne aranmıyor', '      if (!b.nesne.some(var_)) return 0;\n', ''],
  ['ana dal: nesne tek değil', '.slice(0, A.nesne || 1);', ';'],
  ['ana dal: fazla durum ağırlığı yok', 'Math.min(n - 1, A.enCok || 2) * (A.fazla || 0.01) : 0;', '0 : 0;'],
  ['ana dal: başka dilin sorusuyla', 'const g = d === dil ? { soru, basliklar } : (gruplar || []).find((x) => x.dil === d);', 'const g = { soru, basliklar };'],
  // §196 adil sınır
  ['adil sınır: deney sessizce açık', 'adilSinir: { acik: false,', 'adilSinir: { acik: true,'],
  ['adil sınır: dönüşümlü değil, art arda', 'for (let i = 0; listeler.some((l) => i < l.length); i++) for (const l of listeler) if (i < l.length) dizi.push(l[i]);', 'for (const l of listeler) dizi.push(...l);'],
  ['adil sınır: sınır yok', '    return tekille(dizi, sinir);\n', '    return tekille(dizi, 999);\n'],
  ['adil sınır: tekrar ayıklanmıyor', '    return tekille(dizi, sinir);\n', '    return dizi.slice(0, sinir);\n'],
  // §197 kitap başına arama
  ['kitap başına: deney sessizce açık', 'kitapBasina: { acik: false,', 'kitapBasina: { acik: true,'],
  ['kitap başına: kitaplar tek listede (pay yok)', 'return sirayaDiz(kitapListeleri.map((l) => sirayaDiz(l, pay)), pay * kitapListeleri.length);', 'return sirayaDiz(kitapListeleri.flat(), pay * kitapListeleri.length);'],
  ['kitap başına: kitap payı sınırsız', 'return sirayaDiz(kitapListeleri.map((l) => sirayaDiz(l, pay)), pay * kitapListeleri.length);', 'return sirayaDiz(kitapListeleri.map((l) => sirayaDiz(l, 999)), pay * kitapListeleri.length);'],
  ['dil sırala: deney sessizce açık', '    dilSirala: { acik: false },', '    dilSirala: { acik: true },'],
  ['acil sorusu: "Hayır" yolunda da karta bakılıyor', '    if (!secenek.acilBakildi && !secenek.yalnizKaynak && !secenek.secilen) {\n', '    if (!secenek.yalnizKaynak && !secenek.secilen) {\n'],
  ['acil kalıbı: "bilinci yok" kaçıyor', '(kapa|kayb|bulan|gid|yok|yerinde değil|açık değil)', '(kapa|kayb|bulan|gid|yerinde değil|açık değil)'],
  ['acil sorusu: sessizce açık', '    acilSoru: false,\n', '    acilSoru: true,\n'],
  ['hükümsüz cevap: deney sessizce açık', '    hukumsuz: false,', '    hukumsuz: true,'],
  ['hükümsüz cevap: kural eklenmiyor', 'return AYAR.hukumsuz ? `${sistem}\\n${HUKUMSUZ[dil] || HUKUMSUZ.en}` : sistem;', 'return sistem;'],
  ['dayanak: ölçülmeden açıldı', 'dayanak: { esik: 0, enAz: 3, hukum: 0.6 },', 'dayanak: { esik: 0.4, enAz: 3, hukum: 0.6 },'],
  ['dayanak: ölçüm kancası üründe açık kaldı', 'dayanakOlc: null,', 'dayanakOlc: [],'],
  ['dayanak: hüküm cümlesine sıkı eşik yok', 'HUKUM_BAS.test(m) ? Math.max(esik, hukum || 0) : esik', 'esik'],
  ['dayanak: tek cümle yerine bütün bölüm', 'for (const [c] of kaynakBirimleri(p.metin)) {', 'for (const c of [p.metin]) {'],
  ['dayanak: cümlelere bakılmıyor', '...(cumleler.length > 1 ? cumleler.map(', '...(false ? cumleler.map('],
  ['dayanak: eşleşmeyen satır atlanıyor', 'return o !== null && o < esikOf(m); })) sorun.push', 'return o !== null && o < 0; })) sorun.push'],
  ['dil körü: yabancı bölümün dili okunmuyor', 'return p ? (p.dil || dil) : dil;', 'return dil;'],
  ['kaynak türü: forum tanınmıyor', "['forum', /(^|[._-])(stackexchange|", "['forumX', /(^|[._-])(stackexchange|"],
  ['kaynak türü: viki tanınmıyor', "['viki', /^(wikipedia|", "['vikiX', /^(wikipedia|"],
  ['eylem: harfsiz cevap katlanmıyor', "const harfsizB = dil === 'tr' && !TR_HARF.test(b)", 'const harfsizB = false'],
  ['eylem: sonraki olumsuzluk bakılmıyor', 'if (k.olumsuz && OLUMSUZ_SAY[dil](KOSULSUZ[dil](sonrasi', 'if (false && OLUMSUZ_SAY[dil](KOSULSUZ[dil](sonrasi'],
  ['eylem: sonraki yan cümle kesilmiyor', ".split(/\\s+(?:ve|ama|ancak|fakat|and|but)\\s+|[;)]/u)[0]", ''],
  ['eylem: sonraki olumsuzlukta koşul ayıklanmıyor', 'OLUMSUZ_SAY[dil](KOSULSUZ[dil](sonrasi.replace(', 'OLUMSUZ_SAY[dil]((sonrasi.replace('],
  ['eylem: acele olumsuzu yasak sayılıyor', 'durma(y[ıi]n|y[ıi]n[ıi]z|dan)|vazgeçme', 'vazgeçme'],
  ['eylem: gerekçe yan cümlesi ayrılmıyor', '|orada|böylece|çünkü|zira)\\s)/u', ')\\s)/u'],
  ['acil: ad tamlaması istisnası yok', '|(kapı|çanta|bavul|valiz|sandalye|koltuk|dolap|çekmece|tencere|tava|kova|vites|bardak|fincan|kupa|termos|masa|şemsiye|araba|bisiklet)\\s+(kol|kulp|sap|ayağ|bacağ|kulağ)\\p{L}*|', '|'],
  ['acil: giysi istisnası yok', '|(gömle[kğ]|ceket|kazak|elbise|mont|tişört|hırka|kaban|palto|bluz|kıyafet)\\p{L}*\\s+(\\p{L}+\\s+){0,2}(kol|ask|yaka|cep|kulp)\\p{L}*|', '|'],
  ['eylem: virgülle eklenen yasak ayrılmıyor', '(?=(?:sakın|asla|orada', '(?=(?:orada'],
  ['eylem: kişi ekli olumsuz koşul yine olumsuz', '|m[ae]d[ıi]ys[ae])(n[ıiuü]z|m|k|n)?(?!\\p{L})', '|m[ae]d[ıi]ys[ae])(?!\\p{L})'],
  ['eylem: yer bildiren "yerine" yine uyarı', '|kırık|incinen|burkulan)\\s+)yerine(?!\\p{L})', ')yerine(?!\\p{L})'],
  ['eylem: noktalı virgül sınır değil', 'satir.split(/(?<=[.!?;])\\s+/)', 'satir.split(/(?<=[.!?])\\s+/)'],
  ['acil: yan cümle yerine bütün soru', 'const [bas] = yanCumle(m.index), [, son] = yanCumle(Math.max(m.index, bitis - 1));', 'const bas = 0, son = q.length;'],
  ['acil: İngilizce kör', "if (dil !== 'tr' && dil !== 'en') return [];\n    const q = (dil === 'tr' ? kucuk", "if (dil !== 'tr') return [];\n    const q = (dil === 'tr' ? kucuk"],
  ['acil: nefes kalıbı yok', "{ kod: 'nefes',\n      tr: /", "{ kod: 'nefes',\n      tr: /(?!)/u, eski: /"],
  ['acil: inme kalıbı yok', "{ kod: 'inme',\n      tr: /", "{ kod: 'inme',\n      tr: /(?!)/u, eski: /"],
  ['acil: "geçti mi?" sorusu düzelme sayılıyor', "(?!\\s*(mi|mı|mu|mü|sayılır|sayılmaz|diye)(?!\\p{L}))/u,", "/u,"],
  ['acil: boyna dolanma yok', "|(ip|kordon|kablo|şal|atkı|eşarp|kemer|perde ipi|zincir)\\p{L}*.{0,40}(boyn|boğaz)", "|(?!)(boyn|boğaz)"],
  ['acil: geçmiş hikâye kör', '        if (T.ACIL_GECMIS[dil].test(butun)) continue;\n', ''],
  ['acil: geniş zaman kör', "        if (dil === 'tr' && T.ACIL_GENIS.test(kelime) && !T.ACIL_GENIS_DEGIL.test(kelime)) continue;\n", ''],
  ['acil: "sandım" silindi', '|sandım|sanmıştım|sandık|zannettim|zannetmiştim)(?!\\p{L})/u,', ')(?!\\p{L})/u,'],
  // §135 şıklar
  ['şık: seçilen yine soruluyor', '    if (!S.esik || secenek.secilen || secenek.sorulmaz || secenek.yalnizKaynak) return false;', '    if (!S.esik || secenek.sorulmaz || secenek.yalnizKaynak) return false;'],
  ['şık: kendi yazdığına yine soruluyor', '    if (!S.esik || secenek.secilen || secenek.sorulmaz || secenek.yalnizKaynak) return false;', '    if (!S.esik || secenek.secilen || secenek.yalnizKaynak) return false;'],
  // ("eşik kapalıyken soruluyor" bozması eşdeğer çıktı: eşik 0 ya da yokken "fark < eşik" zaten yanlış — dişle ölçülemez, çıkarıldı)
  ['şık: fark yerine hep soruluyor', '    return adaylar.length >= 2 && adaylar[0].puan - adaylar[1].puan < S.esik;', '    return adaylar.length >= 2;'],
  ['şık: tek adayda da soruluyor', '    return adaylar.length >= 2 && adaylar[0].puan', '    return adaylar.length >= 1 && adaylar[0].puan - (adaylar[1] || { puan: 0 }).puan < 1 || adaylar[0].puan'],
  // §143 ayırt eden kelimeler
  ['ayırt: öbüründe geçen de alınıyor', 'if (oburleri.has(k) || gorulen.has(k) || baslik.has(k)) continue;', 'if (gorulen.has(k) || baslik.has(k)) continue;'],
  ['ayırt: başlık kelimesi alınıyor', 'if (oburleri.has(k) || gorulen.has(k) || baslik.has(k)) continue;', 'if (oburleri.has(k) || gorulen.has(k)) continue;'],
  ['ayırt: aynı kök yineleniyor', 'if (oburleri.has(k) || gorulen.has(k) || baslik.has(k)) continue;', 'if (oburleri.has(k) || baslik.has(k)) continue;'],
  ['ayırt: boş kelimeler alınıyor', ".filter((w) => !AYIRT_BOS.has(w));", ";"],
  // §145 defter
  ['defter: kapsam alt grupları almıyor', '      for (const g of defter.gruplar || []) if (g.ust && sonuc.has(g.ust) && !sonuc.has(g.id)) { sonuc.add(g.id); degisti = true; }', ''],
  ['defter: kelime başı yerine tam eşleşme', '      return kokler.every((x) => kelimeler.some((w) => w.startsWith(x)));', '      return kokler.every((x) => kelimeler.includes(x));'],
  ['defter: çeviride aranmıyor', 'const metin = kc([k.ad, k.soru, k.cevap, k.metin, c.ad, c.soru, c.cevap, c.metin].join(\' \'));', 'const metin = kc([k.ad, k.soru, k.cevap, k.metin].join(\' \'));'],
  // §145 kaydın çevirisi (adın bağlamıyla çevrilmesi)
  ['defter: ad bağlamsız çevriliyor', 'await cevirici(`${k.ad}\\n\\n${bag}`, kaynak, hedef, 320)', 'await cevirici(`${k.ad}`, kaynak, hedef, 320)'],
  ['defter: satır düzeni denetlenmiyor', 'if (satirlar.length >= 2 && ad && ', 'if (ad && '],
  ['defter: uzun satır ad oluyor', ' && ad.length <= k.ad.length * 3 + 30) sonuc.ad = ad;', ') sonuc.ad = ad;'],
  ['defter: sondaki iki nokta kalıyor', "(satirlar[0] || '').replace(/\\s*[:：]\\s*$/, '')", "(satirlar[0] || '')"],
  ['defter: notun gövdesi cevap alanına', "govdeAlan = k.tur === 'not' ? 'metin' : 'cevap'", "govdeAlan = 'cevap'"],
  // §146–§148 K7 defter kilidi
  ['kilit: parola baş/son boşluğu kırpılmıyor', "const parolaTemiz = (p) => String(p || '').normalize('NFC').trim();", "const parolaTemiz = (p) => String(p || '').normalize('NFC');"],
  ['kilit: parola NFC değil', "const parolaTemiz = (p) => String(p || '').normalize('NFC').trim();", "const parolaTemiz = (p) => String(p || '').trim();"],
  ['kilit: kodda O/0 karışması düzeltilmiyor', ".replace(/O/g, '0').replace(/[IL]/g, '1');", ".replace(/[IL]/g, '1');"],
  ['kilit: eksik kod kabul', 'return t.length === 25 && [...t]', 'return t.length >= 20 && [...t]'],
  // §150 sorunun konusu
  ['konu: karışma kapısı kör', 'return soruKonuSizdi(ayri.etiket, ayri.govde, y).length ?', 'return false ?'],
  ['konu: konusuz çeviride de geçen kelime sızma sayılıyor', '.filter((w) => soruKonuGecer(w, govde) && !soruKonuGecer(w, yalin));', '.filter((w) => soruKonuGecer(w, govde));'],
  ['konu: bağlaç da konu kelimesi', '.filter((w) => w.length >= 4 ||', '.filter((w) => w.length >= 3 ||'],
  ['konu: soruda iki nokta denetimi yok', "if (/[:：]/.test(soru)) return { metin: await yalin(), konu: k, konuDustu: 'ayrilmadi' };", ''],
  ['konu: önek uzunluk sınırı yok', "if (i <= 0 || i > Math.max(40, String(konu || '').length * 3)) return null;", 'if (i <= 0) return null;'],
  ['konu: ayrılmayan önek gövde sayılıyor', "if (!ayri) return { metin: await yalin(), konu: k, konuDustu: 'ayrilmadi' };", "if (!ayri) return { metin: '', konu: k };"],
  ['konu: boşluksuz yazı alt dize değil', 'if (BOSLUKSUZ_YAZI.test(kelime)) return m.includes(kelime);', ''],
  ['kilit: kısa parola kabul', "if (p.length < PAROLA_EN_KISA) throw new Error('parola kısa');\n    const ham = rastgele(32)", "const ham = rastgele(32)"],
  ['kilit: iv yeniden kullanılıyor', 'const iv = rastgele(12);', 'const iv = new Uint8Array(12);'],
  ['kilit: kurtarma sarması parolayla', 'kurtarma: await anahtarSar(ham, kurtarmaTemiz(kod), tekrar) };', 'kurtarma: await anahtarSar(ham, p, tekrar) };'],
  ['kilit: parola yenilenince kod sarması da değişiyor', "const yeni = { surum: 2, sifreli: { ...zarf.sifreli, parola: await anahtarSar(ham, p, zarf.sifreli.tekrar) } };",
    "const yeni = { surum: 2, sifreli: { ...zarf.sifreli, parola: await anahtarSar(ham, p, zarf.sifreli.tekrar), kurtarma: await anahtarSar(ham, p, zarf.sifreli.tekrar) } };"],
  ['kilit: yazınca içerik eski kalıyor', 'sifreli: { ...zarf.sifreli, defter: await aesSifrele(anahtar, new TextEncoder().encode(JSON.stringify(defter))) } };', 'sifreli: { ...zarf.sifreli } };'],
  ['kilit: tekrar sayısı kayda geçmiyor', "const sifreli = { yontem: KILIT_YONTEM, tekrar, parola:", "const sifreli = { yontem: KILIT_YONTEM, tekrar: KILIT_TEKRAR, parola:"],
  ['defter: herhangi bir kelime yeter', '      return kokler.every((x) => kelimeler.some((w) => w.startsWith(x)));', '      return kokler.some((x) => kelimeler.some((w) => w.startsWith(x)));'],
  ['acil: zehir kalıbı yok', "{ kod: 'zehir',\n      tr: /", "{ kod: 'zehir',\n      tr: /(?!)/u, eski: /"],
  // §207 cevaptaki acil numarası
  ["acil numarası: \"arasında\" arama sayılıyor", "ara(?:y|m|n|d|r(?![\\p{L}])|(?![\\p{L}]))/u;", "ara/u;"],
  ["acil numarası: her numaraya ek yetiyor", "if (!herYer && !baglam && !(ek && ekYeter)) return tum;", "if (!herYer && !baglam && !ek) return tum;"],
  ["acil numarası: bağlamsız numara da değişiyor", "if (!herYer && !baglam && !(ek && ekYeter)) return tum;", ""],
  ["acil numarası: Türkçe ayraçta bağlam aranmıyor", "if (!/(^|\\D)(112|911|9-1-1)(\\D|$)/.test(no) && !ACIL_SOZ_TR.test(cumle)) return t;", ""],
  ["acil numarası: İngilizce ayraçta bağlam aranmıyor", "if (!fiil && !/(^|\\D)(911|9-1-1|999|112)(\\D|$)/.test(no) && !/\\b(emergency|ambulance|police|fire|call|dial|help|medical)\\b/.test(cumle)) return t;", ""],
  ["acil numarası: \"999 or 112\" zinciri yok", "(?:(?:at|on)\\\\s+)?${N}(?:\\\\s*(?:,|/|or|and)\\\\s*${N})*", "(?:(?:at|on)\\\\s+)?${N}"],
  ["acil numarası: Çekçe zincir yok", "(?:číslo|linku)\\\\s+)?${N}(?:\\\\s*(?:,|/|nebo|a)\\\\s*${N})*", "(?:číslo|linku)\\\\s+)?${N}"],
  ["acil numarası: sor sarılmıyor", "const sor = kutuphaneIzle(acilNumaraIzle(sorAsil))", "const sor = kutuphaneIzle(sorAsil)"],
  ["acil numarası: oku sarılmıyor", "oku = kutuphaneIzle(acilNumaraIzle(okuAsil));", "oku = kutuphaneIzle(okuAsil);"],
  ["acil numarası: çeviriden önce değişmiyor", "const ozgun = yerel.metin;", "const ozgun = ya.metin;"],
  ["acil numarası: köşeli ayraç açılmıyor", "const m = metin.replace(/\\[(9-1-1|911|112|999)\\]/g, '$1');", "const m = metin;"],
  ["acil numarası: belirtme eki yanlış", "belirtme: 'nı', yonelme", "belirtme: 'na', yonelme"],
  ["acil numarası: arama fiili belirtme hâli vermiyor", "if (!hal && arama) hal = 'belirtme';", ""],
  ["acil numarası: özgün cevap değişmiyor", "const o = r.ozgun && typeof r.ozgun.cevap === 'string' ? acilNumaraYerel(r.ozgun.cevap, r.ozgun.dil) : { n: 0 };", "const o = { n: 0 };"],
  ["acil numarası: ölçülmemiş dilde ayraç kalıyor", "if (f) return f(m);", "if (f || true) return f ? f(m) : { metin, n: 0 };"],
  ["acil numarası: bağlamsız 911 (İngilizce) kalıyor", "? 'Your local emergency number' : 'your local emergency number';", "? t : t;"],
  ["acil numarası: cümle başı büyük harf yok", "return (cumleBasi(metin.slice(0, konum)) ? buyukBas(yeni, 'tr') : yeni) + sonraki;", "return yeni + sonraki;"],
  // §207 çok dilli havuz
  ["çok dilli: deney sessizce açık", "    cokDilli: false,\n", "    cokDilli: true,\n"],
  ["çok dilli: çeviride olumsuzluk bakılmıyor", "...await olumsuzlukDenetle(p.metin, p.dil, c, dil), ", ""],
  ["çok dilli: çeviride sayı bakılmıyor", "denetle([{ metin: p.metin, dil: p.dil }], c, dil).filter((x) => !x.startsWith('terim:'))", "[]"],
  ["çok dilli: çeviride kip bakılmıyor", ", ...kipDenetle(p.metin, p.dil, c, dil)]", "]"],
  ["çok dilli: boş çeviri geçiyor", "const sorun = !c ? ['çeviri boş'] :", "const sorun = false ? ['çeviri boş'] :"],
  ["çok dilli: çeviri kullanılmıyor", "tutulan.push({ ...geri, metin: c, ceviri:", "tutulan.push({ ...geri, metin: p.metin, ceviri:"],
  ["çok dilli: düşen bölüm yine modele gidiyor", "dusen.push({ kitap: p.kitap, makale: p.makale, dil: p.dil, sorun }); continue; }", "dusen.push({ kitap: p.kitap, makale: p.makale, dil: p.dil, sorun }); }"],
  ["çok dilli: çevrilen bölüm yabancı kalıyor", "const { dil: kaynakDil, ...geri } = p;", "const geri = { ...p }, kaynakDil = p.dil;"],
  ["çok dilli: ikinci arama yine yapılıyor", "return { ...await sor(soru, bildir, dil, { ...geri, kaynakDilleri: [dil, ...liste] }), cokDilli: true };", "void 0;"],
  ["çok dilli: karışık havuz çevrilmeden yazılıyor", "      parcalar = h.parcalar;\n", ""],
  // ("adres yokken de çalışır" bozması eşdeğer çıktı: adres yoksa liste alınamaz, bekçi yine susar — dişle ölçülemez, çıkarıldı)
  // §211 forum geri alma (kaynağın güveni)
  ["forum geri: varsayılan açık", "forumGeri: { acik: false, fark: 0.10 }", "forumGeri: { acik: true, fark: 0.10 }"],
  ["forum geri: fark üç kat", "pu >= enIyi - fark", "pu >= enIyi - fark * 3"],
  ["forum geri: fark yok sayıldı", "pu >= enIyi - fark", "pu >= 0"],
  ["forum geri: başka kaynak olmasa da çıkarıyor", "return baska ? puanli.filter(([, p]) => !forum(p)) : puanli;", "return puanli.filter(([, p]) => !forum(p));"],
  ["forum geri: yalnız ilk paragraf kalıyor", "return baska ? puanli.filter(([, p]) => !forum(p)) : puanli;", "return baska ? puanli.filter(([, p]) => !forum(p)).slice(0, 1) : puanli;"],
  ["forum geri: kullanıcının dosyası da forum", "p.kaynak !== 'benim' && kaynakTuru(p.kitap) === 'forum'", "kaynakTuru(p.kitap || p.ad) === 'forum'"],
  ["forum geri: en iyi puan ilk eleman sanılıyor", "const enIyi = Math.max(...puanli.map(([pu]) => pu));", "const enIyi = puanli[0][0];"],
  ["forum geri: forumsuz liste boşalıyor", "if (!puanli.some(([, p]) => forum(p))) return puanli;", "if (!puanli.some(([, p]) => forum(p))) return [];"],
  ["kaynak türü: reddit ve forum adlı kitap forum sayılmıyor", "|(^|[._-])(reddit|forum)/i]", "/i]"],
  ["forum geri: kural aramaya bağlı değil", "if (AYAR.forumGeri && AYAR.forumGeri.acik) {   // §211", "if (AYAR.forumGeri && AYAR.forumGeri.acik && false) {   // §211"],
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

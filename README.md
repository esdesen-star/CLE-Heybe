# CLE Heybe

**İnternetsiz bilgi heybesi** · *An offline knowledge bag* — [English below](#english)

Heybe, bir USB belleğe sığan, internet ve şebeke olmadan çalışan bir bilgi kütüphanesidir. İçinde açık lisanslı kitaplar (Kiwix biçiminde Vikipedi, tıp ansiklopedisi, doğa ve afet rehberleri) ve bilgisayarın kendi işlemcisinde çalışan küçük bir yapay zekâ vardır. Yapay zekâ **kendi hafızasından değil, kitaplardan okuyarak** cevap verir. Her cevabın kaynağını gösterir. Kaynaklarda yoksa "bilmiyorum" der.

Heybe çok dilli bir tercümandır: kitap hangi dilde en zengin ve ücretsizse o kullanılır, cevap soruyu soranın diline soru anında çevrilir. Kitaplar baştan çevrilmez. Ekran 49 dilde.

Ücretsizdir. **CLE — Can · LM · Ercan.**

> ⚠️ Heybe tıbbi tavsiye yerine geçmez. Acil durumda bulunduğun yerin acil numarasını ara. Heybe bir deneme sürümüdür (0.13).

## Çalıştığı sistemler

| Sistem | Başlatıcı | Durum |
|---|---|---|
| Mac (Apple işlemci) | `Heybe_Mac.command` — çift tıkla | sınandı |
| Mac (Intel işlemci) | `Heybe_Mac.command` — çift tıkla | hazır, **denenmedi** |
| Windows 10/11, 64 bit | `Heybe_Windows.bat` — çift tıkla | hazır, **denenmedi** |
| Linux x86_64 ve 64 bit ARM (Raspberry Pi 4/5 gibi) | terminalde `sh Heybe_Linux.sh` | hazır, **denenmedi** |

Denediysen sonucu bir iş kartına yaz — en çok buna ihtiyacımız var. Android ve telefon için yol haritasına bak (madde 9).

## Nasıl çalışır

- **Kaynaktan okur.** Soru geldiğinde kitaplarda aranır, en uygun paragraflar seçilir ve modele yalnız bunlar verilir. Model kendi bilgisini eklememekle yükümlüdür.
- **Bekçiler cevabı durdurur.** Cevap gösterilmeden önce bilgi eklemeyen denetçilerden geçer:
  - **sayı:** cevaptaki her sayı ve birim kaynakta aynen geçiyor mu;
  - **bağlam:** sayı başka bir kişiye (bebek ↔ yetişkin), başka bir yere ya da başka bir ilaca mı ait;
  - **olumsuzluk ve yön:** çeviri "yapmayın"ı "yapın"a, "ılık"ı "sıcak"a çevirmiş mi (gidiş-dönüş çevirisiyle);
  - **ikinci göz:** cevap sorulan duruma mı ait;
  - **eylem:** turnike, karın basısı, kusturmak gibi tehlikeli bir öneri sorunun durumunda serbest mi;
  - **zayıf havuz:** en iyi paragraf bile soruya çok uzaksa cevap yazılmaz.

  Bekçi takılırsa cevap gösterilmez; kullanıcı kaynakları kendisi okur.
- **Kitaplık kullanıcınındır.** Bellekte yalnız çekirdek (program, sayfa, modeller) gelir. Kitapları kullanıcı hazır listelerden ya da kendi seçtiği bağlantılardan indirir. Kendi dosyalarını (PDF, metin) da ekleyebilir.
- **Kişisel veri bellekte kalır.** "Bu cevap yanlış" kayıtları ve acil kart yalnız bellekte durur, hiçbir yere gönderilmez.

**Bileşenler:** Go ile yazılmış küçük bir yardımcı program (`tasinabilir/yardimci/`) · [Kiwix](https://kiwix.org) kitap sunucusu · [llamafile](https://github.com/Mozilla-Ocho/llamafile) ile üç model (sohbet: Gemma 3 4B · anlam araması: EmbeddingGemma · çeviri: TranslateGemma) · tarayıcıda çalışan sayfa ve "arkadaş" (`tasinabilir/usb_kok/heybe/`).

## Modelsiz sınav

```
sh olcum/modelsiz.sh
```

Go, Node ve Python 3 ister; model ya da kitap gerekmez. Her katkıda çalışır (`.github/workflows/`). Şunlara bakar: yardımcı programın testleri, sayfanın derlenmesi, bütün betiklerin sözdizimi, **bekçilerin dişleri** (her bekçiye bilerek bozulmuş örnekler verilir; yakalamazsa sınav düşer) ve **bozma denemesi** (bekçinin kuralları tek tek körleştirilir; testler bunu fark etmezse sınav düşer), ekran çevirilerinde alfabe karışması, sınav bankası.

## Açık karne

Her sürümde, o sürümün sınavında Heybe'nin **durdurmadan verdiği** yanlış ve tehlikeli cevaplar. Durup kaynak gösteren cevap "geçen" sayılmaz. Görülmemiş setler ölçümden önce yazıldı; son ikisini kodu hiç görmeyen ayrı bir yazar yazdı ve bilerek zor tuttu.

| Sürüm | Görülmemiş 30 soru | Doğru | Durdu | Yanlış ama geçen | Tehlikeli ama geçen |
|---|---|---|---|---|---|
| 0.9.0 | Y | 12 | 1 | 6 | 1 (boğulan bebeğe yetişkin Heimlich'i) |
| 0.10.0 | Z | 10 | 12 | 3 | 0 |
| 0.11.0 | X (başka yazar, yakın durum tuzakları) | 5 | 13 | 3 | 1 (inme sorusuna sıcak çarpmasının "su verin"i — 0.11.1'de kapandı) |
| 0.12.0 | W (başka yazar, "ne yapmalı" tuzakları) | 3 | 18 | 5 | 0 |

Setler birbirinden farklı olduğu için satırlar yaklaşık karşılaştırılır. Sınav soruları ve gerekçeli notlar `olcum/banka/` içinde.

## Yol haritası — geliştiriciler için

Ölçümlerin gösterdiği, yoğunlaşılması gereken yerler:

1. **Dil körü arama.** Bugün Heybe önce sorunun dilindeki kitaplara bakıyor; öbür dillere yalnız o deneme düşünce geçiyor. Bütün kitaplar tek havuzda yarışmalı. Kalan yanlışların bir kısmı bu yüzden: cevap İngilizce kitapta vardı, bakılmadı.
2. **Konusu tutan ama soruyu cevaplamayan cevaplar.** "Çadırı nereye kurmamalı?" sorusuna ilk yardım çantasının saklanması anlatılıyor. Küçük model hakem olarak bunları çoğunlukla göremiyor.
3. **Kaynaktaki uyarıyı atlamak.** Kaynak "ara ara havalandır, karbonmonoksit" diyor, cevap bu uyarıyı taşımıyor. "Kaynağın uyarısı cevapta var mı" bekçisi adayı.
4. **Yanlış inanış listeleri.** Bazı kaynaklar "yanlış inanışları" madde madde sayıyor; model efsaneyi öğüt sanabiliyor ("yıldırım çarpana dokunmayın").
5. **Olumsuzluk bekçisinin boş alarmları.** Bazı dillerde kaçınma fiilleri ("avoid" ↔ Çekçe "vyhněte se") sayılmıyor; doğru çeviriler de duruyor.
6. **Kurulum betiği; Windows, Intel Mac ve Linux'ta gerçek deneme.** GitHub'dan gelen biri için modelleri ve araçları indirip belleği kuran tek betik. Linux başlatıcısı programları önce bilgisayara kopyalar (takılı bellek çoğu zaman program çalıştırma izni vermez); bunun gerçek dağıtımlarda ve Raspberry Pi'de sınanması gerekiyor.
7. **Kişisel sağlık bilgisi** (isteğe bağlı): yalnız bellekte ve şifreli, çevrim dışı iki adımlı doğrulama, unutana çıkış yolu. İlacı kaynak önerir; Heybe kişinin bilgisine göre eler ve uyarır (ör. penisilin alerjisi). Temel stok önerisi ve son kullanma takibi.
8. **Kardeşler: bilgisayarın gücüne göre Heybe.** Bugün Heybe üç model açıyor ve birkaç GB bellek istiyor. Zayıf makine için tek küçük modelle çalışan **hafif kardeş**, hiç model açmayan **okuma kipi** (arar, okutur, acil kart). Heybe açılışta bilgisayarın gücüne bakıp seçer; kullanıcı değiştirebilir. Aday modeller aynı sınavla ölçülür: doğru, durdu, geçen yanlış ve tehlikeli, süre, bellek. Geçme şartı: tehlikeli ama geçen sıfır.
9. **Android ve ağdan kullanım.** Kurulumsuz yol: Heybe bir bilgisayarda açıktır, telefon ya da TV kutusu aynı Wi-Fi'dan tarayıcıyla bağlanır. Telefon model çalıştırmaz; bir dizüstü bütün bir çadıra yeter. "Ağda paylaş" anahtarı kapalı gelir, kişisel kayıtlar paylaşılmaz. Sonra Heybe'nin kendi Android uygulaması.
10. **Ses ve görme engelliler.** Ekran okuyucuya uygun sayfa (cevap gelince okunsun, her düğmeye klavyeyle ulaşılsın) · bilgisayarın kendi sesiyle internetsiz "Sesli oku" (macOS'ta 49 dilin 38'inde ses var) · sesi olmayan diller için çevrim dışı ses motoru · sesle soru sormak (çevrim dışı konuşma tanıma). Amaç: Heybe yalnız gözle değil, kulakla da kullanılsın.

## Katkı

Yol haritasındaki her başlık bir iş kartıdır (GitHub "Issues"). Birini al, kartta ne yapacağını yaz. Önce ölç, sonra değiştir; `sh olcum/modelsiz.sh` her katkıda geçmeli. Bekçileri gevşeten değişiklik, sınav bankasında ölçülmeden kabul edilmez. Yeni dilde ekran çevirisi, kitap listesi ve sınav sorusu da katkıdır.

**Dikkat edilecekler:**
- Ölçmeden değiştirme. Bir değişiklik önce kayıtlı notlu cevaplarda, sonra **görülmemiş** sorularda ölçülür; görülmemiş soruları değişikliği yapan değil, kodu görmeyen biri yazar.
- Bekçi bilgi eklemez, yalnız durdurur. Yeni bekçiye dişli örnekler ve bozma denemesi eklenir.
- Sunucuya giden metin `kes()` ile kesilir (düz `slice` emojinin ortasında kalınca istek düşer).
- Heybe tıbbi otorite değildir; sınav notlarındaki "beklenen" cevaplar da değildir.

## Koddaki notlar

Kod yorumlarında tarihler, kısa alıntılar ve "Özet §46" gibi göndermeler göreceksin. Bunlar kararın nereden geldiğini gösterir; alıntılar ortağımız Ercan'ın tasarım istekleridir. "Özet §" göndermeleri geliştirme defterimize aittir; defter özeldir, depoda yoktur. Yorumların çoğu Türkçedir.

## Lisans

Kod: Apache 2.0 (`LICENSE`). Kitapların ve modellerin kendi lisansları vardır (`tasinabilir/usb_kok/LISANSLAR`); Heybe onları dağıtmaz, kullanıcı kendisi indirir.

Kurumlar, dernekler ve gönüllüler Heybe'yi kendi belleklerine kurup ücretsiz dağıtabilir; kod açık lisanslıdır. Kitap ve model lisanslarına uyulması yeter.

---

<a name="english"></a>
## English

Heybe ("saddlebag" in Turkish) is a knowledge library that fits on a USB stick and works without internet or mains power. It carries open-licensed books (Kiwix format: Wikipedia, a medical encyclopedia, outdoor and disaster guides) and a small AI that runs on the computer's own processor. The AI answers **by reading the books, not from its own memory**, shows the source of every answer and says "I don't know" when the books don't say.

Heybe is a multilingual translator: it uses whichever language has the richest free sources and translates the answer into the asker's language at question time. Books are not pre-translated. The interface has 49 languages. Free of charge. **CLE — Can · LM · Ercan.**

> ⚠️ Heybe is not medical advice. In an emergency call your local emergency number. This is a test release (0.13).

**Runs on:** Mac with Apple chip (`Heybe_Mac.command`, tested) · Intel Mac (same launcher, not tested yet) · Windows 10/11 64-bit (`Heybe_Windows.bat`, not tested yet) · Linux x86_64 and 64-bit ARM such as Raspberry Pi 4/5 (`sh Heybe_Linux.sh` in a terminal, not tested yet). If you try one, please report it in an issue — that is the help we need most.

- **Reads from sources**, then **checkers** stop the answer before it is shown: numbers must appear in the source; a number must belong to the same person, place or drug; translation must keep negations and directions (round-trip check); a second look asks whether the answer fits the situation; dangerous actions (tourniquet, abdominal thrusts, inducing vomiting…) are stopped unless the question's situation allows them; if even the best paragraph is far from the question, no answer is written. A stopped answer shows its sources instead.
- **The library belongs to the user:** the stick carries only the core; books come from ready-made lists or the user's own links and files. Personal records stay on the stick.
- **Model-free test suite:** `sh olcum/modelsiz.sh` (Go, Node, Python 3; no models or books). It checks every checker's teeth with deliberately broken examples and runs a mutation pass on the action checker.
- **Open scorecard:** see the table above — wrong and dangerous answers that passed *without* being stopped, on 30 unseen questions per release. The last two sets were written by a separate author who never saw the code.
- **Roadmap:** language-blind search across all books · answers that match the topic but not the need · answers that drop the source's warning · myth lists in sources · negation-checker false alarms · install script and real tests on Windows, Intel Mac and Linux · optional personal health data (encrypted, offline two-step verification; sources propose, Heybe filters and warns) · **siblings**: a light one-model Heybe and a model-free reading mode, chosen by the machine's strength · **Android over local Wi-Fi**: Heybe runs on one computer, phones and TV boxes connect with their browser · **voice**: screen-reader friendly page, offline "read aloud" with the computer's own voices, offline speech for missing languages, asking by voice.
- **Contributing:** every roadmap item is an issue. Pick one, say what you will do, measure first, then change; `sh olcum/modelsiz.sh` must pass. Changes that loosen a checker are not accepted without a measurement on the exam bank. Interface translations, book lists and exam questions in new languages are contributions too.

Code comments carry dates, short quotes (design requests from our partner Ercan) and references like "Özet §46" to our private development notebook, which is not in the repository. Most comments are in Turkish.

License: Apache 2.0 for the code. Books and models keep their own licenses. Organisations, associations and volunteers may set Heybe up on their own USB drives and hand them out for free.

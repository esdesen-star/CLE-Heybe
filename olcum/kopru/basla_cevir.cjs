// Bellekteki çok dilli başlangıç notu (07.11 gece, Özet §52 — Ercan'ın fikri: "50 dilde Beni Oku"; Can: tek dosya,
// her dilde dört satır). İngilizce, Türkçe ve Çekçe elle yazıldı; öbür diller çevirmenle, ekran çevirisiyle aynı
// temizlik kurallarıyla (cevir_ortak.cjs). Dosya adları ve "Heybe is ready ✓" yer tutucuyla korunur; bir satır
// temizlikten geçmezse o satır İngilizce kalır (bozuk yazıdan iyidir).
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/basla_cevir.cjs → tasinabilir/usb_kok/START_ALL_LANGUAGES.txt
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const { temizCevir } = require('./cevir_ortak.cjs');
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const CIKTI = path.join(HEYBE, '..', 'START_ALL_LANGUAGES.txt');
const ONB = path.join(__dirname, '..', 'sonuc', 'basla_ceviri.json');
const onb = fs.existsSync(ONB) ? JSON.parse(fs.readFileSync(ONB, 'utf8')) : {};

const KORU = ['Heybe_Mac.command', 'Heybe_Windows.bat', '"Heybe is ready ✓"'];
const yerine = (m) => KORU.reduce((x, ad, i) => x.split(`{${i}}`).join(ad), m);
const SATIR = {
  en: ['CLE Heybe — offline knowledge bag. It works without internet.',
    'To start: on a Mac double-click {0}, on Windows double-click {1}.',
    'A page opens in the browser. Choose your language and wait until it says {2} (1–3 minutes).',
    'Heybe answers only from the books on this USB drive and shows its sources. It is not a doctor: in an emergency, call your local emergency number.'],
  tr: ['CLE Heybe — çevrim dışı bilgi heybesi. İnternetsiz çalışır.',
    "Başlatmak için: Mac'te {0} dosyasına, Windows'ta {1} dosyasına çift tıkla.",
    'Tarayıcıda bir sayfa açılır. Dilini seç ve {2} yazısını bekle (1–3 dakika).',
    'Heybe yalnız bu bellekteki kitaplardan cevap verir ve kaynaklarını gösterir. Doktor değildir: acil durumda bulunduğun yerin acil numarasını ara.'],
  cs: ['CLE Heybe — offline zásoba vědomostí. Funguje bez internetu.',
    'Spuštění: na Macu dvakrát klikněte na {0}, ve Windows na {1}.',
    'V prohlížeči se otevře stránka. Vyberte jazyk a počkejte, až se objeví {2} (1–3 minuty).',
    'Heybe odpovídá jen z knih na tomto disku a ukazuje zdroje. Není to lékař: v naléhavém případě volejte místní tísňové číslo.'],
};
const c = { window: {} };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(HEYBE, 'metin_ek.js'), 'utf8'), c);
const diller = Object.keys(c.window.HEYBE_METIN_EK).filter((d) => !['pa', 'zu', 'nb', 'nn'].includes(d));
const ad = (d) => { try { const a = new Intl.DisplayNames([d], { type: 'language' }).of(d); return a.charAt(0).toLocaleUpperCase(d) + a.slice(1); } catch (e) { return d; } };

(async () => {
  const bloklar = [];
  let ingilizceKalan = 0;
  for (const d of ['en', 'tr', 'cs']) bloklar.push({ d, ad: ad(d), satirlar: SATIR[d], makine: false });
  const geri = diller.filter((d) => !SATIR[d]).sort((a, b) => new Intl.Collator('en').compare(ad(a), ad(b)));
  for (const d of geri) {
    const satirlar = [];
    for (const s of SATIR.en) {
      const anahtar = `${d}|${s}`;
      if (onb[anahtar] === undefined) { onb[anahtar] = await temizCevir(s, d); fs.writeFileSync(ONB, JSON.stringify(onb)); }
      if (onb[anahtar]) satirlar.push(onb[anahtar]); else { satirlar.push(s); ingilizceKalan++; }
    }
    bloklar.push({ d, ad: ad(d), satirlar, makine: true });
    console.log(`${d}: ${satirlar.filter((x, i) => x !== SATIR.en[i]).length}/4 çevrildi`);
  }
  const ust = ['CLE Heybe — START · BAŞLA · START',
    'Full guides: READ_ME.txt (English) · BENI_OKU.txt (Türkçe) · PRECTI_SI.txt (Čeština).',
    'Below: how to start Heybe in ' + bloklar.length + ' languages. Most are machine translated and not checked yet.',
    '(When the page is open, Heybe and its guide are in your language.)', ''];
  const govde = bloklar.map((b) => [`=== ${b.ad} (${b.d})${b.makine ? ' · machine translation' : ''} ===`, ...b.satirlar.map((x) => '- ' + yerine(x)), ''].join('\n'));
  fs.writeFileSync(CIKTI, ust.join('\n') + '\n' + govde.join('\n'));
  console.log(`— ${CIKTI}: ${bloklar.length} dil · İngilizce kalan satır ${ingilizceKalan} —`);
})();

#!/bin/sh
# Modelsiz sınavlar — tek komut (Ö21, 07.11.2026, Özet §44). Model, kütüphane ve internet gerekmez: kayıtlı cevaplar,
# bekçilerin dişleri, yardımcı programın testleri, ekran çevirilerinin ölçüleri, banka denetimi. GitHub'da her katkıda
# koşacak olan budur (SIRA 6); bir madde tutmazsa çıkış kodu 1.
# Kullanım: sh olcum/modelsiz.sh        (Go ve Node gerekir) · YEREL=1 ile denklik de (kütüphane 18888 açık olmalı)
K=$(cd "$(dirname "$0")/.." && pwd)
cd "$K" || exit 2
G=$(mktemp -d "${TMPDIR:-/tmp}/heybe_modelsiz.XXXX")
HATA=0
tamam() { echo "  ✓ $1"; }
olmadi() { echo "  ✗ $1"; HATA=$((HATA + 1)); }
iste() { # ad dosya desen — çıktıda desen yoksa olmadı. perl: geri başvuru (\1 = "kaç bozma, o kadar yakalandı");
  # bazı grep'ler (ugrep) geri başvuruyu desteklemiyor (07.11)
  if perl -e 'local $/; my $s = <STDIN>; exit($s =~ /$ARGV[0]/ ? 0 : 1)' "$3" <"$2"; then tamam "$1"; else olmadi "$1 (beklenen: $3)"; sed 's/^/      /' "$2" | tail -5; fi
}

echo "— yardımcı program (Go) —"
if (cd tasinabilir/yardimci && test -z "$(gofmt -l .)" && go vet ./... && go test ./...) >"$G/go" 2>&1; then tamam "gofmt · vet · test"; else olmadi "Go"; tail -15 "$G/go"; fi

echo "— sayfa —"
if python3 tasinabilir/sayfa_derle.py >"$G/derle" 2>&1 && node -e "
const s=require('fs').readFileSync('tasinabilir/usb_kok/heybe/index.html','utf8');
for (const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]);" >"$G/sayfa" 2>&1; then tamam "derleme ve betik sözdizimi"; else olmadi "sayfa"; cat "$G/derle" "$G/sayfa"; fi
for f in tasinabilir/usb_kok/heybe/arkadas.js olcum/kopru/*.cjs olcum/banka/*.cjs; do node --check "$f" 2>>"$G/check" || olmadi "sözdizimi: $f"; done
tamam "node --check ($(ls tasinabilir/usb_kok/heybe/arkadas.js olcum/kopru/*.cjs olcum/banka/*.cjs | wc -l | tr -d ' ') dosya)"
# 08.11 (§59): başlatıcıların kabuk sözdizimi (Linux başlatıcısı burada denenemiyor; en azından sözdizimi)
for f in tasinabilir/usb_kok/Heybe_Mac.command tasinabilir/usb_kok/Heybe_Linux.sh; do sh -n "$f" 2>>"$G/check" || olmadi "kabuk sözdizimi: $f"; done
tamam "başlatıcıların kabuk sözdizimi"
# 09.11 (harita 8i): harita sayfası internetsiz çalışmalı — betik, stil, yazı ve simge hep bellekten
H=tasinabilir/usb_kok/heybe/harita.html
if grep -n -E '(src|href)="https?://|https?://[^"'"'"' ]*\{(fontstack|z)\}|unpkg|jsdelivr|cdnjs|protomaps\.github\.io|api\.protomaps' "$H" >"$G/harita" 2>&1; then
  olmadi "harita sayfası dışarıya bağlanıyor"; cat "$G/harita"
else tamam "harita sayfası yalnız bellekten okuyor"; fi
for f in maplibre-gl.mjs maplibre-gl-worker.mjs maplibre-gl.css pmtiles.js basemaps.js sprites/light.json "fonts/Noto Sans Regular/0-255.pbf"; do
  [ -s "tasinabilir/usb_kok/heybe/harita_kit/$f" ] || olmadi "harita parçası eksik: $f"
done
tamam "harita parçaları yerinde"
node -e "const s=require('fs').readFileSync('$H','utf8');const m=s.match(/<script type=\"module\">([\s\S]*?)<\/script>/);require('fs').writeFileSync(process.argv[1],m[1]);" "$G/harita.mjs" &&
  node --check "$G/harita.mjs" 2>>"$G/check" && tamam "harita sayfasının betik sözdizimi" || olmadi "harita sayfasının betik sözdizimi"

echo "— bekçilerin dişleri (kayıtlı cevaplarla) —"
node olcum/kopru/dis_denetim.cjs >"$G/denetim" 2>&1
iste "olumsuzluk dişi" "$G/denetim" "olumsuzluk dişi: ([0-9]+) bozma, \1 yakalandı"
iste "bağlam dişi" "$G/denetim" "doğru ([0-9]+)/\1"
iste "paragraf okuyucu dişi" "$G/denetim" "paragraf okuyucu dişi: ([0-9]+)/\1"
iste "bilgi yok dişi" "$G/denetim" "bilgi yok dişi: ([0-9]+)/\1"
iste "eylem dişi" "$G/denetim" "eylem dişi: ([0-9]+)/\1"
iste "kesme dişi" "$G/denetim" "kesme dişi: ([0-9]+)/\1"
# 09.11 (§86): yazı sistemi bekçisi, kip denetimi, kısa maddeleri tutan paragraf okuyucu
iste "yazı dişi" "$G/denetim" "yazı dişi: ([0-9]+)/\1"
iste "kip dişi" "$G/denetim" "kip dişi: ([0-9]+)/\1"
iste "kısa madde dişi" "$G/denetim" "kısa madde dişi: ([0-9]+)/\1"
# 09.11 (§87): aktarma denetimi (cevap satırı ↔ kaynak paragrafı) ve listenin giriş cümlesini taşıması
iste "aktarma dişi" "$G/denetim" "aktarma dişi: ([0-9]+)/\1"
iste "liste girişi dişi" "$G/denetim" "liste girişi dişi: ([0-9]+)/\1"
iste "düşen kelime dişi" "$G/denetim" "düşen kelime dişi: ([0-9]+)/\1"
iste "bölüm dişi" "$G/denetim" "bölüm dişi: ([0-9]+)/\1"
iste "konuşma dişi" "$G/denetim" "konuşma dişi: ([0-9]+)/\1"
# 10.11 (§101): okuma kipi (modelsiz sıralama)
iste "okuma dişi" "$G/denetim" "okuma dişi: ([0-9]+)/\1"
# 12–13.11 (§109–§122): kişi, yol sorusu, ortam, saplanan, baş ağrısı, §116 kuralları, konu uyumu
for d in "kişi dişi" "yol sorusu dişi" "ortam dişi" "saplanan dişi" "baş ağrısı dişi" "§116 kural dişi" "konu dişi"; do
  iste "$d" "$G/denetim" "$d: ([0-9]+)/\1"
done
# 13.11: yeni diş eklenip burada unutulursa da yakalansın — dis_denetim'in HER "dişi: a/b" satırı tam olmalı
if perl -ne '$k = 1 if /dişi: (\d+)\/(\d+)/ && $1 != $2; END { exit($k ? 1 : 0) }' "$G/denetim"; then tamam "bütün dişler tam ($(grep -c 'dişi: [0-9]' "$G/denetim") satır)"
else olmadi "eksik diş"; grep -E 'dişi: [0-9]' "$G/denetim" | perl -ne 'print "      $_" if /dişi: (\d+)\/(\d+)/ && $1 != $2'; fi
node olcum/kopru/eylem_bozma.cjs >"$G/bozma" 2>&1
iste "eylem bozma denemesi" "$G/bozma" "([0-9]+) bozma, \1 yakalandı"
node olcum/kopru/kaynak_bozma.cjs >"$G/kbozma" 2>&1
iste "kaynak bozma denemesi (yeni kurallar)" "$G/kbozma" "kaynak bozma: ([0-9]+) bozma, \1 yakalandı$"
node olcum/kopru/dis_kopru.cjs >"$G/kopru" 2>&1
iste "köprü sayı dişi" "$G/kopru" "dişler: ([0-9]+)/\1 yakalandı"

echo "— ekran çevirileri —"
node olcum/kopru/arayuz_denetle.cjs >"$G/arayuz" 2>&1
iste "alfabe karışması yok" "$G/arayuz" "alfabe karışması: 0 dil"
iste "korunan adlar yerinde" "$G/arayuz" "korunan adlar: 0 metinde"
# "da→null" emin olamadı demektir (yanlış değil); "da→no" yanlış dildir
if perl -ne '$v = 1 if /^  [a-z]+→(?!null)[a-z]/; END { exit($v ? 0 : 1) }' "$G/arayuz"; then olmadi "dil algılayıcı başka dil buldu"; grep "→" "$G/arayuz"; else tamam "dil algılayıcı yanlış dil bulmadı ($(grep -c '→null' "$G/arayuz") dilde emin olamadı)"; fi
# 13.11 (§123): harita sayfasının ekran çevirileri — aynı üç denetim
SAYFA=harita node olcum/kopru/arayuz_denetle.cjs >"$G/harita_arayuz" 2>&1
iste "harita: alfabe karışması yok" "$G/harita_arayuz" "alfabe karışması: 0 dil"
iste "harita: korunan adlar yerinde" "$G/harita_arayuz" "korunan adlar: 0 metinde"
if perl -ne '$v = 1 if /^  [a-z]+→(?!null)[a-z]/; END { exit($v ? 0 : 1) }' "$G/harita_arayuz"; then olmadi "harita: dil algılayıcı başka dil buldu"; grep "→" "$G/harita_arayuz"; else tamam "harita: dil algılayıcı yanlış dil bulmadı ($(grep -c '→null' "$G/harita_arayuz") dilde emin olamadı)"; fi
# 13.11 (§123): makine çevirisi dillerinde uzaklık/süre tarayıcının dil verisinden (çevirmen "min"i "en az" yapmıştı);
# dişi: Intl satırı silinmiş sayfa düşmeli
node olcum/kopru/harita_birim_denetle.cjs >"$G/harita_birim" 2>&1
iste "harita: uzaklık, süre ve yol özeti dilin kendi biçiminde" "$G/harita_birim" "BİRİM: tamam \([1-9]"
grep -v "M.birimli = " tasinabilir/usb_kok/heybe/harita.html >"$G/harita_bozuk.html"
if node olcum/kopru/harita_birim_denetle.cjs "$G/harita_bozuk.html" >"$G/harita_birim_bozuk" 2>&1; then olmadi "harita birim dişi: bozuk sayfa geçti"; else tamam "harita birim dişi (Intl silinince düştü)"; fi
# 13.11 (§123): yön metinlerinin anlam kapısı (eski çeviride sol/sağ karışmıştı) — gönderilen her yön çevirisinin kanıtı +
# adımlarda ok. Dişler: bir dilin "sola dön"ü "Desno" (sağ) yapılınca ve adım satırından ok silinince düşmeli
SAYFA=harita node olcum/kopru/kapi_denetle.cjs >"$G/harita_kapi" 2>&1
iste "harita: yön çevirileri anlam kapısından geçmiş, adımlarda ok var" "$G/harita_kapi" "KAPI: tamam \([1-9]"
node -e "
const fs=require('fs'),vm=require('vm');const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync('tasinabilir/usb_kok/heybe/harita_metin_ek.js','utf8'),c);
const E=c.window.HEYBE_HARITA_EK;const d=Object.keys(E).find((x)=>E[x].yon&&E[x].yon.sol);E[d].yon.sol='Desno';
fs.writeFileSync(process.argv[1],'window.HEYBE_HARITA_EK='+JSON.stringify(E)+';');" "$G/ek_bozuk.js"
sed 's/li.textContent = `${YON_OK\[a.yon\] ? YON_OK\[a.yon\] + . . : ..}/li.textContent = `/' tasinabilir/usb_kok/heybe/harita.html >"$G/harita_oksuz.html"
if SAYFA=harita EK="$G/ek_bozuk.js" node olcum/kopru/kapi_denetle.cjs >/dev/null 2>&1; then olmadi "harita kapı dişi: \"Desno\" geçti"
elif SAYFA=harita SAYFA_YOL="$G/harita_oksuz.html" node olcum/kopru/kapi_denetle.cjs >/dev/null 2>&1; then olmadi "harita kapı dişi: oksuz adım geçti"
else tamam "harita kapı dişi (sol → \"Desno\" ve oksuz adım düştü)"; fi
# 14.11 (§124): ana sayfanın anlam kapısı — "bilgi yok" ve "kaynağının yasakladığı" (eski çeviride Slovakça "bilgi yok"
# → "bu durum söz konusu değil"; "yasakladığı" 23 dilde düşmüştü). Dişi: bir dilin "bilgi yok"u o Slovakça cümle yapılınca düşmeli
node olcum/kopru/kapi_denetle.cjs >"$G/sayfa_kapi" 2>&1
iste "ana sayfa: \"bilgi yok\" ve \"yasakladığı\" anlam kapısından geçmiş" "$G/sayfa_kapi" "KAPI: tamam \([1-9]"
node -e "
const fs=require('fs'),vm=require('vm');const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync('tasinabilir/usb_kok/heybe/metin_ek.js','utf8'),c);
const E=c.window.HEYBE_METIN_EK;const d=Object.keys(E).find((x)=>E[x].bilgiYok&&!['pa','zu'].includes(x));E[d].bilgiYok='Podľa mojich informácií to tak nie je.';
fs.writeFileSync(process.argv[1],'window.HEYBE_METIN_EK='+JSON.stringify(E)+';');" "$G/metin_bozuk.js"
if EK="$G/metin_bozuk.js" node olcum/kopru/kapi_denetle.cjs >/dev/null 2>&1; then olmadi "ana sayfa kapı dişi: bozuk \"bilgi yok\" geçti"; else tamam "ana sayfa kapı dişi (\"bilgi yok\" → \"söz konusu değil\" düştü)"; fi

echo "— sınav bankası —"
if node olcum/banka/banka.cjs >"$G/banka" 2>&1; then tamam "$(grep -o 'banka: [0-9]* soru' "$G/banka"), kimlikler ve hükümler geçerli"; else olmadi "banka"; cat "$G/banka"; fi
if node olcum/kopru/yanlis_oku.cjs olcum/banka/ornek_yanlis.jsonl >"$G/yanlis" 2>&1 && grep -q "— 1 kayıt" "$G/yanlis"; then tamam "\"bu cevap yanlış\" okuyucusu"; else olmadi "yanlış okuyucusu"; cat "$G/yanlis"; fi

if [ -n "$YEREL" ]; then
  echo "— denklik (yerel: kütüphane 18888) —"
  node olcum/denklik/js_karsilastir.cjs >"$G/denklik" 2>&1
  iste "adaylar" "$G/denklik" "adaylar: ([0-9]+)/\1 birebir"
  iste "makaleler" "$G/denklik" "makaleler: ([0-9]+)/\1 birebir"
  iste "denetçi" "$G/denklik" "denetçi: birebir"
fi

rm -rf "$G"
if [ "$HATA" -eq 0 ]; then echo "MODELSİZ SINAV: hepsi tuttu"; else echo "MODELSİZ SINAV: $HATA madde tutmadı"; exit 1; fi

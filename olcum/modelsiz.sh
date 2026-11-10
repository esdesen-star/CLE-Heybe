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

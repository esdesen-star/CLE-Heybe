#!/bin/sh
# GitHub "Releases" için hazır paket (08.11.2026, Özet §66 — Ercan: "asıl en önemli amacımız normal bir kullanıcı bunu
# indirip kurabilmesi"). Paket = belleğin çekirdeği, MODELSİZ ve KİTAPSIZ: beş sistemin programları, llamafile,
# sayfa, başlatıcılar, beni oku dosyaları, lisanslar. Modelleri Heybe ilk açılışta kendisi indirir (model.go).
# Kullanım: sh tasinabilir/paket_hazirla.sh [çıktı klasörü]   (varsayılan: ../Heybe_paket)
set -e
T=$(cd "$(dirname "$0")" && pwd)
U="$T/usb_kok"
SURUM=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['surum'])" "$U/heybe/surum.json")
CIKTI=${1:-$T/../../Heybe_paket}
mkdir -p "$CIKTI"
CIKTI=$(cd "$CIKTI" && pwd)
python3 "$T/sayfa_derle.py" >/dev/null
sh "$T/yardimci/yap.sh" >/dev/null
for d in macos-arm64 macos-x86_64 windows-x86_64 linux-amd64 linux-arm64; do
  [ -d "$U/program/$d" ] || { echo "eksik program klasörü: $d"; exit 2; }
done
[ -f "$T/indirilen/llamafile-0.10.6" ] || { echo "llamafile yok: indirilen/llamafile-0.10.6"; exit 2; }
G=$(mktemp -d "${TMPDIR:-/tmp}/heybe_paket.XXXX")
P="$G/CLE-Heybe"
mkdir -p "$P/program" "$P/model" "$P/kutuphane" "$P/heybe"
# kişisel ya da deneme dosyaları pakete girmez: benim/ (kullanıcının kayıtları), kutuphane/ (kitaplar), model/,
# durum/, PRO_TESTERA.txt (tek bir denemeciye yazılmış not), Mac'in ._ dosyaları
( cd "$U" && find . -type f ! -name '._*' ! -name '.DS_Store' \
    ! -path './heybe/benim/*' ! -path './kutuphane/*' ! -path './model/*' ! -path './durum/*' ! -name 'PRO_TESTERA.txt' ) |
while read -r f; do
  mkdir -p "$P/$(dirname "$f")" && cp -X "$U/$f" "$P/$f"
done
cp -X "$T/indirilen/llamafile-0.10.6" "$P/program/llamafile.exe"
chmod +x "$P"/program/*/* "$P/program/llamafile.exe" "$P/Heybe_Mac.command" "$P/Heybe_Linux.sh"
printf 'Heybe indirir: modeller ilk açılışta buraya iner.\nHeybe downloads its models here on first start.\n' >"$P/model/BENI_OKU_README.txt"
printf 'Kitaplar buraya iner.\nBooks are downloaded here.\n' >"$P/kutuphane/BENI_OKU_README.txt"
# denetim: modeller, kitaplar, kişisel kayıtlar ve kişisel yollar pakette yok
if find "$P" \( -name '*.gguf' -o -name '*.zim' -o -name 'yanlis_cevaplar.jsonl' -o -name 'acil_kart.json' -o -name 'ayar.json' \) | grep -q .; then
  echo "DURDUM: pakette model, kitap ya da kişisel kayıt var"; exit 3
fi
# aranan ad ve ev klasörü bu bilgisayarınkidir; betiğe yazılmaz (08.11: yazılınca kendisi iz olmuştu)
KISI=$(basename "$HOME"); EVLER="$(dirname "$HOME")/"
if grep -rIl -e "$EVLER" -e "$KISI" -e '/Volumes/HEYBE' "$P" 2>/dev/null | grep -v 'LISANSLAR/' | grep -q .; then
  echo "DURDUM: pakette kişisel yol izi:"; grep -rIl -e "$EVLER" -e "$KISI" -e '/Volumes/HEYBE' "$P" | head; exit 3
fi
Z="$CIKTI/CLE-Heybe-$SURUM.zip"
rm -f "$Z"
( cd "$G" && zip -r -X -q "$Z" CLE-Heybe )
rm -rf "$G"
printf '%s\n' "$(cd "$CIKTI" && shasum -a 256 "$(basename "$Z")")" >"$Z.sha256"
echo "paket: $Z ($(du -h "$Z" | cut -f1)) · $(unzip -l "$Z" | tail -1 | awk '{print $2}') dosya"
cat "$Z.sha256"

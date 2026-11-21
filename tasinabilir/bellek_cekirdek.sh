#!/bin/sh
# K18 (06.11.2026): HEYBE belleğe ÇEKİRDEĞİ yükler — Heybe (programlar, sayfa) + sohbet, anlam ve çevirmen modelleri.
# Kitaplık kullanıcınındır: verilen .zim dosyaları kutuphane/ içine kopyalanır, verilmezse kitap konmaz.
# Bellekteki eski kitapları SİLMEZ; yer gerekiyorsa önce Kitaplık'tan "Kaldır" ya da elle.
# Kullanım: sh tasinabilir/bellek_cekirdek.sh [kitap.zim ...]
T=$(cd "$(dirname "$0")" && pwd)   # 07.11: yol betiğin yerinden
H=/Volumes/HEYBE
SOHBET=${SOHBET_MODELI:-$T/indirilen/sohbet/gemma-4-E4B-it-Q4_0.gguf}   # §245: Gemma 4 E4B (Q4_0 gguf); eski: gemma3-4b.gguf
ANLAM=$T/indirilen/gomme/embeddinggemma-300M-Q8_0.gguf
CEVIRMEN=$T/indirilen/ceviri/translategemma-4b-it.Q4_K_M.gguf
export COPYFILE_DISABLE=1
[ -d "$H" ] || { echo "HEYBE takılı değil"; exit 2; }
diskutil info "$H" | grep -q "Device Location:.*External" || { echo "HEYBE dış bellek değil, durdum"; exit 3; }
pgrep -f "$H/program" >/dev/null && { echo "bellekten çalışan Heybe var; önce kapat"; exit 4; }
# 21.11 (Özet §245): sohbet modeli Gemma 4 E4B (4,59 GB). FAT32 bellek 4 GB'tan büyük dosya almaz → orada Gemma 3 4B
# (Heybe dosyaya göre seçer: önce gemma-4-E4B-it-Q4_0.gguf, yoksa gemma3-4b.gguf).
SOHBET_AD=$(basename "$SOHBET")
if diskutil info "$H" 2>/dev/null | grep -q "FAT32" && [ "$(stat -L -f %z "$SOHBET")" -ge 4294967296 ]; then
  echo "  FAT32 bellek: sohbet modeli Gemma 3 4B (Gemma 4 E4B 4 GB'tan büyük)"; SOHBET=$T/indirilen/sohbet/gemma3-4b.gguf; SOHBET_AD=gemma3-4b.gguf
fi

kopya() { # kaynak hedef — yazma hızını ölçer; aynı dosya zaten varsa atlar
  if [ -f "$2" ] && [ "$(stat -L -f %z "$1")" = "$(stat -L -f %z "$2")" ] && cmp -s "$1" "$2"; then echo "  $(basename "$2"): zaten aynı"; return; fi
  b=$(stat -L -f %z "$1"); t0=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
  cp -X "$1" "$2" && sync || { echo "KOPYA HATASI: $1"; exit 5; }
  t1=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
  perl -e 'printf "  %-40s %8.1f MB %7.1f sn %6.1f MB/sn\n", $ARGV[0], $ARGV[1]/1e6, $ARGV[3]-$ARGV[2], $ARGV[1]/1e6/($ARGV[3]-$ARGV[2])' "$(basename "$2")" "$b" "$t0" "$t1"
}

echo "başla: $(date '+%H:%M:%S')"
python3 "$T/sayfa_derle.py" || exit 6
sh "$T/yardimci/yap.sh" >/dev/null || exit 7
mkdir -p "$H/program" "$H/model" "$H/kutuphane"
# 06.11 gece: "cp -RX usb_kok/." her seferinde 217 dosyanın hepsini yazıyordu; FAT32 USB 2.0 bellekte küçük
# dosyalar (pdfjs/cmaps) saniyede ~2 dosya → 15+ dakika. Artık yalnız eksik ya da farklı dosya yazılır.
( cd "$T/usb_kok" && find . -type f ! -name '._*' ) | while read -r f; do
  cmp -s "$T/usb_kok/$f" "$H/$f" && continue
  mkdir -p "$H/$(dirname "$f")" && cp -X "$T/usb_kok/$f" "$H/$f" || { echo "KOPYA HATASI: $f"; exit 5; }
  echo "  yazıldı: $f"
done || exit 5
sync && echo "  başlatıcılar, sayfa, programlar, beni oku, lisanslar güncel"
kopya "$T/indirilen/llamafile-0.10.6" "$H/program/llamafile.exe"
kopya "$ANLAM" "$H/model/embeddinggemma-300M-Q8_0.gguf"
kopya "$SOHBET" "$H/model/$SOHBET_AD"
kopya "$CEVIRMEN" "$H/model/translategemma-4b.gguf"
for z in "$@"; do kopya "$z" "$H/kutuphane/$(basename "$z")"; done
dot_clean -m "$H" 2>/dev/null; find "$H" -name '._*' -delete 2>/dev/null

echo "Önbelleği boşaltmak için bellek çıkarılıp yeniden bağlanıyor"
DEV=$(diskutil info "$H" | awk -F: '/Device Node/{gsub(/ /,"",$2);print $2}')
diskutil unmount "$H" >/dev/null && sleep 2 && diskutil mount "$DEV" >/dev/null; sleep 2
[ -d "$H" ] || { echo "yeniden bağlanamadı: $DEV"; exit 8; }
dogrula() { # kaynak hedef
  [ "$(shasum -a 256 "$1" | cut -c1-64)" = "$(shasum -a 256 "$2" | cut -c1-64)" ] && echo "  $(basename "$2"): sağlama TAMAM" || echo "  $(basename "$2"): sağlama UYUŞMUYOR"
}
dogrula "$SOHBET" "$H/model/$SOHBET_AD"
dogrula "$ANLAM" "$H/model/embeddinggemma-300M-Q8_0.gguf"
dogrula "$CEVIRMEN" "$H/model/translategemma-4b.gguf"
for z in "$@"; do dogrula "$z" "$H/kutuphane/$(basename "$z")"; done
( cd "$T/usb_kok" && find . -type f ! -name .metadata_never_index | while read f; do
    [ "$(shasum -a 256 "$f" | cut -c1-64)" = "$(shasum -a 256 "$H/$f" 2>/dev/null | cut -c1-64)" ] || echo "  FARKLI: $f"; done )
echo "  çekirdek dosyaları denetlendi: $(cd "$T/usb_kok" && find . -type f ! -name .metadata_never_index | wc -l | tr -d ' ') dosya"
df -h "$H" | tail -1
echo "bitti: $(date '+%H:%M:%S')"

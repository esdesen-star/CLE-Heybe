#!/bin/sh
# HEYBE adlı exFAT/FAT32 bellek görününce Heybe yükünü kopyalar, hızı ölçer, doğrular.
# 06.11: yeni bellek exFAT olmalı (FAT32 4 GB'tan büyük kitap almaz). Kitaplık listesi (kutuphane.xml)
# belleğe kopyalanmaz: yardımcı program ilk açılışta klasördeki .zim'lerden kendisi kurar.
T=$(cd "$(dirname "$0")" && pwd)
ZIM=${ZIM:-$T/../olcum/kaynak/wikipedia_tr_all_nopic_2026-09.zim}
MODEL=${SOHBET_MODELI:-$T/indirilen/sohbet/gemma3-4b.gguf}   # Gemma 3 4B (Q4_K_M gguf)
H=/Volumes/HEYBE
export COPYFILE_DISABLE=1
s=0
until [ -d "$H" ] && diskutil info "$H" | grep -qE "ExFAT|FAT32"; do
  sleep 5; s=$((s+5)); [ $s -ge 2400 ] && { echo "HEYBE 40 dk içinde görünmedi"; exit 2; }
done
diskutil info "$H" | grep -E "Device Node|File System Personality|Disk Size|Volume Free Space|Device Location"
diskutil info "$H" | grep -q "Device Location:.*External" || { echo "HEYBE dış bellek değil, durdum"; exit 3; }
echo "HEYBE göründü: $(date '+%H:%M:%S')"
kopya() { # kaynak hedef
  b=$(stat -L -f %z "$1"); t0=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
  cp -X "$1" "$2" || { echo "KOPYA HATASI: $1"; exit 4; }
  sync; t1=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
  perl -e 'printf "  %-34s %7.1f MB  %6.1f sn  %5.1f MB/sn yazma\n", $ARGV[0], $ARGV[1]/1e6, $ARGV[3]-$ARGV[2], $ARGV[1]/1e6/($ARGV[3]-$ARGV[2])' "$(basename "$2")" "$b" "$t0" "$t1"
}
python3 "$T/sayfa_derle.py" || exit 6   # arkadaş sayfası tek dosyada güncel olsun
sh "$T/yardimci/yap.sh" >/dev/null || exit 7   # yardımcı program Mac + Windows için güncel olsun (06.11)
mkdir -p "$H/program" "$H/model" "$H/kutuphane"   # 06.11: durum/ kullanılmıyor, açılmaz
cp -RX "$T/usb_kok/." "$H/" && sync && echo "  başlatıcılar + programlar kopyalandı"
kopya "$T/indirilen/llamafile-0.10.6" "$H/program/llamafile.exe"
kopya "$T/indirilen/gomme/embeddinggemma-300M-Q8_0.gguf" "$H/model/embeddinggemma-300M-Q8_0.gguf"
kopya "$MODEL" "$H/model/gemma3-4b.gguf"
kopya "$ZIM" "$H/kutuphane/wikipedia_tr_all_nopic_2026-09.zim"
dot_clean -m "$H" 2>/dev/null; find "$H" -name '._*' -delete 2>/dev/null
echo "Önbelleği boşaltmak için bellek çıkarılıp yeniden bağlanıyor"
DEV=$(diskutil info "$H" | awk -F: '/Device Node/{gsub(/ /,"",$2);print $2}')
diskutil unmount "$H" >/dev/null && sleep 2 && diskutil mount "$DEV" >/dev/null; sleep 2
[ -d "$H" ] || { echo "yeniden bağlanamadı: $DEV"; exit 5; }
t0=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
h=$(shasum -a 256 "$H/model/gemma3-4b.gguf" | cut -d' ' -f1)
t1=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
perl -e 'printf "  model okuma: %.1f sn  %.1f MB/sn\n", $ARGV[1]-$ARGV[0], 2499.012288/($ARGV[1]-$ARGV[0])' "$t0" "$t1"
[ "$h" = "f06e91e18fc74295d0c781bf91622508c75655e2c18ed869d52447ffe1e667e1" ] && echo "  model sağlama: TAMAM" || echo "  model sağlama: UYUŞMUYOR"
beklenen=$(cut -d' ' -f1 "$ZIM.sha256")
z=$(shasum -a 256 "$H/kutuphane/wikipedia_tr_all_nopic_2026-09.zim" | cut -d' ' -f1)
[ "$z" = "$beklenen" ] && echo "  kütüphane sağlama: TAMAM" || echo "  kütüphane sağlama: UYUŞMUYOR"
g=$(shasum -a 256 "$H/model/embeddinggemma-300M-Q8_0.gguf" | cut -d' ' -f1)
[ "$g" = "$(cut -d' ' -f1 "$T/indirilen/gomme/embeddinggemma-300M-Q8_0.gguf.sha256")" ] && echo "  anlam modeli sağlama: TAMAM" || echo "  anlam modeli sağlama: UYUŞMUYOR"
df -h "$H" | tail -1
echo "Bitti: $(date '+%H:%M:%S')"

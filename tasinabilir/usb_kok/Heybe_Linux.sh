#!/bin/sh
# CLE Heybe — Linux başlatıcı (08.11.2026, Özet §59). HENÜZ DENENMEDİ — denersen sonucu bize yaz.
# Terminalde belleğin kökünde:  sh Heybe_Linux.sh
# Adres: http://127.0.0.1:8888 (yardımcı program: sayfa, kitaplık, indirme, yükleme)
#   kütüphane :8889 · anlam modeli :8081 · sohbet modeli :8080 · çevirmen :8082 — hepsi yalnız bu bilgisayardan erişilir.
# Linux takılı belleği çoğu zaman program çalıştırma izni olmadan bağlar (noexec, ya da FAT32'de yalnız .exe'ye izin).
# Bu yüzden küçük programlar (yardımcı, kütüphane) önce bilgisayarın kendi klasörüne kopyalanır ve oradan açılır;
# modeller ve kitaplar bellekte kalır. Modelleri açan llamafile `sh` ile çalışır, izne ihtiyacı yoktur.
# İşlemci: x86_64 (sıradan bilgisayar) ya da aarch64 (Raspberry Pi 4/5 gibi ARM kartlar).
KOK="$(cd "$(dirname "$0")" && pwd)"
cd "$KOK" || exit 1
G="${TMPDIR:-/tmp}"
case "$(uname -m)" in
  x86_64|amd64) A=amd64 ;;
  aarch64|arm64) A=arm64 ;;
  *) echo "Bu işlemci için Heybe yok: $(uname -m) (x86_64 ya da aarch64 gerekir)"; exit 1 ;;
esac
[ -d "$KOK/program/linux-$A" ] || { echo "Bellekte Linux programları yok: program/linux-$A"; exit 1; }
P="${XDG_CACHE_HOME:-$HOME/.cache}/cle-heybe/program-$A"
mkdir -p "$P" && cp "$KOK/program/linux-$A/"* "$P/" && chmod +x "$P/"* || { echo "Programlar kopyalanamadı: $P"; exit 1; }
LLAMA="$KOK/program/llamafile.exe"

# curl yoksa wget; ikisi de yoksa yalnız bekler
if command -v curl >/dev/null 2>&1; then oku() { curl -s "$1"; }
elif command -v wget >/dev/null 2>&1; then oku() { wget -qO- "$1"; }
else oku() { sleep 2; echo ok; }; fi

kapat() { kill "$YARDIMCI" "$KUTUPHANE" "$ANLAM" "$SOHBET" 2>/dev/null; pkill -f "$KOK/model/translategemma-4b.gguf" 2>/dev/null; }
trap kapat EXIT HUP INT TERM

hazir_bekle() {  # adres süreç ad
  until oku "$1/health" | grep -q ok; do
    kill -0 "$2" 2>/dev/null || { echo "$3 açılamadı. Günlük: $G/heybe_$3.log"; return 1; }
    sleep 1
  done
  echo "$3 hazır: $(( $(date +%s) - BASLA )) sn"
}

BASLA=$(date +%s)
echo "CLE Heybe açılıyor..."
# Sıra Mac başlatıcısıyla aynı: önce yardımcı, sonra kütüphane, sonra küçük anlam modeli, en son büyük sohbet modeli.
"$P/heybe-yardimci" -kok "$KOK" -program "$P" >"$G/heybe_yardimci.log" 2>&1 &
YARDIMCI=$!
until [ -n "$(oku http://127.0.0.1:8888/api/durum 2>/dev/null)" ]; do
  kill -0 "$YARDIMCI" 2>/dev/null || { echo "Yardımcı açılamadı. Günlük: $G/heybe_yardimci.log"; exit 1; }
  sleep 0.5
done

"$P/kiwix-serve" --port 8889 --address 127.0.0.1 --monitorLibrary --skipInvalid --urlRootLocation /kiwix \
  --library "$KOK/kutuphane/kutuphane.xml" >"$G/heybe_kutuphane.log" 2>&1 &
KUTUPHANE=$!
until [ -n "$(oku http://127.0.0.1:8889/kiwix/)" ]; do
  kill -0 "$KUTUPHANE" 2>/dev/null || { echo "Kütüphane açılamadı. Günlük: $G/heybe_kutuphane.log"; break; }
  sleep 0.5
done
echo "kütüphane hazır: $(( $(date +%s) - BASLA )) sn"
xdg-open "http://127.0.0.1:8888/" >/dev/null 2>&1 || echo "Tarayıcıda şu adresi aç: http://127.0.0.1:8888/"

# İlk kurulum (08.11, Özet §66): GitHub paketi modelsiz gelir. Model yoksa açılmaz; sayfa "Kitaplık ve ayarlar"da
# indirmeyi önerir, yardımcı program inen modelleri kendisi açar.
if [ -f "$KOK/model/embeddinggemma-300M-Q8_0.gguf" ] && [ -f "$KOK/model/gemma3-4b.gguf" ]; then
  sh "$LLAMA" --server --host 127.0.0.1 --port 8081 --no-webui -m "$KOK/model/embeddinggemma-300M-Q8_0.gguf" \
    --embedding -c 8192 -b 2048 -ub 2048 >"$G/heybe_anlam.log" 2>&1 &
  ANLAM=$!
  hazir_bekle http://127.0.0.1:8081 "$ANLAM" anlam

  # Okuma kipi (10.11, Özet §106): kullanıcı seçtiyse büyük sohbet modeli açılmaz — bellek ve pil kalır
  if [ "$(oku http://127.0.0.1:8888/api/kip)" = "okuma" ]; then
    echo "Okuma kipi seçili: büyük yapay zekâ açılmadı. Değiştirmek için: Kitaplık ve ayarlar → Okuma kipi."
  else
    sh "$LLAMA" --server --host 127.0.0.1 --port 8080 --no-webui -np 1 -m "$KOK/model/gemma3-4b.gguf" \
      -c 8192 >"$G/heybe_sohbet.log" 2>&1 &
    SOHBET=$!
    hazir_bekle http://127.0.0.1:8080 "$SOHBET" sohbet
  fi
else
  echo "Modeller henüz kurulmadı. Sayfada: Kitaplık ve ayarlar → İlk kurulum (internet bir kez gerekir)."
fi

# Çevirmen (TranslateGemma) başlatıcıda açılmaz: gerekince yardımcı program açar ve kapanırken kapatır (Özet §36).

echo
echo "Heybe açık. Kapatmak için bu pencerede Enter'a bas."
read _

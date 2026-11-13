#!/bin/sh
# CLE Heybe — Mac başlatıcı. Belleğin kökünde durur, çift tıklayınca açılır.
# Adres: http://127.0.0.1:8888 (yardımcı program: sayfa, kitaplık, indirme, yükleme)
#   kütüphane :8889 · anlam modeli :8081 · sohbet modeli :8080 · çevirmen :8082 — hepsi yalnız bu bilgisayardan erişilir.
# Belleğe yalnız kutuphane/ (indirilen kitaplar) ve heybe/benim/ (kendi dosyaların) altına yazılır;
# günlükler bilgisayarın geçici klasörüne gider. (06.11.2026 — Özet §27)
KOK="$(cd "$(dirname "$0")" && pwd)"
cd "$KOK" || exit 1
# GitHub'dan indirilen paket karantinalı gelir: bu başlatıcıya izin verildiyse içindeki programlar da açılabilsin (08.11)
xattr -dr com.apple.quarantine "$KOK" 2>/dev/null
G="${TMPDIR:-/tmp}"
if [ "$(uname -m)" = "arm64" ]; then P="$KOK/program/macos-arm64"; else P="$KOK/program/macos-x86_64"; fi
LLAMA="$KOK/program/llamafile.exe"

kapat() { kill "$YARDIMCI" "$KUTUPHANE" "$ANLAM" "$SOHBET" 2>/dev/null; pkill -f "$KOK/model/translategemma-4b.gguf" 2>/dev/null; }
trap kapat EXIT HUP INT TERM

hazir_bekle() {  # adres süreç ad
  until curl -s "$1/health" | grep -q ok; do
    kill -0 "$2" 2>/dev/null || { echo "$3 açılamadı. Günlük: $G/heybe_$3.log"; return 1; }
    sleep 1
  done
  echo "$3 hazır: $(( $(date +%s) - BASLA )) sn"
}

BASLA=$(date +%s)
echo "CLE Heybe açılıyor..."
# Sıra önemli: yavaş bellekte aynı anda açılan sunucular birbirini bekletir (05.11 ölçümü).
# Önce yardımcı (kitaplık listesini hazırlar), sonra kütüphane, sonra küçük anlam modeli, en son büyük sohbet modeli.
"$P/heybe-yardimci" >"$G/heybe_yardimci.log" 2>&1 &
YARDIMCI=$!
until curl -s -o /dev/null http://127.0.0.1:8888/api/durum; do
  kill -0 "$YARDIMCI" 2>/dev/null || { echo "Yardımcı açılamadı. Günlük: $G/heybe_yardimci.log"; exit 1; }
  sleep 0.2
done

"$P/kiwix-serve" --port 8889 --address 127.0.0.1 --monitorLibrary --skipInvalid --urlRootLocation /kiwix \
  --library "$KOK/kutuphane/kutuphane.xml" >"$G/heybe_kutuphane.log" 2>&1 &
KUTUPHANE=$!
until curl -s -o /dev/null http://127.0.0.1:8889/kiwix/; do
  kill -0 "$KUTUPHANE" 2>/dev/null || { echo "Kütüphane açılamadı. Günlük: $G/heybe_kutuphane.log"; break; }
  sleep 0.2
done
echo "kütüphane hazır: $(( $(date +%s) - BASLA )) sn"
open "http://127.0.0.1:8888/"

# İlk kurulum (08.11, Özet §66): GitHub paketi modelsiz gelir. Model yoksa açılmaz; sayfa "Kitaplık ve ayarlar"da
# indirmeyi önerir, yardımcı program inen modelleri kendisi açar.
if [ -f "$KOK/model/embeddinggemma-300M-Q8_0.gguf" ] && [ -f "$KOK/model/gemma3-4b.gguf" ]; then
  "$LLAMA" --server --host 127.0.0.1 --port 8081 --no-webui -m "$KOK/model/embeddinggemma-300M-Q8_0.gguf" \
    --embedding -c 8192 -b 2048 -ub 2048 >"$G/heybe_anlam.log" 2>&1 &
  ANLAM=$!
  hazir_bekle http://127.0.0.1:8081 "$ANLAM" anlam

  # Okuma kipi (10.11, Özet §106): kullanıcı seçtiyse büyük sohbet modeli açılmaz — bellek ve pil kalır.
  # Küçük anlam modeli açık kalır; sayfa soruya kitaplardaki bölümleri gösterir, cevap yazmaz.
  if [ "$(curl -s http://127.0.0.1:8888/api/kip)" = "okuma" ]; then
    echo "Okuma kipi seçili: büyük yapay zekâ açılmadı. Değiştirmek için: Kitaplık ve ayarlar → Okuma kipi."
  else
    "$LLAMA" --server --host 127.0.0.1 --port 8080 --no-webui -np 1 -m "$KOK/model/gemma3-4b.gguf" \
      -c 8192 >"$G/heybe_sohbet.log" 2>&1 &
    SOHBET=$!
    hazir_bekle http://127.0.0.1:8080 "$SOHBET" sohbet
  fi
else
  echo "Modeller henüz kurulmadı. Sayfada: Kitaplık ve ayarlar → İlk kurulum (internet bir kez gerekir)."
fi

# Çevirmen (TranslateGemma) başlatıcıda açılmaz: sayfada "başka dillerdeki kaynaklara da bak" seçiliyse yardımcı
# program gerekince açar ve kapanırken kapatır (06.11, Ercan'ın fikri — Özet §36). Açılış ~90 sn kısalır.

echo
echo "Heybe açık. Kapatmak için bu pencerede Enter'a bas."
read _

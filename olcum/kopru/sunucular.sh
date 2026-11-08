#!/bin/sh
# Dil köprüsü ölçümü için yerel sunucular (06.11.2026 — K17, Özet §29).
#   kütüphane 18888: Türkçe Vikipedi + İngilizce MDWiki (tıp ansiklopedisi)
#   sohbet 18080: Gemma 3 4B · anlam 18081: embeddinggemma 300M
# Bellekteki Heybe'nin kapılarına (8080, 8081, 8888, 8889) dokunmaz. Kapatmak: kill $(cat "$L/pid")
H=$(cd "$(dirname "$0")/../.." && pwd); T=$H/tasinabilir; K=$H/olcum/kaynak
L=$(mktemp -d "${TMPDIR:-/tmp}/heybe_kopru.XXXX")
LLAMA=$T/indirilen/llamafile-0.10.6
MODEL=${SOHBET_MODELI:-$T/indirilen/sohbet/gemma3-4b.gguf}
X=$L/kutuphane.xml
# EK_KITAP: boşlukla ayrılmış ek .zim yolları (07.11 kitap araştırması, Özet §48)
"$T/kiwix/kiwix-manage" "$X" add "$K/wikipedia_tr_all_nopic_2026-09.zim" "$K/mdwiki_en_all_maxi_2025-11.zim" $EK_KITAP || exit 1
"$T/kiwix/kiwix-serve" --port 18888 --address 127.0.0.1 --library "$X" >"$L/kutuphane.log" 2>&1 &
echo $! >"$L/pid"
"$LLAMA" --server --host 127.0.0.1 --port 18081 --no-webui -m "$T/indirilen/gomme/embeddinggemma-300M-Q8_0.gguf" \
  --embedding -c 8192 -b 2048 -ub 2048 >"$L/anlam.log" 2>&1 &
echo $! >>"$L/pid"
"$LLAMA" --server --host 127.0.0.1 --port 18080 --no-webui -np 1 -m "$MODEL" -c 8192 >"$L/sohbet.log" 2>&1 &
echo $! >>"$L/pid"
for k in 18081 18080; do
  s=0; until curl -s "http://127.0.0.1:$k/health" | grep -q ok; do sleep 1; s=$((s+1)); [ $s -ge 180 ] && { echo "$k açılamadı ($L)"; exit 2; }; done
done
curl -s -o /dev/null -w "kütüphane: HTTP %{http_code}\n" http://127.0.0.1:18888/catalog/v2/entries
echo "hazır · günlükler ve süreç numaraları: $L"

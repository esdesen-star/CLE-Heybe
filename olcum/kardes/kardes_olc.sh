#!/bin/sh
# Küçük kardeş sınavı (08.11.2026, Özet §58): aynı W seti (30 soru, başka yazar), aynı kütüphane, aynı bekçiler.
#   1) büyük Heybe (Gemma 3 4B + TranslateGemma) — bugünkü kodla karşılaştırma tabanı
#   2) Gemma 4 E2B cevap yazar, TranslateGemma çevirir
#   3) Gemma 4 E2B tek başına (çevirmen yok: hafif kardeşin gerçek düzeni)
# Bellekteki Heybe'nin kapılarına dokunmaz. Çıktılar olcum/sonuc/banka_<sürüm>_W_*.jsonl
H=$(cd "$(dirname "$0")/../.." && pwd); T=$H/tasinabilir; I=$T/indirilen
SET=${SET:-W}
cd "$H" || exit 1
CIKTI=$(sh olcum/kopru/sunucular.sh) || { echo "sunucular açılamadı: $CIKTI"; exit 2; }
echo "$CIKTI"; L=$(echo "$CIKTI" | sed -n 's/.*: \(\/.*\)$/\1/p' | tail -1)
nohup /bin/sh "$I/llamafile-0.10.6" --server --host 127.0.0.1 --port 18082 --no-webui --no-jinja -np 1 \
  -m "$I/ceviri/translategemma-4b-it.Q4_K_M.gguf" -c 4096 >"$L/cevirmen.log" 2>&1 &
echo $! >>"$L/pid"
nohup /bin/sh "$I/llamafile-0.10.6" --server --host 127.0.0.1 --port 18085 --no-webui -np 1 \
  -m "$I/kardes/gemma4e2b/gemma-4-E2B-it-Q4_0.gguf" -c 8192 >"$L/kardes.log" 2>&1 &
echo $! >>"$L/pid"
for k in 18082 18085; do
  s=0; until curl -s "http://127.0.0.1:$k/health" | grep -q ok; do sleep 1; s=$((s+1)); [ $s -ge 300 ] && { echo "$k açılamadı"; kill $(cat "$L/pid"); exit 3; }; done
done
echo "— denklik (YEREL=1) —"; YEREL=1 sh olcum/modelsiz.sh 2>&1 | tail -n 3
echo "— 1) büyük Heybe —";      SET=$SET AD=${SET}_buyuk node olcum/banka/olc_banka.cjs
echo "— 2) Gemma 4 E2B + çevirmen —"; SET=$SET AD=${SET}_g4kopru SOHBET=http://127.0.0.1:18085 KALIP=sablon node olcum/banka/olc_banka.cjs
echo "— 3) Gemma 4 E2B tek başına —"; SET=$SET AD=${SET}_g4tek SOHBET=http://127.0.0.1:18085 KALIP=sablon TEKMODEL=1 node olcum/banka/olc_banka.cjs
kill $(cat "$L/pid") 2>/dev/null
echo "bitti $(date '+%H:%M')"

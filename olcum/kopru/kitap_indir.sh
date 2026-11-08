#!/bin/sh
# Kiwix kitabını meta4 imzasıyla indirir, sha-256 doğrular, olcum/kaynak/ içine koyar (06.11.2026).
# Kullanım: sh olcum/kopru/kitap_indir.sh <meta4 adresi> ...
K=$(cd "$(dirname "$0")/.." && pwd)/kaynak
mkdir -p "$K" && cd "$K" || exit 1
for M in "$@"; do
  Z=$(basename "$M" .meta4)
  if [ -f "$Z" ]; then echo "$Z zaten var"; continue; fi
  bilgi=$(curl -sL "$M") || { echo "$Z: meta4 alınamadı"; continue; }
  h=$(printf '%s' "$bilgi" | sed -n 's/.*<hash type="sha-256">\([0-9a-f]\{64\}\)<\/hash>.*/\1/p' | head -1)
  [ -n "$h" ] || { echo "$Z: imza yok, indirilmedi"; continue; }
  echo "$h  $Z" > "$Z.sha256"
  for u in $(printf '%s' "$bilgi" | sed -n 's/.*<url[^>]*>\(https:\/\/[^<]*\.zim\)<\/url>.*/\1/p' | head -3); do
    curl -fL -C - --retry 2 -sS -o "$Z.part" "$u" && break
  done
  g=$(shasum -a 256 "$Z.part" 2>/dev/null | cut -c1-64)
  if [ "$g" = "$h" ]; then mv "$Z.part" "$Z"; echo "$Z: imza TAMAM ($(stat -f %z "$Z") bayt)"; else echo "$Z: İMZA UYUŞMUYOR"; fi
done

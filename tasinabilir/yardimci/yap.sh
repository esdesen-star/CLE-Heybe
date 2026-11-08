#!/bin/sh
# Yardımcı programı Mac (Apple ve Intel), Windows ve Linux (x86_64, ARM) için derler, kiwix araçlarını yanına koyar (06.11 · 08.11.2026).
# Kullanım: sh tasinabilir/yardimci/yap.sh   (Go gerekir: brew install go)
set -e
T=$(cd "$(dirname "$0")/.." && pwd)   # 07.11: yol betiğin yerinden (yayın için kişisel yol yok)
cd "$T/yardimci"
gofmt -l . | grep . && { echo "gofmt: biçim bozuk"; exit 1; } || true
go vet ./...
GOOS=windows GOARCH=amd64 go vet ./...
GOOS=linux GOARCH=amd64 go vet ./...
GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o "$T/usb_kok/program/macos-arm64/heybe-yardimci" .
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$T/usb_kok/program/windows-x86_64/heybe-yardimci.exe" .
# 08.11 (Özet §59): eski Intel Mac ve Linux (bilgisayar + Raspberry Pi gibi ARM kartlar) — henüz denenmedi
GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$T/usb_kok/program/macos-x86_64/heybe-yardimci" .
GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$T/usb_kok/program/linux-amd64/heybe-yardimci" .
GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o "$T/usb_kok/program/linux-arm64/heybe-yardimci" .
cp "$T/kiwix/kiwix-manage" "$T/usb_kok/program/macos-arm64/kiwix-manage"
cp "$T/indirilen/win/acik/kiwix-manage.exe" "$T/usb_kok/program/windows-x86_64/kiwix-manage.exe"
# kiwix 3.8.2 (08.11, Özet §59): resmî derlemeler indirilen/kiwix_312/<ad>/acik içinde (Kiwix bu araçlara sağlama yayınlamıyor;
# boy ve arşiv bütünlüğü denetlendi). Klasör yoksa programlar olduğu yerde kalır.
for c in kiwix-tools_macos-x86_64-3.8.2:macos-x86_64 kiwix-tools_linux-x86_64-3.8.2:linux-amd64 kiwix-tools_linux-aarch64-3.8.2:linux-arm64; do
  a=${c%%:*}; h=${c##*:}; d="$T/indirilen/kiwix_312/$a/acik"
  [ -d "$d" ] || continue
  for t in kiwix-serve kiwix-manage; do cp "$(find "$d" -type f -name $t | head -1)" "$T/usb_kok/program/$h/$t"; done
done
ls -l "$T"/usb_kok/program/*/ | grep -E "heybe|manage|serve|^/"

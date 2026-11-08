#!/bin/sh
# HEYBE belleğinden Mac'te soğuk açılış: başlatıcıyı çalıştırır, süreleri ve ilk cevabı ölçer.
# 06.11: her şey yardımcının adresinden (8888) geçer: /kiwix, /sohbet, /gomme. Deneme için: H=klasör sh bellek_sinav_mac.sh
H=${H:-/Volumes/HEYBE}
LOG=${TMPDIR:-/tmp}/heybe_baslatici.log
# ILIK=1: belleği çıkarıp takma (ekran kilitliyken macOS izin vermiyor — 06.11); ölçüm ılık olur
# ELLE=1: bellek az önce elle çıkarılıp takıldı (07.11, Ercan'ın eli) → betik çıkarmaz, ölçüm soğuktur
if [ "$H" = /Volumes/HEYBE ] && [ -n "$ELLE" ]; then
  echo "soğuk başlangıç (bellek elle çıkarılıp takıldı): $(date '+%H:%M:%S')"
elif [ "$H" = /Volumes/HEYBE ] && [ -z "$ILIK" ]; then
  DEV=$(diskutil info "$H" | awk -F: '/Device Node/{gsub(/ /,"",$2);print $2}')
  diskutil unmount "$H" >/dev/null || { echo "bellek çıkarılamadı, soğuk ölçüm olmaz"; exit 3; }
  sleep 2 && diskutil mount "$DEV" >/dev/null && sleep 2
  [ -d "$H" ] || { echo "bellek bağlanamadı"; exit 2; }
  echo "soğuk başlangıç (önbellek boşaltıldı): $(date '+%H:%M:%S')"
else
  echo "klasörden deneme (soğuk ölçüm değil): $H"
fi
# başlatıcı Enter bekler: girişini bir uyku tutar. 06.11 gece: 900 sn sabitti → BEKLE ile açık bırakılan Heybe
# 15 dakikada kendiliğinden kapanıyordu (sayfa denemesi "Failed to fetch") → BEKLE varsa bir gün
UYKU=900; [ -n "$BEKLE" ] && UYKU=86400
(sleep $UYKU) | sh "$H/Heybe_Mac.command" >"$LOG" 2>&1 &
BAS=$!
s=0
until grep -qE "sohbet hazır|Model hazır|açılamadı" "$LOG" 2>/dev/null; do sleep 1; s=$((s+1)); [ $s -ge 900 ] && break; done
# 06.11 gece: çevirmeni başlatıcı açmaz; sayfa gibi yardımcıdan iste, hazır olunca süreyi yaz (dil köprüsü)
if [ -f "$H/model/translategemma-4b.gguf" ]; then
  curl -s -X POST -H "X-Heybe: 1" -H "Content-Type: application/json" -d '{"ac":true}' http://127.0.0.1:8888/api/cevirmen >/dev/null
  c=0; until curl -s http://127.0.0.1:8888/cevirmen/health | grep -q ok; do sleep 1; c=$((c+1)); [ $c -ge 600 ] && break; done
  echo "cevirmen hazır: istekten $c sn sonra"
fi
cat "$LOG"
ara() { curl -s -o /dev/null -w "  kütüphane araması '%s': HTTP %{http_code}, %{time_total} sn\n" "http://127.0.0.1:8888/kiwix/search?books.filter.lang=tur&pattern=$1" | sed "s/%s/$2/"; }
ara "kalp%20masaj%C4%B1" "kalp masajı"
ara "sinek%20mantar%C4%B1" "sinek mantarı"
# Arkadaşa bütün akışla bir soru: başlık önerisi → arama → anlam sıralaması → kaynaklı cevap → denetçi
node -e "
const H = require('$H/heybe/arkadas.js');
H.AYAR.kutuphane = 'http://127.0.0.1:8888/kiwix'; H.AYAR.sohbet = 'http://127.0.0.1:8888/sohbet';
H.AYAR.gomme = 'http://127.0.0.1:8888/gomme'; H.AYAR.benim = 'http://127.0.0.1:8888/benim';
H.AYAR.cevirmen = 'http://127.0.0.1:8888/cevirmen';
const sorular = [['tr', 'Suyu kaynatarak arıtmak için ne kadar süre kaynatmak gerekir?'],
  ['cs', 'Které je nejlidnatější město Turecka?'], ['tr', 'Prag\\'da kaç kişi yaşıyor?']];   // köprü (06.11)
(async () => { for (const [dil, soru] of sorular) {
  try {
    const r = await H.sor(soru, () => {}, dil, { yedekDiller: 'hepsi', cevap: 'cevirerek' });
    const diller = [...new Set(r.parcalar.map((p) => p.dil || dil))].join('+');
    console.log('  [' + dil + '] ' + soru + ' → ' + r.toplam_sn + ' sn, kaynak dili ' + diller + (r.durdur ? ' DURDUR ' + r.eksik : '') + (r.bilgiYok ? ' BİLGİ YOK' : ''));
    console.log('     ' + r.cevap.replace(/\\s+/g, ' ').slice(0, 220));
  } catch (e) { console.log('  HATA: ' + e.message); }
} })();
"
# BEKLE=dosya verilirse Heybe açık kalır, o dosya silinince kapanır (sayfayı tarayıcıda denemek için, 06.11)
if [ -n "$BEKLE" ]; then touch "$BEKLE"; echo "  açık bırakıldı: $BEKLE silinince kapanır"; while [ -e "$BEKLE" ]; do sleep 2; done; fi
pkill -f "sleep $UYKU"; sleep 3   # bekleyen Enter gelir, başlatıcı kendi kapatır
pgrep -fl "$H/program" || echo "  sunucular kapandı"

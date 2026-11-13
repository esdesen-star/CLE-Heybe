@echo off
rem CLE Heybe - Windows baslatici. Bellegin kokunde durur, cift tiklayinca acilir.
rem Adres: http://127.0.0.1:8888 (yardimci program: sayfa, kitaplik, indirme, yukleme)
rem   kutuphane :8889 - anlam modeli :8081 - sohbet modeli :8080 - hepsi yalniz bu bilgisayardan erisilir.
rem Bellege yalniz kutuphane\ (indirilen kitaplar) ve heybe\benim\ (kendi dosyalarin) altina yazilir.
rem Sira onemli: yavas bellekte ayni anda acilan sunucular birbirini bekletir (05.11 olcumu). (06.11.2026 - Ozet 27)
title CLE Heybe
set "KOK=%~dp0"
set "P=%KOK%program\windows-x86_64"
set "LLAMA=%KOK%program\llamafile.exe"
echo CLE Heybe aciliyor...

start "Heybe Yardimci" /min "%P%\heybe-yardimci.exe"
set SAY=0
:yardimci
curl -s -o nul http://127.0.0.1:8888/api/durum && goto yardimci_hazir
set /a SAY+=1
if %SAY% GEQ 60 goto yardimci_hazir
timeout /t 1 /nobreak >nul
goto yardimci
:yardimci_hazir

start "Heybe Kutuphane" /min "%P%\kiwix-serve.exe" --port 8889 --address 127.0.0.1 --monitorLibrary --skipInvalid --urlRootLocation /kiwix --library "%KOK%kutuphane\kutuphane.xml"
set SAY=0
:kutuphane
curl -s -o nul http://127.0.0.1:8889/kiwix/ && goto kutuphane_hazir
set /a SAY+=1
if %SAY% GEQ 180 goto kutuphane_hazir
timeout /t 1 /nobreak >nul
goto kutuphane
:kutuphane_hazir
echo Kutuphane hazir.
start "" "http://127.0.0.1:8888/"

rem Ilk kurulum (08.11, Ozet 66): GitHub paketi modelsiz gelir. Model yoksa acilmaz; sayfa "Kitaplik ve ayarlar"da
rem indirmeyi onerir, yardimci program inen modelleri kendisi acar.
if not exist "%KOK%model\embeddinggemma-300M-Q8_0.gguf" goto modelsiz
if not exist "%KOK%model\gemma3-4b.gguf" goto modelsiz
start "Heybe Anlam" /min "%LLAMA%" --server --host 127.0.0.1 --port 8081 --no-webui -m "%KOK%model\embeddinggemma-300M-Q8_0.gguf" --embedding -c 8192 -b 2048 -ub 2048
set SAY=0
:anlam
curl -s http://127.0.0.1:8081/health | find "ok" >nul && goto anlam_hazir
set /a SAY+=1
if %SAY% GEQ 300 goto anlam_hazir
timeout /t 1 /nobreak >nul
goto anlam
:anlam_hazir
echo Anlam modeli hazir.

rem Okuma kipi (10.11, Ozet 106): kullanici sectiyse buyuk sohbet modeli acilmaz - bellek ve pil kalir
curl -s http://127.0.0.1:8888/api/kip | find "okuma" >nul && goto okuma_kipi
start "Heybe Sohbet" /min "%LLAMA%" --server --host 127.0.0.1 --port 8080 --no-webui -np 1 -m "%KOK%model\gemma3-4b.gguf" -c 8192
echo Sohbet modeli aciliyor; sayfa hazir olunca kendisi haber verir.
goto modeller_tamam
:okuma_kipi
echo Okuma kipi secili: buyuk yapay zeka acilmadi. Degistirmek icin: Kitaplik ve ayarlar - Okuma kipi.
goto modeller_tamam
:modelsiz
echo Modeller henuz kurulmadi. Sayfada: Kitaplik ve ayarlar - Ilk kurulum (internet bir kez gerekir).
:modeller_tamam
rem Cevirmen (TranslateGemma) burada acilmaz: sayfada "baska dillerdeki kaynaklara da bak" seciliyse yardimci program
rem gerekince acar (06.11, Ozet 36). Kapanista taskkill llamafile.exe cevirmeni de kapatir.
echo.
echo Heybe acik. Kapatmak icin bu pencerede bir tusa bas.
pause >nul
taskkill /im llamafile.exe /f >nul 2>&1
taskkill /im kiwix-serve.exe /f >nul 2>&1
taskkill /im heybe-yardimci.exe /f >nul 2>&1

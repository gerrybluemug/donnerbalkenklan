@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Donnerbalkenklan - Gildenbank hochladen

rem ===========================================================================
rem  Lädt die Daten des Addons "Donnerbalken Bank" auf die Gilden-Homepage.
rem  Einfach doppelklicken (am besten nach dem Ausloggen aus WoW).
rem
rem  Voraussetzungen: Git und Node.js installiert, Schreibrechte am
rem  GitHub-Repository gerrybluemug/donnerbalkenklan.
rem  Liegt WoW woanders, die Zeile "set WOW=..." unten anpassen.
rem ===========================================================================

set "WOW=C:\Games\World of Warcraft\_forever_"
if not exist "%WOW%\WTF" set "WOW=C:\Program Files (x86)\World of Warcraft\_forever_"
set "REPO=%LOCALAPPDATA%\Donnerbalkenklan\homepage"
set "URL=https://github.com/gerrybluemug/donnerbalkenklan.git"

echo.
echo  Donnerbalkenklan - Gildenbank hochladen
echo  =======================================
echo.

tasklist /FI "IMAGENAME eq Wow.exe" 2>nul | find /I "Wow.exe" >nul
if not errorlevel 1 (
  echo  Hinweis: WoW läuft noch. WoW speichert die Addon-Daten erst beim
  echo  Ausloggen oder nach /reload - sonst wird der letzte Stand hochgeladen.
  echo.
)

where git >nul 2>&1 || (echo  Git ist nicht installiert: https://git-scm.com/download/win & goto :ende)
where node >nul 2>&1 || (echo  Node.js ist nicht installiert: https://nodejs.org & goto :ende)

if not exist "%WOW%\WTF\Account" (
  echo  WoW-Forever-Ordner nicht gefunden: %WOW%
  echo  Bitte in dieser Datei die Zeile "set WOW=..." anpassen.
  goto :ende
)

if exist "%REPO%\.git" (
  echo  Hole den aktuellen Stand der Homepage ...
  git -C "%REPO%" pull -q --rebase || goto :fehler
) else (
  echo  Lade die Homepage einmalig herunter ...
  git clone -q "%URL%" "%REPO%" || goto :fehler
)
echo.

set "FOUND=0"
for /d %%A in ("%WOW%\WTF\Account\*") do (
  if exist "%%A\SavedVariables\DonnerbalkenBank.lua" (
    set "FOUND=1"
    echo  Konto %%~nxA:
    node "%REPO%\scripts\import-bank.mjs" "%%A\SavedVariables\DonnerbalkenBank.lua" || goto :fehler
    echo.
  )
)
if "!FOUND!"=="0" (
  echo  Keine Addon-Daten gefunden. Im Spiel auf dem Bank-Charakter /gbank an
  echo  eingeben, die Bank öffnen und danach ausloggen.
  goto :ende
)

git -C "%REPO%" diff --quiet -- data/bank.js
if not errorlevel 1 (
  echo  Die Homepage ist schon auf dem neuesten Stand.
  goto :ende
)

echo  Lade zu GitHub hoch ...
git -C "%REPO%" add data/bank.js || goto :fehler
git -C "%REPO%" commit -q -m "Gildenbank aktualisiert" || goto :fehler
git -C "%REPO%" pull -q --rebase || goto :fehler
git -C "%REPO%" push -q || goto :fehler
echo.
echo  Fertig! In etwa einer Minute ist die Homepage aktuell:
echo  https://gerrybluemug.github.io/donnerbalkenklan/gildenbank.html
goto :ende

:fehler
echo.
echo  Da ist etwas schiefgegangen - siehe Meldung oben.

:ende
echo.
pause

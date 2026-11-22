# Donnerbalkenklan – Gilden-Homepage

Statische Webseite (nur HTML/CSS/JS, kein Server nötig) für die Horde-Gilde
**Donnerbalkenklan** auf WoW Forever (EU).

Online: **https://donnerbalkenklan.free-kick.de**

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Startseite (Über uns, News, Statistik, Mitmachen) |
| `mitglieder.html` | Mitgliederliste |
| `chronik.html` | Chronik: Aufsteiger der Woche, Kommen & Gehen, Ruhmeshalle, Gildenwachstum |
| `gildenbank.html` | Gildenbank: Bestand, Ladenhüter, größte Spender, Einzahlungen, Mitgliederecke |
| `data/history.js` | Verlauf der Mitgliederliste (täglich fortgeschrieben, Grundlage der Chronik) |
| `scripts/history.mjs` | Schreibt den Verlauf fort (wird von `update-roster.mjs` aufgerufen) |
| `api/` | Mitgliederecke (PHP) für den eigenen Webspace – siehe unten |
| `app.js`, `style.css` | Gemeinsamer Code und Gestaltung aller Seiten |
| `config.js` | **Hier anpassen:** Texte, News, Termine, Rangnamen, Discord-Link |
| `data/roster.js` | Mitgliederdaten aus der Armory (automatisch erzeugt) |
| `scripts/update-roster.mjs` | Holt die aktuelle Mitgliederliste aus der Armory |
| `.github/workflows/update-roster.yml` | Tägliches Auto-Update + Veröffentlichung über GitHub Pages |
| `data/bank.js` | Gildenbank-Daten (aus dem Addon importiert) |
| `scripts/import-bank.mjs` | Übernimmt den Addon-Export nach `data/bank.js` |
| `scripts/Gildenbank-hochladen.bat` | Lädt die Addon-Daten per Doppelklick hoch |
| `addon/DonnerbalkenBank/` | WoW-Addon, das Bank-Charaktere und Gildenbank ausliest |

## Gildenbank

Der Menüpunkt „Gildenbank“ (Seite `gildenbank.html`) erscheint automatisch,
sobald die ersten Bankdaten importiert wurden.

### 1. Addon installieren (auf dem PC, auf dem die Bank-Charaktere gespielt werden)

1. Repository als ZIP herunterladen:
   https://github.com/gerrybluemug/donnerbalkenklan/archive/refs/heads/main.zip
2. Den Ordner `addon/DonnerbalkenBank` in den AddOns-Ordner von WoW Forever
   kopieren (`…\World of Warcraft\_forever_\Interface\AddOns\`).
3. Im Spiel auf jedem Bank-Charakter einmal `/gbank an` eingeben.
4. Danach einfach wie gewohnt die Bank öffnen – das Addon liest Taschen,
   Bankfach und Gold dann selbst aus. Ist später eine echte Gildenbank da,
   wird sie beim Öffnen ebenfalls erfasst.

Wird das Addon im Spiel als „Inkompatibel“ angezeigt, passt die Versionsnummer
in der ersten Zeile von `DonnerbalkenBank.toc` nicht mehr (WoW Forever: `16001`,
Stand November 2026). Die aktuelle Nummer zeigt `/dump select(4, GetBuildInfo())`.

Weitere Befehle: `/gbank status` (was wurde erfasst), `/gbank aus` (Charakter nicht mehr erfassen).

**Lagerdauer:** Das Addon merkt sich, seit wann jeder Gegenstand auf einem
Bank-Charakter bzw. in der Gildenbank liegt. Umlagern (Taschen ↔ Bankfach,
Gildenbankfach ↔ Gildenbankfach) setzt die Zeit nicht zurück; wird ein
Gegenstand komplett entnommen, beginnt die Zählung beim nächsten Einlagern neu.
Was beim allerersten Auslesen schon da war, wird als „seit ≥ …“ angezeigt,
weil das Addon nicht wissen kann, wie lange es vorher schon dort lag.
Gegenstände, die länger als 30 Tage liegen, werden auf der Seite orange markiert.

**Protokoll & Spender:** Beim Öffnen der Gildenbank liest das Addon auch das
Gildenbank-Protokoll aus – wer was eingelagert und wer wie viel Gold
eingezahlt hat. **Entnahmen werden nicht veröffentlicht:** Das Addon merkt
sie sich zwar im Spiel, exportiert aber nur Einzahlungen/Einlagerungen, und
der Import verwirft alles andere. Das klappt mit jedem Charakter, der das Addon
hat (kein `/gbank an` nötig), aber nur für Fächer, deren Protokoll der
Charakter laut Gildenrang sehen darf. WoW zeigt je Fach nur die letzten 25
Einträge; das Addon sammelt sie bei jedem Öffnen und baut so eine längere
Historie auf – also die Gildenbank ruhig regelmäßig öffnen. Zeiten sind nur
auf die Stunde genau.

**Gildentermine:** Das Addon liest (mit jedem Charakter in der Gilde, auch ohne
`/gbank an`) kurz nach dem Einloggen die Gildentermine und Gildenankündigungen
der nächsten drei Monate aus dem Ingame-Kalender. Sie landen beim nächsten
Hochladen auf der Startseite unter „Nächste Gildentermine“ (Zeiten in Serverzeit).
Die festen Termine aus `config.js` bleiben zusätzlich stehen.

### 2. Daten auf die Homepage bringen – am einfachsten: Doppelklick

`scripts/Gildenbank-hochladen.bat` auf den Desktop kopieren. Nach dem
Ausloggen aus WoW doppelklicken – fertig. Die Datei sucht die Addon-Daten
aller WoW-Konten auf dem PC, übernimmt sie und lädt sie zu GitHub hoch.
Beim ersten Start legt sie dafür eine Kopie der Homepage unter
`%LOCALAPPDATA%\Donnerbalkenklan\homepage` an.

Voraussetzungen: Git und Node.js installiert, Schreibrechte am Repository.
Liegt WoW nicht unter `C:\Games\World of Warcraft`, die Zeile `set "WOW=..."`
in der Datei anpassen.

### 2. Daten auf die Homepage bringen – Variante A: im Browser

1. Im Spiel `/gbank export` eingeben, der Text ist bereits markiert → **Strg+C**.
2. Auf GitHub: *Actions → „Mitgliederliste aktualisieren“ → Run workflow*.
3. Den Text in das Feld „Gildenbank“ einfügen (**Strg+V**) und auf *Run workflow* klicken.
4. Nach etwa einer Minute ist die Seite aktualisiert.

(Das geht nur mit Schreibrechten am Repository – Offiziere kann man unter
*Settings → Collaborators* hinzufügen.)

### 2. Daten auf die Homepage bringen – Variante B: per Skript

Nach dem Ausloggen (dann schreibt WoW die Addon-Daten auf die Festplatte):

```
node scripts/import-bank.mjs "<WoW-Ordner>\WTF\Account\<KONTO>\SavedVariables\DonnerbalkenBank.lua" --push
```

Mehrere Bank-Charaktere – auch von verschiedenen WoW-Accounts – werden
zusammengeführt; pro Charakter zählt jeweils der neueste Stand.

## Chronik & Spielereien

- **Chronik** (`chronik.html`): Der tägliche Bot schreibt bei jedem Abruf der
  Mitgliederliste einen Verlauf nach `data/history.js` (Stufen, Beitritte,
  Austritte, erreichte Höchststufe). Daraus entstehen Aufsteiger der Woche,
  Neuzugänge/Ehemalige der letzten 30 Tage, die Ruhmeshalle und das
  Gildenwachstum. Aufgezeichnet wird ab dem 22.11.2026 – wer vorher schon auf
  Höchststufe war, steht als „vor dem 22. November 2026“ in der Ruhmeshalle.
- **Startseite:** Mitglied des Tages (Sprüche in `config.js` unter `motdLines`),
  Aufsteiger der Woche, Ladenhüter des Monats (was am längsten in der Bank liegt)
  und wie viele gerade im Discord online sind.
- **Mitgliederliste:** 💰 für die 10 größten Spender der Gildenbank, „neu“ für
  alle, die in den letzten 7 Tagen beigetreten sind.

## Mitgliederecke (Bedarf an Gildenbank-Gegenständen anmelden)

Mitglieder melden sich auf der Gildenbank-Seite mit Discord an und klicken bei
einem Gegenstand auf „Bedarf“. Alle Angemeldeten sehen, wer was braucht;
Offiziere können Anmeldungen als „erledigt“ abhaken. GitHub Pages kann nichts
speichern, deshalb läuft dieser Teil als kleines PHP-Skript (Ordner `api/`) auf
dem Hetzner-Webspace (Webhosting S, Server 167.235.121.130) unter der Subdomain
`donnerbalken-api.free-kick.de`. (free-kick.de selbst läuft auf einem anderen
Server, deshalb eine eigene Subdomain.) Die Daten liegen dort in einer
SQLite-Datei im Unterordner `data/` (wird automatisch angelegt und ist von außen
gesperrt).

Einrichtung (einmalig):

1. **Discord-App anlegen:** https://discord.com/developers/applications →
   *New Application* (z. B. „Donnerbalkenklan Homepage“) → *OAuth2*.
   *Client ID* notieren, *Client Secret* erzeugen und notieren. Unter
   *Redirects* eintragen: `https://donnerbalken-api.free-kick.de/?action=callback`
2. **Dateien vorbereiten:** `api/config.sample.php` als `config.php` speichern
   und Client ID und Client Secret eintragen. Optional Offiziers-Rollen
   (`officer_roles`) und Pflicht-Rollen (`required_role`, eine davon genügt;
   Offiziere dürfen immer) eintragen – die
   Rollen-ID bekommt man in Discord mit eingeschaltetem Entwicklermodus per
   Rechtsklick auf die Rolle → „ID kopieren“.
   `config.php` enthält das Geheimnis und gehört **nicht** ins Repository
   (steht in `.gitignore`).
3. **Subdomain:** In der Hetzner Console (DNS → free-kick.de) einen A-Eintrag
   `donnerbalken-api` → `167.235.121.130` und einen AAAA-Eintrag
   `donnerbalken-api` → `2a01:4f8:1061:21b5::2` anlegen. In konsoleH die
   Subdomain `donnerbalken-api` anlegen (eigener Ordner) und dafür ein
   kostenloses Let's-Encrypt-Zertifikat (SSL) einschalten.
4. **Hochladen:** In den Ordner der Subdomain `index.php`, `.htaccess` und
   `config.php` laden (Dateimanager oder FTP). Der Webspace braucht PHP 8 mit
   SQLite (bei Hetzner Standard; PHP-Version in konsoleH prüfen).
5. **Einschalten:** In `config.js` `needsApi: "https://donnerbalken-api.free-kick.de/"`
   eintragen und hochladen.

Ohne Anmeldung zeigt die Seite nur, wie oft ein Gegenstand angemeldet ist.

## Ansehen

`index.html` doppelklicken – die Seite funktioniert auch ohne Webserver.

## Mitgliederliste aktualisieren

Mit installiertem Node.js (Version 18 oder neuer):

```
node scripts/update-roster.mjs
```

Danach steht die neue Liste in `data/roster.js`.

## Online stellen (kostenlos über GitHub Pages)

1. Neues GitHub-Repository anlegen und alle Dateien hochladen.
2. Im Repository: *Settings → Pages → Source:* **GitHub Actions** wählen.
3. Der Workflow holt die Mitgliederliste dann jeden Tag neu und veröffentlicht die Seite.

### Eigene Domain

Die Seite läuft unter `donnerbalkenklan.free-kick.de`. Dafür gibt es bei
Hetzner (Hetzner Console → DNS → free-kick.de) einen DNS-Eintrag:

| Typ | Name | Wert |
|---|---|---|
| CNAME | `donnerbalkenklan` | `gerrybluemug.github.io.` |

und auf GitHub unter *Settings → Pages → Custom domain* die Domain
`donnerbalkenklan.free-kick.de` mit „Enforce HTTPS“. Die alte Adresse
`gerrybluemug.github.io/donnerbalkenklan` leitet automatisch dorthin um.
Wird der DNS-Eintrag gelöscht, ist die Seite nur noch über GitHub erreichbar,
wenn auch die Custom domain auf GitHub wieder entfernt wird.

## Wichtig zur Datenquelle

Für „WoW Forever“ gibt es (Stand November 2026) keine offiziell dokumentierte
Blizzard-API. Die Armory-Seite selbst lädt die Gildenliste über eine interne
GraphQL-Schnittstelle, und genau die nutzt das Update-Skript. Sie kann sich
ohne Vorwarnung ändern. Schlägt das Update fehl, bleibt die letzte Liste online.

Die Schnittstelle akzeptiert nur Abfragen, die die Armory-Seite selbst
registriert hat. Das Skript nutzt deshalb deren Kennung (`ROSTER_QUERY_ID` in
`scripts/update-roster.mjs`). Meldet das Skript `PersistedQueryNotFound`, hat
Blizzard die Seite aktualisiert und die Kennung muss erneuert werden. Sie steht
in der Armory-Gildenseite in den Entwicklertools (F12 → Netzwerk → Anfrage
`graphql` → Nutzlast → `extensions.persistedQuery.sha256Hash`).

Die Rangnamen liefert die Armory nicht mit (nur Nummern 0–5). Sie werden in
`config.js` unter `rankNames` eingetragen.

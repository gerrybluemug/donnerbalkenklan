# Donnerbalkenklan – Gilden-Homepage

Statische Webseite (nur HTML/CSS/JS, kein Server nötig) für die Horde-Gilde
**Donnerbalkenklan** auf WoW Forever (EU).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Die Seite |
| `config.js` | **Hier anpassen:** Texte, News, Termine, Rangnamen, Discord-Link |
| `data/roster.js` | Mitgliederdaten aus der Armory (automatisch erzeugt) |
| `scripts/update-roster.mjs` | Holt die aktuelle Mitgliederliste aus der Armory |
| `.github/workflows/update-roster.yml` | Tägliches Auto-Update + Veröffentlichung über GitHub Pages |

| `data/bank.js` | Gildenbank-Daten (aus dem Addon importiert) |
| `scripts/import-bank.mjs` | Übernimmt den Addon-Export nach `data/bank.js` |
| `addon/DonnerbalkenBank/` | WoW-Addon, das Bank-Charaktere und Gildenbank ausliest |

## Gildenbank

Der Bereich „Gildenbank“ erscheint auf der Seite automatisch, sobald die
ersten Bankdaten importiert wurden.

### 1. Addon installieren (auf dem PC, auf dem die Bank-Charaktere gespielt werden)

1. Repository als ZIP herunterladen:
   https://github.com/gerrybluemug/donnerbalkenklan/archive/refs/heads/main.zip
2. Den Ordner `addon/DonnerbalkenBank` in den AddOns-Ordner von WoW Forever
   kopieren (`…\World of Warcraft\<Spielversion>\Interface\AddOns\`).
3. Im Spiel auf jedem Bank-Charakter einmal `/gbank an` eingeben.
4. Danach einfach wie gewohnt die Bank öffnen – das Addon liest Taschen,
   Bankfach und Gold dann selbst aus. Ist später eine echte Gildenbank da,
   wird sie beim Öffnen ebenfalls erfasst.

Wird das Addon im Spiel als „veraltet“ angezeigt, im AddOn-Menü „Veraltete
AddOns laden“ anhaken. (Die passende Versionsnummer zeigt `/dump select(4, GetBuildInfo())`;
sie gehört in die erste Zeile von `DonnerbalkenBank.toc`.)

Weitere Befehle: `/gbank status` (was wurde erfasst), `/gbank aus` (Charakter nicht mehr erfassen).

**Lagerdauer:** Das Addon merkt sich, seit wann jeder Gegenstand auf einem
Bank-Charakter bzw. in der Gildenbank liegt. Umlagern (Taschen ↔ Bankfach,
Gildenbankfach ↔ Gildenbankfach) setzt die Zeit nicht zurück; wird ein
Gegenstand komplett entnommen, beginnt die Zählung beim nächsten Einlagern neu.
Was beim allerersten Auslesen schon da war, wird als „seit ≥ …“ angezeigt,
weil das Addon nicht wissen kann, wie lange es vorher schon dort lag.
Gegenstände, die länger als 30 Tage liegen, werden auf der Seite orange markiert.

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

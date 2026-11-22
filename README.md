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

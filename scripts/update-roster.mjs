// Holt die aktuelle Mitgliederliste der Gilde aus der WoW-Armory
// und schreibt sie nach data/roster.js.
//
// Aufruf (Node 18+):   node scripts/update-roster.mjs
//
// Hinweis: Die Armory-Seite für "WoW Forever" lädt ihre Daten über eine
// interne GraphQL-Schnittstelle von Blizzard. Diese ist nicht offiziell
// dokumentiert und kann sich jederzeit ändern. Wenn das Skript irgendwann
// fehlschlägt, bleibt die alte data/roster.js einfach unverändert.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const GUILD = { nameSlug: "donnerbalkenklan", region: "eu" };
const ENDPOINT = "https://worldofwarcraft.blizzard.com/de-de/graphql";

// Die Schnittstelle nimmt keine frei formulierten Abfragen an, sondern nur
// Abfragen, die die Armory-Seite selbst registriert hat. Diese Kennung gehört
// zur Abfrage "GetGuildRoster" der Gildenseite (Stand 22.11.2026).
// Meldet das Skript "PersistedQueryNotFound", hat Blizzard die Seite
// aktualisiert und die Kennung muss erneuert werden (siehe README).
const ROSTER_QUERY_ID = "5f32b85faa248d321a08645d470fb38b82be64b9abd8b5b5fd2816620546794b";

// Der Endpunkt /de-de/graphql gilt für alle WoW-Versionen. Die Armory-Seite
// schickt ihre eigene Adresse als Herkunft mit; daran erkennt der Server
// offenbar, dass es um WoW Forever geht. Ohne diese Angabe antwortet er
// mit "Internal Server Error".
const GUILD_PAGE = `https://worldofwarcraft.blizzard.com/de-de/forever/${GUILD.region}/armory/guild/${GUILD.nameSlug}`;

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "accept-language": "de-de",
    origin: "https://worldofwarcraft.blizzard.com",
    referer: GUILD_PAGE,
  },
  body: JSON.stringify({
    operationName: "GetGuildRoster",
    variables: { guild: GUILD, showMessageOfTheDay: false, showRoles: false },
    extensions: { persistedQuery: { version: 1, sha256Hash: ROSTER_QUERY_ID } },
  }),
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { throw new Error(`Armory antwortet mit HTTP ${res.status}: ${text.slice(0, 200)}`); }
if (json.errors?.length) throw new Error(`Armory-Fehler (HTTP ${res.status}): ` + JSON.stringify(json.errors));
if (!res.ok) throw new Error(`Armory antwortet mit HTTP ${res.status}`);

const roster = json.data?.Guild?.roster;
if (!Array.isArray(roster) || roster.length === 0) throw new Error("Keine Mitglieder erhalten – Abbruch, alte Daten bleiben erhalten.");

const members = roster.map(({ rank, character: c }) => ({
  name: c.name,
  surname: c.surname,
  slug: decodeURIComponent((c.url || "").split("/").pop() || `${c.name}-${c.surname}`.toLowerCase()),
  level: c.level,
  ilvl: c.averageItemLevel ?? null,
  race: c.race?.enum,
  raceName: c.race?.name,
  cls: c.class?.enum,
  rank: rank?.rankId ?? null,
  gender: c.gender?.enum ?? null,
}));

const data = {
  updated: new Date().toISOString(),
  maxLevel: json.data.GameConstants?.maxLevel ?? 60,
  members,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "roster.js");
await writeFile(out, "// Automatisch erzeugt von scripts/update-roster.mjs – nicht von Hand bearbeiten.\nwindow.ROSTER = " + JSON.stringify(data, null, 1) + ";\n", "utf8");
console.log(`${members.length} Mitglieder gespeichert → ${out}`);

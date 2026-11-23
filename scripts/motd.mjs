// Legt das "Mitglied des Tages" fest und schreibt es nach data/motd.js.
// Läuft im Bot kurz nach Mitternacht (deutsche Zeit). Ist für heute schon jemand
// festgelegt, ändert das Skript nichts – so bleibt die Wahl den ganzen Tag gleich,
// auch wenn tagsüber neue Mitglieder- oder Gildenbankdaten kommen.
//
// Aufruf (Node 18+):   node scripts/motd.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "data", "motd.js");

// Die Browser-Dateien (window.XYZ = ...) mit einem Ersatz-"window" einlesen
const w = {};
for (const f of ["config.js", "data/roster.js", "data/bank.js", "data/history.js", "motd-pick.js"]) {
  try { new Function("window", await readFile(join(root, f), "utf8"))(w); } catch { /* Datei fehlt – dann ohne */ }
}

const today = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 10);
try {
  const old = await readFile(out, "utf8");
  if (JSON.parse(old.slice(old.indexOf("{"), old.lastIndexOf("}") + 1)).date === today) {
    console.log(`Mitglied des Tages für ${today} steht schon fest.`);
    process.exit(0);
  }
} catch { /* noch keine Datei */ }

const C = w.GUILD_CONFIG || {};
const m = w.ROSTER?.members?.length && w.pickMemberOfDay(w.ROSTER.members, {
  today,
  history: w.HISTORY,
  inactive: w.BANK?.inactive,
  skipRanks: C.motdSkipRanks || [],
});
if (!m) { console.log("Keine Mitglieder – nichts festgelegt."); process.exit(0); }

await writeFile(out, "// Automatisch erzeugt von scripts/motd.mjs – nicht von Hand bearbeiten.\nwindow.MOTD = " +
  JSON.stringify({ date: today, slug: m.slug }) + ";\n", "utf8");
console.log(`Mitglied des Tages ${today}: ${m.name} ${m.surname || ""}`.trim());

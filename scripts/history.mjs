// Verlauf der Mitgliederliste für die Chronik (Aufsteiger der Woche,
// Neuzugänge/Abgänge, Ruhmeshalle, Gildenwachstum).
//
// Wird von update-roster.mjs nach jedem Abruf aufgerufen. Die Armory kennt
// nur den aktuellen Stand – der Verlauf entsteht erst ab dem ersten Tag,
// an dem dieses Skript lief.
//
// Einmalig den Verlauf aus der Git-Historie von data/roster.js aufbauen:
//   node scripts/history.mjs --rebuild
//
// Aufbau von data/history.js:
//   start  erster aufgezeichneter Tag (JJJJ-MM-TT)
//   days   je Tag [Datum, Mitglieder, Ø Stufe, auf Höchststufe]
//   chars  je Charakter (Schlüssel = Armory-Slug):
//          n   Name, c Klasse
//          j   Beitrittstag (null = war schon vor Aufzeichnungsbeginn da)
//          l   Tag des Austritts (fehlt, solange in der Gilde)
//          lv  Stufenverlauf [[Datum, Stufe], …] – nur Änderungen
//          m   Tag, an dem die Höchststufe erreicht wurde
//              (null = war schon beim ersten Sehen auf Höchststufe)

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const historyFile = join(root, "data", "history.js");

// Ausgetretene Charaktere so lange behalten
const KEEP_LEFT_DAYS = 365;

// Kalendertag in deutscher Zeit
export const dayOf = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

export async function loadHistory() {
  try {
    const s = await readFile(historyFile, "utf8");
    return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

export async function saveHistory(h) {
  // kompakt, aber zeilenweise je Charakter (übersichtliche Git-Diffs)
  const chars = Object.entries(h.chars).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const days = h.days.map((d) => ` ${JSON.stringify(d)}`).join(",\n");
  const body = `{\n"start": ${JSON.stringify(h.start)},\n"days": [\n${days}\n],\n"chars": {\n${chars}\n}\n}`;
  await writeFile(historyFile, "// Automatisch erzeugt von scripts/history.mjs – nicht von Hand bearbeiten.\nwindow.HISTORY = " + body + ";\n", "utf8");
}

// Einen Abruf der Mitgliederliste in den Verlauf übernehmen
export function addSnapshot(h, roster) {
  const today = dayOf(roster.updated || Date.now());
  const max = roster.maxLevel || 60;
  const first = !h;
  h ??= { start: today, days: [], chars: {} };
  if (h.days.length && today < h.days[h.days.length - 1][0]) return h; // älter als der Verlauf

  const seen = new Set();
  for (const m of roster.members) {
    if (!m.slug) continue;
    seen.add(m.slug);
    let c = h.chars[m.slug];
    if (!c) {
      c = h.chars[m.slug] = { n: `${m.name} ${m.surname ?? ""}`.trim(), c: m.cls, j: first ? null : today, lv: [] };
      // schon auf Höchststufe, als wir ihn zum ersten Mal sehen: Datum unbekannt
      if (m.level >= max) c.m = null;
    } else if (c.l) {
      delete c.l; // wieder beigetreten
      c.j = today;
    }
    c.n = `${m.name} ${m.surname ?? ""}`.trim();
    c.c = m.cls;
    const last = c.lv[c.lv.length - 1];
    if (!last || last[1] !== m.level) {
      if (last && last[0] === today) last[1] = m.level;
      else c.lv.push([today, m.level]);
    }
    if (m.level >= max && !("m" in c)) c.m = today;
  }
  for (const [slug, c] of Object.entries(h.chars)) {
    if (!seen.has(slug) && !c.l) c.l = today;
    if (c.l && daysBetween(c.l, today) > KEEP_LEFT_DAYS) delete h.chars[slug];
  }

  const M = roster.members;
  const avg = M.length ? M.reduce((s, m) => s + m.level, 0) / M.length : 0;
  const row = [today, M.length, Math.round(avg * 10) / 10, M.filter((m) => m.level >= max).length];
  if (h.days.length && h.days[h.days.length - 1][0] === today) h.days[h.days.length - 1] = row;
  else h.days.push(row);
  return h;
}

// ---------- Aufruf von der Kommandozeile ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--rebuild")) {
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
  const commits = git("log", "--reverse", "--format=%H", "--", "data/roster.js").trim().split("\n").filter(Boolean);
  let h = null;
  for (const sha of commits) {
    const s = git("show", `${sha}:data/roster.js`);
    const roster = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    if (roster.members?.length) h = addSnapshot(h, roster);
  }
  // aktueller (evtl. noch nicht committeter) Stand
  const cur = await readFile(join(root, "data", "roster.js"), "utf8");
  h = addSnapshot(h, JSON.parse(cur.slice(cur.indexOf("{"), cur.lastIndexOf("}") + 1)));
  await saveHistory(h);
  console.log(`Verlauf aus ${commits.length} Ständen aufgebaut: ${Object.keys(h.chars).length} Charaktere, ${h.days.length} Tage.`);
}

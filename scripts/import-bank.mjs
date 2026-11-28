// Übernimmt den Export des Addons "Donnerbalken Bank" nach data/bank.js.
//
// Aufruf (Node 18+), eine der drei Varianten:
//   node scripts/import-bank.mjs "<WoW-Ordner>\WTF\Account\<KONTO>\SavedVariables\DonnerbalkenBank.lua"
//   node scripts/import-bank.mjs export.txt          (Datei mit dem kopierten Export-Text)
//   BANK_EXPORT='{"v":1,...}' node scripts/import-bank.mjs --env
//
// Zusatzoption --push: danach automatisch committen und zu GitHub hochladen.
//
// Mehrere Bank-Charaktere (auch von verschiedenen WoW-Accounts) werden
// zusammengeführt; pro Charakter gewinnt jeweils der neuere Stand.

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bankFile = join(root, "data", "bank.js");
const args = process.argv.slice(2);
const push = args.includes("--push");
const src = args.find((a) => !a.startsWith("--"));

function fail(msg) {
  console.error("Fehler: " + msg);
  process.exit(1);
}

// ---------- Export-Text besorgen ----------
let raw;
if (args.includes("--env")) raw = process.env.BANK_EXPORT || "";
else if (src) {
  const buf = await readFile(src);
  raw = buf.toString("utf8");
  if (/DonnerbalkenBankDB\s*=/.test(raw)) {
    // SavedVariables-Datei: den gespeicherten Export-String herauslösen.
    // Byteweise lesen (latin1), Lua-Escapes auflösen, dann als UTF-8 deuten.
    const m = buf.toString("latin1").match(/\["lastExport"\]\s*=\s*"((?:[^"\\]|\\[\s\S])*)"/);
    if (!m) fail("In der SavedVariables-Datei steht noch kein Export. Einmal im Spiel /gbank an und die Bank öffnen, dann ausloggen.");
    const bytes = m[1].replace(/\\(\d{1,3}|[\s\S])/g, (_, c) =>
      /^\d+$/.test(c) ? String.fromCharCode(+c) : ({ n: "\n", r: "\r", t: "\t", "\n": "\n" }[c] ?? c));
    raw = Buffer.from(bytes, "latin1").toString("utf8");
  }
} else fail("Bitte eine Datei angeben oder --env verwenden (siehe Kopf dieser Datei).");

let data;
try { data = JSON.parse(raw.trim()); } catch { fail("Der Export-Text ist kein gültiges JSON – wurde er vollständig kopiert?"); }
if (!data || data.v !== 1) fail("Unbekanntes Exportformat.");

// ---------- prüfen & bereinigen ----------
const str = (s, max = 100) => String(s ?? "").slice(0, max);
const int = (n, min = 0, max = 1e12) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));
const time = (t) => (t ? new Date(int(t) * 1000).toISOString() : null);
// Element 6/7 (ab Addon 1.1): seit wann der Gegenstand da ist / ob er schon
// beim allerersten Auslesen da war (dann liegt er womöglich schon länger).
const item = (it, where) => Array.isArray(it) && it.length >= 4
  ? {
      id: int(it[0]), name: str(it[1]), q: int(it[2], 0, 8), n: int(it[3], 1, 1e6), where: str(where ?? it[4], 30),
      since: time(it[5]), atLeast: it[6] === 1,
    }
  : null;

const chars = {};
for (const [name, c] of Object.entries(Array.isArray(data.chars) ? {} : data.chars || {})) {
  if (!c || typeof c !== "object") continue;
  chars[str(name, 50)] = {
    updated: time(c.updated),
    bankUpdated: time(c.bankUpdated),
    money: int(c.money),
    items: [...(c.bags || []).map((i) => item(i, "Taschen")), ...(c.bank || []).map((i) => item(i, "Bank"))].filter(Boolean),
  };
}
let guild = null;
if (data.guild && typeof data.guild === "object") {
  guild = {
    updated: time(data.guild.updated),
    money: int(data.guild.money),
    tabs: (data.guild.tabs || []).map((t) => ({
      name: str(t.name, 50),
      viewable: !!t.viewable,
      items: (t.items || []).map((i) => item(i, t.name)).filter(Boolean),
    })),
  };
}

// Gildenbank-Protokoll (ab Addon 1.3) – nur Einzahlungen/Einlagerungen,
// Entnahmen werden bewusst nicht veröffentlicht
const LOG_TYPES = ["deposit", "depositSummary"];
const logItem = (e) => Array.isArray(e) && e.length >= 8 && LOG_TYPES.includes(e[1])
  ? { t: time(e[0]), type: e[1], who: str(e[2], 50), id: int(e[3]), name: str(e[4]), q: int(e[5], 0, 8), n: int(e[6], 1, 1e6), tab: str(e[7], 50) }
  : null;
const logMoney = (e) => Array.isArray(e) && e.length >= 4 && LOG_TYPES.includes(e[1])
  ? { t: time(e[0]), type: e[1], who: str(e[2], 50), amount: int(e[3]) }
  : null;
const log = data.guildLog && typeof data.guildLog === "object"
  ? {
      items: (data.guildLog.items || []).map(logItem).filter(Boolean),
      money: (data.guildLog.money || []).map(logMoney).filter(Boolean),
    }
  : null;

// Gildentermine aus dem Ingame-Kalender (ab Addon 1.4), Zeiten in Serverzeit
const calTime = (t) => (typeof t === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t) ? t : null);
const calendar = data.calendar && typeof data.calendar === "object" && Array.isArray(data.calendar.events)
  ? {
      updated: time(data.calendar.updated),
      events: data.calendar.events
        .filter((e) => Array.isArray(e) && calTime(e[0]))
        .map((e) => ({ start: calTime(e[0]), end: calTime(e[1]) && calTime(e[1]) >= calTime(e[0]) ? calTime(e[1]) : null, title: str(e[2], 120), kind: e[3] === "GUILD_ANNOUNCEMENT" ? "announcement" : "event", type: Number.isInteger(e[4]) ? e[4] : null }))
        .slice(0, 100),
    }
  : null;

// Gildenliste (ab Addon 1.5): Das Addon liefert, wann wer zuletzt online war.
// Veröffentlicht wird davon nur, wer länger als motdMaxOfflineDays (config.js)
// offline ist – keine Login-Zeiten. Gebraucht fürs "Mitglied des Tages".
async function maxOfflineDays() {
  try {
    const w = {};
    new Function("window", await readFile(join(root, "config.js"), "utf8"))(w);
    const d = Number(w.GUILD_CONFIG?.motdMaxOfflineDays);
    return d > 0 ? d : 10;
  } catch { return 10; }
}
let inactive = null;
if (data.roster && typeof data.roster === "object" && data.roster.seen && typeof data.roster.seen === "object" && !Array.isArray(data.roster.seen)) {
  const days = await maxOfflineDays();
  const at = int(data.roster.updated);
  const names = Object.entries(data.roster.seen)
    .filter(([, t]) => at - int(t) > days * 86400)
    .map(([n]) => str(n, 50))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "de"));
  if (at) inactive = { updated: time(at), days, names };
}

// Stapelgrößen (ab Addon 1.6): wie viele Stück eines Gegenstands auf einen
// Stapel passen – für die Spender-Rangliste "Gegenstände"
const stacks = {};
if (data.stacks && typeof data.stacks === "object" && !Array.isArray(data.stacks)) {
  for (const [id, n] of Object.entries(data.stacks)) {
    if (/^\d{1,7}$/.test(id) && Number(n) >= 1) stacks[id] = int(n, 1, 10000);
  }
}

// ---------- mit vorhandenen Daten zusammenführen ----------
let bank = { updated: null, chars: {}, guild: null };
try {
  const old = await readFile(bankFile, "utf8");
  bank = JSON.parse(old.slice(old.indexOf("{"), old.lastIndexOf("}") + 1));
} catch { /* noch keine Bankdaten */ }
const snapshot = () => JSON.stringify([bank.chars, bank.guild, bank.log, bank.calendar, bank.inactive, bank.stacks]);
const before = snapshot();

const newer = (a, b) => !b || (a && a >= b);
const changes = [];
for (const [name, c] of Object.entries(chars)) {
  const old = bank.chars[name];
  if (old && !newer(c.updated, old.updated)) { changes.push(`${name}: übersprungen (vorhandene Daten sind neuer)`); continue; }
  // Bankfach nicht geöffnet seit letztem Import? Dann alte Bank-Einträge behalten.
  if (old && !c.bankUpdated && old.bankUpdated) {
    c.items = [...c.items.filter((i) => i.where !== "Bank"), ...old.items.filter((i) => i.where === "Bank")];
    c.bankUpdated = old.bankUpdated;
  }
  bank.chars[name] = c;
  changes.push(`${name}: ${c.items.length} Gegenstände, ${(c.money / 10000).toFixed(2)} Gold`);
}
if (guild && newer(guild.updated, bank.guild?.updated)) {
  bank.guild = guild;
  changes.push(`Gildenbank: ${guild.tabs.reduce((s, t) => s + t.items.length, 0)} Gegenstände in ${guild.tabs.length} Fächern`);
}
// Protokoll: Das Addon liefert nur die neuesten Einträge. Ältere, die schon
// auf der Homepage stehen, bleiben erhalten; ab dem ältesten Eintrag des
// Exports gilt dessen Stand (der ist vollständig und schon bereinigt).
// Kurz davor liegende alte Einträge, die auch im Export stehen (Zeit kann
// je nach PC um bis zu ca. 1 Std. abweichen), werden nicht doppelt übernommen.
if (log) {
  const LOG_KEEP = 2000;
  const sig = (e) => [e.type, e.who, e.id, e.n, e.tab, e.amount].join("|");
  const merge = (oldList = [], newList) => {
    if (!newList.length) return oldList;
    const start = Math.min(...newList.map((e) => Date.parse(e.t)));
    const dup = (o) => newList.some((n) => sig(n) === sig(o) && Math.abs(Date.parse(n.t) - Date.parse(o.t)) <= 2 * 3600e3);
    return [...oldList.filter((o) => LOG_TYPES.includes(o.type) && Date.parse(o.t) < start && !dup(o)), ...newList]
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
      .slice(-LOG_KEEP);
  };
  bank.log = { items: merge(bank.log?.items, log.items), money: merge(bank.log?.money, log.money) };
  changes.push(`Protokoll: ${bank.log.items.length} Einträge zu Gegenständen, ${bank.log.money.length} zu Gold`);
}
if (calendar && newer(calendar.updated, bank.calendar?.updated)) {
  bank.calendar = calendar;
  changes.push(`Gildentermine: ${calendar.events.length}`);
}
if (inactive && newer(inactive.updated, bank.inactive?.updated)) {
  bank.inactive = inactive;
  changes.push(`Gildenliste: ${inactive.names.length} Mitglieder länger als ${inactive.days} Tage offline`);
}
const newStacks = Object.keys(stacks).filter((id) => bank.stacks?.[id] !== stacks[id]).length;
if (newStacks) {
  bank.stacks = { ...(bank.stacks || {}), ...stacks };
  changes.push(`Stapelgrößen: ${newStacks} neu`);
}
if (!changes.length && !Object.keys(stacks).length) fail("Der Export enthält weder Bankdaten noch Gildentermine oder Gildenliste.");
if (snapshot() === before) {
  console.log("Nichts Neues – diese Bankdaten sind schon auf der Homepage.");
  process.exit(0);
}
bank.updated = new Date().toISOString();

await writeFile(bankFile, "// Automatisch erzeugt von scripts/import-bank.mjs – nicht von Hand bearbeiten.\nwindow.BANK = " + JSON.stringify(bank, null, 1) + ";\n", "utf8");
console.log("Gildenbank übernommen:\n  " + changes.join("\n  "));

if (push) {
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "inherit" });
  git("add", "data/bank.js");
  git("commit", "-m", "Gildenbank aktualisiert");
  git("pull", "--rebase", "--quiet"); // der tägliche Bot committet ebenfalls
  git("push");
  console.log("Hochgeladen – die Seite ist in etwa einer Minute aktuell.");
}

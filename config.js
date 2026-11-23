// ============================================================
//  Gilden-Einstellungen – hier könnt ihr alle Texte anpassen.
//  Die Mitgliederdaten selbst stehen in data/roster.js
//  und werden mit scripts/update-roster.mjs aktualisiert.
// ============================================================
window.GUILD_CONFIG = {
  name: "Donnerbalkenklan",
  tagline: "Laut, stur und immer zusammen – eine Horde-Gilde für alle, die Azeroth gemeinsam erleben wollen.",
  game: "WoW Forever",
  region: "EU",
  faction: "Horde",
  founded: 2026,
  armoryUrl: "https://worldofwarcraft.blizzard.com/de-de/forever/eu/armory/guild/donnerbalkenklan",
  characterUrlBase: "https://worldofwarcraft.blizzard.com/de-de/forever/eu/armory/character/",

  // Link zu eurem Discord (leer lassen, um den Button auszublenden)
  discordUrl: "https://discord.gg/8vRUnk3XdG",

  // Die Armory liefert nur Rang-Nummern, keine Namen.
  // Tragt hier die Rangnamen ein, wie sie im Spiel heißen.
  rankNames: {
    0: "Gildenleader",
    1: "Offizier",
    2: "Veteran",
    3: "Mitglied",
    4: "Twink",
    5: "Initiand",
  },

  about: [
    "Der Donnerbalkenklan ist eine deutschsprachige Horde-Gilde auf WoW Forever (EU). Bei uns zählt der Spaß am Spiel mehr als jede Bestenliste.",
    "Ob du gerade erst deine ersten Schritte in Durotar machst oder schon Level 60 erreicht hast: Hier findest du Leute zum Questen, für Dungeons und für alles, was danach kommt.",
  ],

  news: [
    { date: "2026-11-22", title: "Neue Gilden-Homepage", text: "Unsere Homepage ist online! Die Mitgliederliste wird direkt aus der Armory übernommen." },
    { date: "2026-11-22", title: "Level 60!", text: "Schnoppers Axtschädel hat die Höchststufe erreicht. Glückwunsch!" },
  ],

  // Feste Termine (leer lassen, um den Abschnitt auszublenden)
  schedule: [
    { day: "Mittwoch", time: "20:00", what: "Gilden-Dungeonabend" },
    { day: "Sonntag", time: "19:00", what: "Gemeinsames Leveln & Twink-Runde" },
  ],

  // Sprüche für das "Mitglied des Tages" (jeden Tag ein anderer)
  motdLines: [
    "Heute geht die erste Runde Grog auf dich!",
    "Möge dein Donnerbalken niemals brechen.",
    "Der Klan grüßt dich – Lok'tar!",
    "Heute hast du Vortritt beim Loot. Fast.",
    "Ehre, Ruhm und ein Freibier in Orgrimmar.",
    "Dein Name wird heute in jeder Taverne gerufen.",
  ],
  // Wer nicht Mitglied des Tages wird: diese Ränge (Nummern wie bei rankNames, 4 = Twink) …
  motdSkipRanks: [4],
  // … und wer laut Gildenliste länger als so viele Tage offline ist.
  // Die Gildenliste liest das Gildenbank-Addon (ab Version 1.5) im Spiel aus.
  motdMaxOfflineDays: 10,

  // Adresse der Mitgliederecke (Bedarf an Gildenbank-Gegenständen anmelden),
  // also des Ordners api/ auf dem eigenen Webspace. Leer lassen = ausgeblendet.
  needsApi: "https://donnerbalken-api.free-kick.de/",

  joinText: "Wir freuen uns über neue Gesichter – egal welche Klasse, egal welches Level. Schreib einfach einen Offizier im Spiel an oder komm auf unseren Discord.",
};

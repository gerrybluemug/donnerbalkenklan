// Auswahl "Mitglied des Tages".
// Wird von der Startseite (app.js) und vom Bot (scripts/motd.mjs) gleichermaßen benutzt,
// damit beide immer zum selben Ergebnis kommen.
//
// Jedes Mitglied bekommt pro Tag eine feste Losnummer, die kleinste gewinnt.
// Nicht dran kommen:
//   - Ränge aus motdSkipRanks (config.js, z. B. Twinks)
//   - wer laut Gildenliste länger als motdMaxOfflineDays offline ist
//     (kommt aus dem Gildenbank-Addon, steht in data/bank.js unter "inactive")
//   - wer erst heute beigetreten ist
window.pickMemberOfDay = function (members, opts) {
  const { today, history, inactive, skipRanks = [] } = opts;
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  // Die Gildenliste aus dem Spiel kennt nur Vornamen – doppelte Vornamen lieber nicht ausschließen
  const nameCount = {};
  for (const m of members) nameCount[m.name] = (nameCount[m.name] || 0) + 1;
  const away = new Set(inactive && Array.isArray(inactive.names) ? inactive.names : []);
  const isAway = (m) => nameCount[m.name] === 1 && away.has(m.name);
  const skipped = (m) => skipRanks.includes(m.rank);
  const joinedToday = (m) => !!(history && history.chars && history.chars[m.slug] && history.chars[m.slug].j === today);

  // Falls die Regeln niemanden übrig lassen, schrittweise lockern
  const list = [
    members.filter((m) => !skipped(m) && !isAway(m) && !joinedToday(m)),
    members.filter((m) => !skipped(m)),
    members,
  ].find((l) => l.length);
  if (!list) return null;
  const lot = (m) => hash(today + "|motd|" + m.slug);
  return list.reduce((best, m) => (lot(m) < lot(best) ? m : best));
};

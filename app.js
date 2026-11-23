(function () {
  const C = window.GUILD_CONFIG;
  const R = window.ROSTER || { members: [], maxLevel: 60 };
  const M = R.members;

  const CLASSES = {
    WARRIOR: { name: "Krieger", color: "#C69B6D" },
    PALADIN: { name: "Paladin", color: "#F48CBA" },
    HUNTER: { name: "Jäger", color: "#AAD372" },
    ROGUE: { name: "Schurke", color: "#FFF468" },
    PRIEST: { name: "Priester", color: "#FFFFFF" },
    SHAMAN: { name: "Schamane", color: "#0070DD" },
    MAGE: { name: "Magier", color: "#3FC7EB" },
    WARLOCK: { name: "Hexenmeister", color: "#8788EE" },
    DRUID: { name: "Druide", color: "#FF7C0A" },
  };
  const cls = (e) => CLASSES[e] || { name: e, color: "#bbb" };
  const raceName = (m) => m.raceName || m.race;
  const rankName = (r) => (C.rankNames && C.rankNames[r]) || `Rang ${r}`;
  const fullName = (m) => `${m.name} ${m.surname}`;
  const charUrl = (m) => C.characterUrlBase + encodeURIComponent(m.slug).replace(/%2D/gi, "-");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s) => document.querySelector(s);

  const maxLvl = R.maxLevel || 60;
  const fill = (sel, opts) => { const el = $(sel); opts.forEach(([v, l]) => el.insertAdjacentHTML("beforeend", `<option value="${esc(v)}">${esc(l)}</option>`)); };

  // alte Links (…/#mitglieder, …/#gildenbank) auf die eigenen Seiten umleiten
  const moved = { "#mitglieder": "mitglieder.html", "#gildenbank": "gildenbank.html" }[location.hash];
  if (document.body.dataset.page === "start" && moved) { location.replace(moved); return; }

  // ---------- Kopf & Fuß (alle Seiten) ----------
  document.querySelectorAll("[data-bind]").forEach((el) => (el.textContent = C[el.dataset.bind] ?? ""));
  const pageTitle = document.body.dataset.title;
  document.title = pageTitle ? `${pageTitle} – ${C.name}` : C.name;
  document.querySelectorAll(".nav nav a").forEach((a) => {
    if (a.dataset.page === document.body.dataset.page) a.setAttribute("aria-current", "page");
  });
  const B = window.BANK;
  const hasBank = !!(B && (Object.keys(B.chars || {}).length || B.guild));
  $("#nav-bank").hidden = !hasBank;

  const updated = R.updated ? new Date(R.updated).toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" }) : "unbekannt";
  $("#stand").innerHTML = `Mitgliederdaten aus der <a href="${esc(C.armoryUrl)}" target="_blank" rel="noopener">WoW-Armory</a> · Stand: ${esc(updated)}`;

  // ---------- Gemeinsame Helfer ----------
  const H = window.HISTORY && window.HISTORY.chars ? window.HISTORY : null;
  const bySlug = new Map(M.map((m) => [m.slug, m]));
  const berlin = (d = new Date()) => d.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T"); // "JJJJ-MM-TTTHH:MM:SS"
  const today = berlin().slice(0, 10);
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const fmtDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtDayShort = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "UTC" });
  const memberLink = (m) => `<a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${cls(m.cls).color}">${esc(fullName(m))}</a>`;
  // Charakter aus dem Verlauf – verlinkt, solange er in der Gilde ist
  const histName = (slug, c) => (bySlug.has(slug) ? memberLink(bySlug.get(slug)) : `<b style="color:${cls(c.c).color}">${esc(c.n)}</b>`);
  // einfacher, über den Tag gleichbleibender Zufall
  const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const dayHash = (salt) => hashStr(today + salt);
  const pick = (list, salt) => list[dayHash(salt) % list.length];

  // Aufsteiger: Stufen seit dem Stichtag vor 7 Tagen (bzw. seit Aufzeichnungsbeginn)
  function risers() {
    if (!H) return { list: [], since: null };
    const cutoff = addDays(today, -7);
    const list = [];
    for (const m of M) {
      const c = H.chars[m.slug];
      if (!c || !c.lv.length) continue;
      let base = c.lv[0][1];
      for (const [d, l] of c.lv) { if (d <= cutoff) base = l; else break; }
      if (m.level > base) list.push({ m, gain: m.level - base, from: base });
    }
    list.sort((a, b) => b.gain - a.gain || b.m.level - a.m.level || fullName(a.m).localeCompare(fullName(b.m), "de"));
    return { list, since: H.start > cutoff ? H.start : null };
  }
  const riserRow = (r) => `<li><span class="who">${memberLink(r.m)}<small>Stufe ${r.from} → ${r.m.level}</small></span><b class="gain">+${r.gain}</b></li>`;

  // ---------- Gildenbank-Daten (für mehrere Seiten) ----------
  const QUALITY = [
    ["Schlecht", "#9d9d9d"], ["Verbreitet", "#ffffff"], ["Selten", "#1eff00"], ["Rar", "#0070dd"],
    ["Episch", "#a335ee"], ["Legendär", "#ff8000"], ["Artefakt", "#e6cc80"], ["Erbstück", "#00ccff"], ["WoW-Token", "#00ccff"],
  ];
  const qColor = (q) => (QUALITY[q] || QUALITY[1])[1];
  // Bank-Charakter "Bankallg" → "Bankallg Vontrudi", wenn der Vorname in der Gilde eindeutig ist
  // Heißt der Charakter selbst "Gildenbank", wird er von der echten Gildenbank unterschieden
  const displayName = (key) => {
    const hits = M.filter((m) => m.name.toLowerCase() === key.toLowerCase());
    const name = hits.length === 1 ? fullName(hits[0]) : key;
    return name.toLowerCase() === "gildenbank" ? `${name} (Charakter)` : name;
  };
  const sources = !hasBank ? [] : [
    ...Object.entries(B.chars || {}).map(([key, c]) => ({
      id: "c:" + key, label: displayName(key), money: c.money || 0, updated: c.bankUpdated || c.updated,
      items: c.items.map((i) => ({ ...i, loc: `${displayName(key)} (${i.where})` })),
    })),
    ...(B.guild ? [{
      id: "guild", label: "Gildenbank", money: B.guild.money || 0, updated: B.guild.updated,
      items: B.guild.tabs.flatMap((t) => t.items.map((i) => ({ ...i, loc: `Gildenbank – ${t.name}` }))),
    }] : []),
  ];
  // Lagerdauer, z. B. "seit 12 Tagen" bzw. "seit ≥ 12 Tagen", wenn der
  // Gegenstand schon beim ersten Auslesen durch das Addon da war
  function ageText(i) {
    const ms = Date.now() - Date.parse(i.since);
    const h = Math.max(0, Math.floor(ms / 3600000)), d = Math.floor(h / 24);
    let txt;
    if (h < 1) txt = "seit < 1 Std.";
    else if (d < 1) txt = `seit ${h} Std.`;
    else if (d < 60) txt = `seit ${d} ${d === 1 ? "Tag" : "Tagen"}`;
    else txt = `seit ${Math.floor(d / 30)} Monaten`;
    if (i.atLeast) txt = txt.replace("seit ", "seit ≥ ").replace("≥ <", "<");
    return { txt, days: d };
  }
  // Ladenhüter: was am längsten unberührt liegt (bei Gleichstand das Unscheinbarste)
  function shelfWarmer() {
    const all = sources.flatMap((s) => s.items).filter((i) => i.since);
    all.sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.q - b.q || b.n - a.n || a.name.localeCompare(b.name, "de"));
    return all[0] || null;
  }
  function renderShelf() {
    const i = shelfWarmer();
    if (!i || !$("#shelf")) return;
    const quip = pick(["Will das wirklich niemand?", "Fast schon ein Familienerbstück.", "Hat inzwischen einen eigenen Namen.", "Der Staub darauf ist episch.", "Wird langsam Teil der Einrichtung."], "shelf" + today.slice(0, 7));
    $("#shelf").innerHTML = `<p class="shelf-item"><b style="color:${qColor(i.q)}">${esc(i.name)}</b>${i.n > 1 ? ` ×${i.n.toLocaleString("de-DE")}` : ""}</p>
      <p class="shelf-meta">liegt ${esc(ageText(i).txt)} unberührt · ${esc(i.loc)}</p><p class="quip">${esc(quip)}</p>`;
    $("#shelf-card").hidden = false;
  }
  // Spender-Rangliste aus dem Protokoll (nur Einzahlungen/Einlagerungen)
  function donorRanking() {
    const LOG = (hasBank && B.log) || { items: [], money: [] };
    const donors = new Map();
    [...LOG.items.map((e) => ({ ...e, kind: "item" })), ...LOG.money.map((e) => ({ ...e, kind: "money" }))]
      .filter((e) => e.type === "deposit" && e.who).forEach((e) => {
        const key = e.who.split("-")[0].toLowerCase();
        const d = donors.get(key) || { name: e.who, gold: 0, items: 0, times: 0 };
        if (e.kind === "money") d.gold += e.amount; else d.items += e.n;
        d.times++;
        donors.set(key, d);
      });
    return [...donors.values()].sort((a, b) => b.gold - a.gold || b.items - a.items || b.times - a.times).slice(0, 10);
  }
  const goldText = (c) => {
    const g = Math.floor(c / 10000), sv = Math.floor((c % 10000) / 100), k = c % 100;
    return `<span class="gold">${g.toLocaleString("de-DE")}g</span> <span class="silver">${sv}s</span> <span class="copper">${k}c</span>`;
  };

  // ---------- Startseite ----------
  if ($("#hero-meta")) {
    $("#hero-meta").textContent = [C.game, C.region, C.faction, `Gegründet ${C.founded}`].join(" · ");
    $("#armory-link").href = C.armoryUrl;
    $("#about").innerHTML = (C.about || []).map((p) => `<p>${esc(p)}</p>`).join("");

    if (C.schedule && C.schedule.length) {
      $("#schedule").innerHTML = C.schedule.map((s) => `<li><b>${esc(s.day)}</b><span class="t">${esc(s.time)}</span><span>${esc(s.what)}</span></li>`).join("");
    } else $("#schedule-box").remove();

    const fmtDate = (d) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    $("#news").innerHTML = (C.news || []).map((n) => `<li><time datetime="${esc(n.date)}">${esc(fmtDate(n.date))}</time><h4>${esc(n.title)}</h4><p>${esc(n.text)}</p></li>`).join("");

    if (C.discordUrl) $("#discord-link").href = C.discordUrl;
    else $("#discord-link").remove();
  }

  // ---------- "Heute im Klan" (Startseite) ----------
  if ($("#heute")) {
    // Mitglied des Tages: wechselt um 00:00 Uhr (deutsche Zeit), für alle Besucher derselbe.
    // Der Bot legt es kurz nach Mitternacht in data/motd.js fest (keine Twinks, niemand, der
    // länger offline ist). Bis dahin rechnet die Seite mit denselben Regeln selbst (motd-pick.js).
    const fixed = window.MOTD && window.MOTD.date === today && bySlug.get(window.MOTD.slug);
    const m = fixed || (window.pickMemberOfDay && M.length ? window.pickMemberOfDay(M, {
      today, history: H, inactive: B && B.inactive, skipRanks: C.motdSkipRanks || [],
    }) : null);
    if (m) {
      // Seite steht über Mitternacht offen? Dann um 00:00 Uhr neu laden.
      const [hh, mm, ss] = berlin().slice(11, 19).split(":").map(Number);
      setTimeout(() => location.reload(), (86400 - (hh * 3600 + mm * 60 + ss)) * 1000 + 5000);
      const k = cls(m.cls);
      const h = H && H.chars[m.slug];
      const since = !h ? "" : h.j ? `Im Klan seit ${fmtDay(h.j)}` : `Schon vor dem ${fmtDay(H.start)} im Klan`;
      const r = risers().list.find((x) => x.m === m);
      const lines = C.motdLines && C.motdLines.length ? C.motdLines : ["Der Klan grüßt dich!"];
      $("#motd").innerHTML = `<p class="motd-name"><a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${k.color}">${esc(fullName(m))}</a></p>
        <p class="motd-meta">Stufe ${m.level} · ${esc(raceName(m))} · ${esc(k.name)} · ${esc(rankName(m.rank))}</p>
        <ul class="motd-facts">${[since, r ? `+${r.gain} ${r.gain === 1 ? "Stufe" : "Stufen"} diese Woche` : "", m.ilvl ? `Itemlevel ${m.ilvl}` : ""].filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p class="quip">${esc(pick(lines, "motd-line"))}</p>`;
    } else $("#motd-card").remove();

    const { list: rs } = risers();
    $("#risers-mini").innerHTML = rs.length
      ? rs.slice(0, 5).map(riserRow).join("")
      : `<li class="empty">${H ? "Diese Woche ist noch niemand aufgestiegen – ran an die Quests!" : "Noch keine Daten."}</li>`;

    if (hasBank) renderShelf();

    // Gildentermine aus dem Ingame-Kalender (Serverzeit)
    const CAL = hasBank && B.calendar;
    if (CAL && $("#events-box")) {
      const from = berlin(new Date(Date.now() - 3 * 3600e3)).slice(0, 16);
      const upcoming = CAL.events.filter((e) => (e.end || e.start) >= from).slice(0, 6);
      const TYPES = ["Schlachtzug", "Dungeon", "PvP", "Treffen", "Sonstiges"];
      const when = (t) => {
        const [y, mo, d, hh, mi] = t.split(/[-T:]/).map(Number);
        const dt = new Date(Date.UTC(y, mo - 1, d, hh, mi));
        return { day: dt.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }), time: t.slice(11, 16) };
      };
      if (upcoming.length) {
        $("#events").innerHTML = upcoming.map((e) => {
          const w = when(e.start);
          const tag = e.kind === "announcement" ? "Ankündigung" : TYPES[e.type] || "";
          return `<li><b>${esc(w.day)}</b><span class="t">${esc(w.time)}</span><span>${esc(e.title)}${tag ? ` <small class="tag">${esc(tag)}</small>` : ""}</span></li>`;
        }).join("");
        const st = CAL.updated ? new Date(CAL.updated).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";
        $("#events-note").textContent = `Aus dem Ingame-Kalender (Serverzeit)${st ? ` · Stand ${st}` : ""}`;
        $("#events-box").hidden = false;
      }
    }

    // Discord: wie viele gerade online sind (öffentliche Einladungs-Info von Discord)
    const invite = (C.discordUrl || "").match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/);
    if (invite) {
      const show = (d) => {
        const el = $("#discord-online");
        el.href = C.discordUrl;
        el.title = `${d.members.toLocaleString("de-DE")} Mitglieder auf dem Discord-Server`;
        el.innerHTML = `<span class="pulse" aria-hidden="true"></span><b>${d.online.toLocaleString("de-DE")}</b> gerade online im Discord`;
        el.hidden = false;
      };
      let cached = null;
      try { cached = JSON.parse(sessionStorage.getItem("discordOnline") || "null"); } catch { /* egal */ }
      if (cached && Date.now() - cached.t < 5 * 60e3) show(cached);
      else fetch(`https://discord.com/api/v10/invites/${invite[1]}?with_counts=true`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || typeof j.approximate_presence_count !== "number") return;
          const d = { t: Date.now(), online: j.approximate_presence_count, members: j.approximate_member_count };
          try { sessionStorage.setItem("discordOnline", JSON.stringify(d)); } catch { /* egal */ }
          show(d);
        })
        .catch(() => {});
    }
  }

  // ---------- Kennzahlen & Statistik (Startseite) ----------
  if ($("#kpis")) {
    const avg = M.length ? M.reduce((s, m) => s + m.level, 0) / M.length : 0;
    const atMax = M.filter((m) => m.level >= maxLvl).length;
    const over40 = M.filter((m) => m.level >= 40).length;
    $("#kpis").innerHTML = [
      [M.length, "Mitglieder"],
      [atMax, `auf Stufe ${maxLvl}`],
      [over40, "ab Stufe 40"],
      [avg.toFixed(1).replace(".", ","), "Ø Stufe"],
    ].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");

    // ---------- Statistik ----------
    function countBy(fn) {
      const map = new Map();
      M.forEach((m) => { const k = fn(m); map.set(k, (map.get(k) || 0) + 1); });
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }
    function bars(el, rows, colorFn) {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      el.innerHTML = rows.map(([label, n, key]) =>
        `<div class="bar"><span class="label" title="${esc(label)}">${esc(label)}</span><span class="track"><span class="fill" style="width:${(n / max) * 100}%;background:${colorFn(key ?? label)}"></span></span><span class="n">${n}</span></div>`
      ).join("");
    }
    bars($("#class-bars"), countBy((m) => m.cls).map(([k, n]) => [cls(k).name, n, k]), (k) => cls(k).color);
    bars($("#race-bars"), countBy(raceName), () => "linear-gradient(90deg,#8a1d16,#d8432f)");

    const buckets = [];
    for (let s = 1; s < maxLvl; s += 10) buckets.push([s, Math.min(s + 9, maxLvl - 1)]);
    buckets.push([maxLvl, maxLvl]);
    const hist = buckets.map(([a, b]) => ({ label: a === b ? `${a}` : `${a}–${b}`, n: M.filter((m) => m.level >= a && m.level <= b).length }));
    const hmax = Math.max(1, ...hist.map((h) => h.n));
    $("#level-histo").innerHTML = hist.map((h) => `<div class="col"><span class="v">${h.n}</span><span class="b" style="height:${(h.n / hmax) * 75}%"></span><span class="l">${h.label}</span></div>`).join("");

    const top = [...M].sort((a, b) => b.level - a.level || (b.ilvl || 0) - (a.ilvl || 0)).slice(0, 10);
    $("#toplist").innerHTML = top.map((m) =>
      `<li><span class="who"><a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${cls(m.cls).color}">${esc(fullName(m))}</a><small>Stufe ${m.level} · ${esc(cls(m.cls).name)}${m.ilvl ? ` · iLvl ${m.ilvl}` : ""}</small></span></li>`
    ).join("");

  }

  // ---------- Mitgliederliste (Seite "Mitglieder") ----------
  if ($("#roster")) {
    // Abzeichen: Top-Spender der Gildenbank, neu im Klan (letzte 7 Tage)
    const donorRank = new Map();
    donorRanking().forEach((d, i) => {
      const hits = M.filter((m) => m.name.toLowerCase() === d.name.split("-")[0].toLowerCase());
      if (hits.length === 1) donorRank.set(hits[0].slug, i + 1);
    });
    const newSince = addDays(today, -7);
    const badges = (m) => {
      let b = "";
      const r = donorRank.get(m.slug);
      if (r) b += `<span class="badge donor" title="Top-Spender der Gildenbank (Platz ${r})">💰</span>`;
      const h = H && H.chars[m.slug];
      if (h && h.j && h.j >= newSince) b += `<span class="badge new" title="Seit ${esc(fmtDay(h.j))} im Klan">neu</span>`;
      return b;
    };
    fill("#f-class", Object.keys(CLASSES).filter((k) => M.some((m) => m.cls === k)).map((k) => [k, CLASSES[k].name]).sort((a, b) => a[1].localeCompare(b[1], "de")));
    fill("#f-race", [...new Set(M.map(raceName))].sort((a, b) => a.localeCompare(b, "de")).map((r) => [r, r]));
    fill("#f-rank", [...new Set(M.map((m) => m.rank))].sort((a, b) => a - b).map((r) => [r, rankName(r)]));
    $("#f-minlvl").max = maxLvl;

    const state = { sort: "rank", dir: 1 };
    const sorters = {
      name: (m) => fullName(m).toLocaleLowerCase("de"),
      level: (m) => m.level,
      ilvl: (m) => m.ilvl ?? -1,
      cls: (m) => cls(m.cls).name,
      race: raceName,
      rank: (m) => m.rank,
    };

    function render() {
      const q = $("#f-search").value.trim().toLocaleLowerCase("de");
      const fc = $("#f-class").value, fr = $("#f-race").value, fk = $("#f-rank").value;
      const minL = +$("#f-minlvl").value || 1;
      const key = sorters[state.sort];
      const rows = M.filter((m) =>
        (!q || fullName(m).toLocaleLowerCase("de").includes(q)) &&
        (!fc || m.cls === fc) && (!fr || raceName(m) === fr) && (fk === "" || String(m.rank) === fk) && m.level >= minL
      ).sort((a, b) => {
        const x = key(a), y = key(b);
        const c = typeof x === "string" ? x.localeCompare(y, "de") : x - y;
        return c * state.dir || b.level - a.level || fullName(a).localeCompare(fullName(b), "de");
      });

      $("#roster tbody").innerHTML = rows.map((m) => {
        const k = cls(m.cls);
        return `<tr>
          <td><a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${k.color}">${esc(fullName(m))}</a>${badges(m)}</td>
          <td class="num ${m.level >= maxLvl ? "lvl-max" : ""}">${m.level}</td>
          <td class="num">${m.ilvl ?? "–"}</td>
          <td><span class="dot" style="background:${k.color}"></span>${esc(k.name)}</td>
          <td>${esc(raceName(m))}</td>
          <td class="rank-${m.rank}">${esc(rankName(m.rank))}</td>
        </tr>`;
      }).join("");
      $("#count").textContent = rows.length === M.length ? `${M.length} Mitglieder` : `${rows.length} von ${M.length} Mitgliedern`;

      document.querySelectorAll("th[data-sort]").forEach((th) => {
        th.classList.toggle("asc", th.dataset.sort === state.sort && state.dir === 1);
        th.classList.toggle("desc", th.dataset.sort === state.sort && state.dir === -1);
      });
    }

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const s = th.dataset.sort;
      if (state.sort === s) state.dir *= -1;
      else { state.sort = s; state.dir = ["level", "ilvl"].includes(s) ? -1 : 1; }
      render();
    }));
    const FILTERS = ["#f-search", "#f-class", "#f-race", "#f-rank", "#f-minlvl"];
    // Suche & Filter einklappbar; zeigt im eingeklappten Zustand, wie viele Filter aktiv sind
    const box = $("#filter-box");
    const activeFilters = () => FILTERS.filter((s) => (s === "#f-minlvl" ? +$(s).value > 1 : $(s).value.trim() !== "")).length;
    const updateActive = () => {
      const n = activeFilters();
      $("#filter-active").textContent = n ? `${n} aktiv` : "";
      $("#f-reset").hidden = !n;
    };
    let stored = null;
    try { stored = localStorage.getItem("mitgliederFilterOffen"); } catch { /* egal */ }
    box.open = stored !== null ? stored === "1" : window.matchMedia("(min-width: 700px)").matches;
    // nur echtes Auf-/Zuklappen merken, nicht das Setzen beim Laden
    box.querySelector("summary").addEventListener("click", () => {
      try { localStorage.setItem("mitgliederFilterOffen", box.open ? "0" : "1"); } catch { /* egal */ }
    });
    $("#f-reset").addEventListener("click", () => {
      FILTERS.forEach((s) => ($(s).value = s === "#f-minlvl" ? "1" : ""));
      render(); updateActive();
    });
    FILTERS.forEach((s) => $(s).addEventListener("input", () => { render(); updateActive(); }));
    render();
    updateActive();
  }

  // ---------- Chronik ----------
  if ($("#chronik")) {
    if (!H) {
      $("#chronik").innerHTML = `<p class="bank-empty">Der Verlauf wird ab dem nächsten Abruf der Mitgliederliste aufgezeichnet.</p>`;
    } else {
      $("#chronik-since").textContent = `Aufgezeichnet seit ${fmtDay(H.start)}`;
      const chars = Object.entries(H.chars);

      // Aufsteiger der Woche
      const { list: rs, since } = risers();
      $("#risers-period").textContent = since ? `Seit Beginn der Aufzeichnung am ${fmtDay(since)}` : "Die letzten 7 Tage";
      $("#risers").innerHTML = rs.length
        ? rs.slice(0, 10).map(riserRow).join("")
        : `<li class="empty">Diese Woche ist noch niemand aufgestiegen – ran an die Quests!</li>`;

      // Kommen & Gehen
      const from = addDays(today, -30);
      const lastLvl = (c) => c.lv.length ? c.lv[c.lv.length - 1][1] : "?";
      const joined = chars.filter(([, c]) => c.j && c.j >= from && !c.l).sort((a, b) => b[1].j.localeCompare(a[1].j));
      const left = chars.filter(([, c]) => c.l && c.l >= from).sort((a, b) => b[1].l.localeCompare(a[1].l));
      $("#joined").innerHTML = joined.length
        ? joined.slice(0, 15).map(([slug, c]) => `<li>${histName(slug, c)}<small>${esc(fmtDayShort(c.j))} · ${esc(cls(c.c).name)}, Stufe ${lastLvl(c)}</small></li>`).join("")
          + (joined.length > 15 ? `<li class="empty">… und ${joined.length - 15} weitere</li>` : "")
        : `<li class="empty">Noch niemand – der Klan wartet auf dich!</li>`;
      $("#left").innerHTML = left.length
        ? left.slice(0, 15).map(([slug, c]) => `<li>${histName(slug, c)}<small>${esc(fmtDayShort(c.l))} · ${esc(cls(c.c).name)}, zuletzt Stufe ${lastLvl(c)}</small></li>`).join("")
          + (left.length > 15 ? `<li class="empty">… und ${left.length - 15} weitere</li>` : "")
        : `<li class="empty">Niemand – so soll es sein.</li>`;

      // Ruhmeshalle: wer zuerst die Höchststufe erreicht hat. Wer schon vor
      // Aufzeichnungsbeginn dort war, steht vorn (genaues Datum unbekannt).
      $("#hall-sub").textContent = `Höchststufe ${maxLvl}`;
      const reached = chars.filter(([, c]) => "m" in c)
        .sort((a, b) => (a[1].m ?? "") .localeCompare(b[1].m ?? "") || a[1].n.localeCompare(b[1].n, "de"));
      const when = (c) => (c.m ? fmtDay(c.m) : `vor dem ${fmtDay(H.start)}`);
      const ex = (slug) => (bySlug.has(slug) ? "" : " · ehemalig");
      $("#hall-first").innerHTML = reached.length
        ? reached.slice(0, 20).map(([slug, c]) => `<li><span class="who">${histName(slug, c)}<small>${esc(cls(c.c).name)} · ${esc(when(c))}${ex(slug)}</small></span></li>`).join("")
        : `<li class="empty">Noch niemand – wer wird der Erste?</li>`;
      $("#hall-classes").innerHTML = Object.keys(CLASSES).map((k) => {
        const first = reached.filter(([, c]) => c.c === k);
        // mehrere ohne Datum: Reihenfolge unbekannt, also alle nennen
        const top = first.length && first[0][1].m === null ? first.filter(([, c]) => c.m === null) : first.slice(0, 1);
        const names = top.slice(0, 3).map(([slug, c]) => histName(slug, c)).join(", ") + (top.length > 3 ? ` +${top.length - 3}` : "");
        return `<li><span class="dot" style="background:${CLASSES[k].color}"></span><span class="cl">${esc(CLASSES[k].name)}</span>${
          top.length ? `<span class="who">${names}<small>${esc(when(top[0][1]))}</small></span>` : `<span class="free">noch frei</span>`}</li>`;
      }).join("");

      // Gildenwachstum
      const days = H.days.map(([d, n, avg, atMax]) => ({ d, n, avg, atMax }));
      $("#growth-sub").textContent = days.length > 1
        ? `${fmtDay(days[0].d)} bis ${fmtDay(days[days.length - 1].d)}`
        : "Das Diagramm füllt sich ab jetzt Tag für Tag.";
      lineChart($("#chart-members"), "Mitglieder", days.map((x) => ({ d: x.d, v: x.n })), (v) => v.toLocaleString("de-DE"));
      lineChart($("#chart-level"), "Ø Stufe", days.map((x) => ({ d: x.d, v: x.avg })), (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
      $("#growth-table tbody").innerHTML = [...days].reverse().map((x) =>
        `<tr><td>${esc(fmtDay(x.d))}</td><td class="num">${x.n}</td><td class="num">${x.avg.toLocaleString("de-DE", { minimumFractionDigits: 1 })}</td><td class="num">${x.atMax}</td></tr>`).join("");
    }
  }

  // Liniendiagramm (eine Reihe) mit Fadenkreuz und Tooltip
  function lineChart(fig, title, pts, fmtV) {
    const W = 520, Hh = 220, pl = 44, pr = 20, pt = 16, pb = 30;
    const vs = pts.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => pts.length === 1 ? (pl + W - pr) / 2 : pl + (i / (pts.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (Hh - pt - pb);
    const grid = [];
    for (let v = lo; v <= hi + step / 2; v += step) grid.push(v);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const last = pts[pts.length - 1];
    const xl = pts.length > 1 ? [0, pts.length - 1] : [0];
    fig.innerHTML = `<figcaption>${esc(title)}</figcaption>
      <svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(title)}: ${esc(pts.map((p) => fmtDayShort(p.d) + " " + fmtV(p.v)).join(", "))}">
        ${grid.map((v) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtV(Math.round(v * 10) / 10))}</text>`).join("")}
        ${xl.map((i) => `<text class="ax" x="${x(i)}" y="${Hh - 8}" text-anchor="${pts.length === 1 ? "middle" : i ? "end" : "start"}">${esc(fmtDayShort(pts[i].d))}</text>`).join("")}
        <path class="ln" d="${path}"/>
        <line class="xh" y1="${pt}" y2="${Hh - pb}" hidden/>
        <circle class="pt" r="4.5" cx="${x(pts.length - 1)}" cy="${y(last.v)}"/>
        <rect class="hit" x="${pl}" y="0" width="${W - pl - pr}" height="${Hh}" fill="transparent"/>
      </svg>
      <div class="tip" hidden><b></b><span></span></div>`;
    const svg = fig.querySelector("svg"), xh = fig.querySelector(".xh"), dot = fig.querySelector(".pt"), tip = fig.querySelector(".tip");
    fig.tabIndex = 0;
    let cur = pts.length - 1;
    const show = (i) => {
      cur = i;
      const p = pts[i];
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.removeAttribute("hidden");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.v));
      tip.querySelector("b").textContent = fmtV(p.v);
      tip.querySelector("span").textContent = fmtDay(p.d);
      tip.hidden = false;
      const r = svg.getBoundingClientRect(), fx = (x(i) / W) * r.width;
      tip.style.left = Math.min(Math.max(fx, 60), r.width - 60) + "px";
    };
    const hide = () => { xh.setAttribute("hidden", ""); tip.hidden = true; dot.setAttribute("cx", x(pts.length - 1)); dot.setAttribute("cy", y(last.v)); };
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * W;
      let best = 0;
      pts.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
      show(best);
    });
    svg.addEventListener("pointerleave", hide);
    fig.addEventListener("focus", () => show(cur));
    fig.addEventListener("blur", hide);
    fig.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && cur > 0) show(cur - 1);
      if (e.key === "ArrowRight" && cur < pts.length - 1) show(cur + 1);
    });
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) || 10 * p;
  }

  // ---------- Gildenbank (Seite "Gildenbank") ----------
  if ($("#gildenbank") && !hasBank) $("#bank-none").hidden = false;
  if ($("#gildenbank") && hasBank) {
    $("#gildenbank").hidden = false;
    const gold = goldText;
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");
    renderShelf();

    const totalMoney = sources.reduce((s, x) => s + x.money, 0);
    $("#bank-summary").innerHTML =
      `<div class="kpi money"><b>${gold(totalMoney)}</b><span>Gold gesamt</span></div>` +
      sources.map((s) => `<div class="kpi"><b>${s.items.length}</b><span>${esc(s.label)} · Stand ${esc(fmt(s.updated))}</span></div>`).join("");

    let current = "all";
    const tabs = [{ id: "all", label: "Alles" }, ...sources];
    $("#bank-sources").innerHTML = tabs.map((t) => `<button role="tab" data-id="${esc(t.id)}">${esc(t.label)}</button>`).join("");
    $("#bank-sources").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { current = b.dataset.id; renderBank(); }
    });

    const usedQ = [...new Set(sources.flatMap((s) => s.items.map((i) => i.q)))].sort((a, b) => b - a);
    fill("#b-quality", usedQ.map((q) => [q, (QUALITY[q] || QUALITY[1])[0]]));

    function renderBank() {
      document.querySelectorAll("#bank-sources button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === current)));
      const q = $("#b-search").value.trim().toLocaleLowerCase("de");
      const fq = $("#b-quality").value;
      // gleiche Gegenstände zusammenfassen
      const map = new Map();
      sources.filter((s) => current === "all" || s.id === current).forEach((s) => s.items.forEach((i) => {
        const key = i.id + "|" + i.name;
        const e = map.get(key) || { id: i.id, name: i.name, q: i.q, n: 0, locs: new Set(), since: null, atLeast: false };
        e.n += i.n; e.locs.add(i.loc);
        // bei mehreren Lagerorten zählt der älteste
        if (i.since && (!e.since || i.since < e.since)) { e.since = i.since; e.atLeast = !!i.atLeast; }
        map.set(key, e);
      }));
      const fs = $("#b-sort").value;
      const t = (i, none) => (i.since ? Date.parse(i.since) : none);
      const order = {
        quality: (a, b) => b.q - a.q || a.name.localeCompare(b.name, "de"),
        name: (a, b) => a.name.localeCompare(b.name, "de"),
        oldest: (a, b) => t(a, Infinity) - t(b, Infinity) || a.name.localeCompare(b.name, "de"),
        newest: (a, b) => t(b, -Infinity) - t(a, -Infinity) || a.name.localeCompare(b.name, "de"),
        count: (a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"),
      }[fs];
      const items = [...map.values()]
        .filter((i) => (!q || i.name.toLocaleLowerCase("de").includes(q)) && (fq === "" || String(i.q) === fq))
        .sort(order);
      $("#bank-items").innerHTML = items.length
        ? items.map((i) => `<div class="bank-item"><span class="nm"><b style="color:${qColor(i.q)}">${esc(i.name)}</b><small>${esc([...i.locs].join(", "))}</small></span><span class="side"><span class="qty">×${i.n.toLocaleString("de-DE")}</span>${age(i)}${needBtn(i)}</span></div>`).join("")
        : `<p class="bank-empty">Keine passenden Gegenstände.</p>`;
      $("#b-count").textContent = `${items.length} verschiedene Gegenstände`;
    }
    const OLD_DAYS = 30;
    function age(i) {
      if (!i.since) return "";
      const { txt, days: d } = ageText(i);
      const when = new Date(i.since).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
      const title = i.atLeast ? `Lag schon beim ersten Auslesen (${when}) hier – vermutlich länger` : `Eingelagert am ${when}`;
      return `<small class="age${d >= OLD_DAYS ? " old" : ""}" title="${esc(title)}">${esc(txt)}</small>`;
    }

    ["#b-search", "#b-quality", "#b-sort"].forEach((s) => $(s).addEventListener("input", renderBank));
    renderBank();

    // ---------- Gildenbank-Protokoll ----------
    const LOG = B.log || { items: [], money: [] };
    // nur Einzahlungen/Einlagerungen – Entnahmen werden nicht veröffentlicht
    const IN = new Set(["deposit", "depositSummary"]);
    const entries = [
      ...LOG.items.map((e) => ({ ...e, kind: "item" })),
      ...LOG.money.map((e) => ({ ...e, kind: "money" })),
    ].filter((e) => IN.has(e.type)).sort((a, b) => Date.parse(b.t) - Date.parse(a.t));

    if (entries.length) {
      $("#bank-log-wrap").hidden = false;

      // Namen aus dem Protokoll (ggf. "Name-Realm") mit der Mitgliederliste verknüpfen
      const who = (name) => {
        if (!name) return "<b>Gildenbonus</b>";
        const short = name.split("-")[0];
        const hits = M.filter((m) => m.name.toLowerCase() === short.toLowerCase());
        if (hits.length !== 1) return `<b>${esc(short)}</b>`;
        const m = hits[0];
        return `<a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${cls(m.cls).color}">${esc(m.name)}</a>`;
      };
      const item = (e) => `<b style="color:${qColor(e.q)}">${esc(e.name)}</b>${e.n > 1 ? ` ×${e.n.toLocaleString("de-DE")}` : ""}`;
      const text = (e) => {
        const g = e.kind === "money" ? gold(e.amount) : "";
        switch (e.kind + ":" + e.type) {
          case "item:deposit": return `${who(e.who)} hat ${item(e)} eingelagert`;
          case "money:deposit": return `${who(e.who)} hat ${g} eingezahlt`;
          case "money:depositSummary": return `Gildenbonus: ${g} eingezahlt`;
          default: return `${who(e.who)}: ${esc(e.type)}`;
        }
      };
      const ago = (iso) => {
        const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600000)), d = Math.floor(h / 24);
        if (h < 1) return "vor < 1 Std.";
        if (d < 1) return `vor ca. ${h} Std.`;
        if (d < 60) return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
        return `vor ${Math.floor(d / 30)} Monaten`;
      };
      const when = (iso) => "ca. " + new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

      // Rangliste: wer hat am meisten Gold eingezahlt bzw. Gegenstände eingelagert
      const top = donorRanking();
      $("#bank-donors").innerHTML = top.length
        ? top.map((d) => `<li><span class="who">${who(d.name)}</span><span class="what">${[d.gold ? gold(d.gold) : "", d.items ? `${d.items.toLocaleString("de-DE")} Gegenstände` : ""].filter(Boolean).join(" · ")}</span></li>`).join("")
        : `<li class="bank-empty">Noch keine Einzahlungen erfasst.</li>`;

      const FILTERS = [
        ["all", "Alles", () => true],
        ["money", "Gold", (e) => e.kind === "money"],
        ["item", "Gegenstände", (e) => e.kind === "item"],
      ];
      let logFilter = "all", shown = 15;
      $("#log-filter").innerHTML = FILTERS.map(([id, label]) => `<button role="tab" data-id="${id}">${label}</button>`).join("");
      $("#log-filter").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (b) { logFilter = b.dataset.id; shown = 15; renderLog(); }
      });
      $("#log-more").addEventListener("click", () => { shown += 50; renderLog(); });

      function renderLog() {
        document.querySelectorAll("#log-filter button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === logFilter)));
        const list = entries.filter(FILTERS.find((f) => f[0] === logFilter)[2]);
        $("#bank-log").innerHTML = list.length
          ? list.slice(0, shown).map((e) => `<li><span>${text(e)}</span><small title="${esc(when(e.t))}">${esc(ago(e.t))}${e.tab ? ` · ${esc(e.tab)}` : ""}</small></li>`).join("")
          : `<li class="bank-empty">Keine Einträge.</li>`;
        $("#log-more").hidden = list.length <= shown;
      }
      renderLog();
    }

    // ---------- Mitgliederecke: Bedarf an Gegenständen anmelden ----------
    // Läuft über ein kleines PHP-Skript auf eigenem Webspace (Ordner api/),
    // Anmeldung mit Discord. Ohne C.needsApi bleibt alles ausgeblendet.
    function needBtn(i) {
      if (!corner || !corner.ready || !i.id) return "";
      const mine = corner.needs.some((n) => n.item_id === i.id && n.mine);
      const count = corner.user ? corner.needs.filter((n) => n.item_id === i.id).length : corner.counts[i.id] || 0;
      if (!corner.user) return count ? `<small class="need-count" title="Bedarf angemeldet">${count}× Bedarf</small>` : "";
      return `<button type="button" class="need-btn${mine ? " on" : ""}" data-id="${i.id}" data-name="${esc(i.name)}" aria-pressed="${mine}"
        title="${mine ? "Deine Anmeldung zurückziehen" : "Bedarf an diesem Gegenstand anmelden"}">${mine ? "✓ Bedarf" : "Bedarf"}${count ? ` · ${count}` : ""}</button>`;
    }
    var corner = { ready: false, user: null, needs: [], counts: {} };
    const API = C.needsApi;
    if (API) {
      const call = (action, body) => fetch(`${API}?action=${action}`, {
        method: body ? "POST" : "GET",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
        return j;
      });
      const load = () => call("state").then((j) => {
        Object.assign(corner, { ready: true, user: j.user || null, needs: j.needs || [], counts: j.counts || {} });
        renderCorner(); renderBank();
      });
      const fail = (e) => { $("#corner-msg") ? ($("#corner-msg").textContent = e.message) : alert(e.message); };
      const fmtShort = (t) => new Date(t * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "short" });

      function renderCorner() {
        const u = corner.user;
        $("#corner").hidden = false;
        if (!u) {
          $("#corner-body").innerHTML = `<p>Brauchst du etwas aus der Gildenbank? Melde dich mit Discord an und merke Gegenstände vor – die Offiziere sehen, wer was braucht.</p>
            <a class="btn primary discord-btn" href="${esc(API)}?action=login&amp;return=${encodeURIComponent(location.href.split("#")[0])}">Mit Discord anmelden</a>`;
          return;
        }
        const mine = corner.needs.filter((n) => n.mine);
        // alle offenen Anmeldungen nach Gegenstand
        const groups = new Map();
        corner.needs.forEach((n) => { const g = groups.get(n.item_id) || { name: n.item_name, list: [] }; g.list.push(n); groups.set(n.item_id, g); });
        const person = (n) => esc(n.character || n.user_name) + (n.character ? ` <small>(${esc(n.user_name)})</small>` : "");
        $("#corner-body").innerHTML = `
          <p class="corner-user">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" width="28" height="28">` : ""}<span>Angemeldet als <b>${esc(u.name)}</b>${u.officer ? ' <small class="tag">Offizier</small>' : ""}</span>
            <button type="button" class="linkish" id="corner-logout">Abmelden</button></p>
          <label class="corner-char">Dein Charakter <input id="corner-char" list="corner-chars" value="${esc(u.character || "")}" placeholder="z. B. ${esc(M[0] ? fullName(M[0]) : "")}" maxlength="50"></label>
          <datalist id="corner-chars">${M.map((m) => `<option value="${esc(fullName(m))}">`).join("")}</datalist>
          <p class="corner-msg" id="corner-msg" role="status"></p>
          <h4>Deine Anmeldungen</h4>
          <ul class="need-list">${mine.length ? mine.map((n) => `<li><b>${esc(n.item_name)}</b><small>${esc(fmtShort(n.created))}</small><button type="button" class="linkish" data-remove="${n.id}">zurückziehen</button></li>`).join("")
            : '<li class="empty">Noch nichts – klicke bei einem Gegenstand auf „Bedarf“.</li>'}</ul>
          <h4>Alle Anmeldungen</h4>
          <ul class="need-list">${groups.size ? [...groups.values()].map((g) => `<li class="group"><b>${esc(g.name)}</b><span>${g.list.map((n) =>
            `<span class="who">${person(n)}${u.officer ? ` <button type="button" class="linkish" data-done="${n.id}" title="Ausgegeben – Anmeldung schließen">erledigt</button>` : ""}</span>`).join("")}</span></li>`).join("")
            : '<li class="empty">Keine offenen Anmeldungen.</li>'}</ul>`;
      }

      $("#corner").addEventListener("click", (e) => {
        const t = e.target.closest("button");
        if (!t) return;
        if (t.id === "corner-logout") call("logout", {}).then(load).catch(fail);
        else if (t.dataset.remove) call("remove", { id: +t.dataset.remove }).then(load).catch(fail);
        else if (t.dataset.done) call("done", { id: +t.dataset.done }).then(load).catch(fail);
      });
      $("#corner").addEventListener("change", (e) => {
        if (e.target.id !== "corner-char") return;
        call("profile", { character: e.target.value.trim() }).then(load).then(() => { $("#corner-msg").textContent = "Gespeichert."; }).catch(fail);
      });
      $("#bank-items").addEventListener("click", (e) => {
        const b = e.target.closest(".need-btn");
        if (!b) return;
        b.disabled = true;
        const own = corner.needs.find((n) => n.item_id === +b.dataset.id && n.mine);
        (own ? call("remove", { id: own.id }) : call("add", { item_id: +b.dataset.id, item_name: b.dataset.name })).then(load).catch((err) => { b.disabled = false; fail(err); });
      });
      load().catch(() => {
        $("#corner").hidden = false;
        $("#corner-body").innerHTML = '<p class="bank-empty">Die Mitgliederecke ist gerade nicht erreichbar.</p>';
      });
    }
  }
})();

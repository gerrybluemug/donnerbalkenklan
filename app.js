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

  // ---------- Texte aus der Konfiguration ----------
  document.querySelectorAll("[data-bind]").forEach((el) => (el.textContent = C[el.dataset.bind] ?? ""));
  document.title = C.name;
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

  const updated = R.updated ? new Date(R.updated).toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" }) : "unbekannt";
  $("#stand").innerHTML = `Mitgliederdaten aus der <a href="${esc(C.armoryUrl)}" target="_blank" rel="noopener">WoW-Armory</a> · Stand: ${esc(updated)}`;

  // ---------- Kennzahlen ----------
  const maxLvl = R.maxLevel || 60;
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

  // ---------- Mitgliederliste ----------
  const fill = (sel, opts) => { const el = $(sel); opts.forEach(([v, l]) => el.insertAdjacentHTML("beforeend", `<option value="${esc(v)}">${esc(l)}</option>`)); };
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
        <td><a href="${charUrl(m)}" target="_blank" rel="noopener" style="color:${k.color}">${esc(fullName(m))}</a></td>
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
  ["#f-search", "#f-class", "#f-race", "#f-rank", "#f-minlvl"].forEach((s) => $(s).addEventListener("input", render));
  render();

  // ---------- Gildenbank ----------
  const B = window.BANK;
  const bankChars = B ? Object.entries(B.chars || {}) : [];
  if (B && (bankChars.length || B.guild)) {
    $("#gildenbank").hidden = false;
    $("#nav-bank").hidden = false;

    const QUALITY = [
      ["Schlecht", "#9d9d9d"], ["Verbreitet", "#ffffff"], ["Selten", "#1eff00"], ["Rar", "#0070dd"],
      ["Episch", "#a335ee"], ["Legendär", "#ff8000"], ["Artefakt", "#e6cc80"], ["Erbstück", "#00ccff"], ["WoW-Token", "#00ccff"],
    ];
    const qColor = (q) => (QUALITY[q] || QUALITY[1])[1];
    const gold = (c) => {
      const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), k = c % 100;
      return `<span class="gold">${g.toLocaleString("de-DE")}g</span> <span class="silver">${s}s</span> <span class="copper">${k}c</span>`;
    };
    // Bank-Charakter "Bankallg" → "Bankallg Vontrudi", wenn der Vorname in der Gilde eindeutig ist
    const displayName = (key) => {
      const hits = M.filter((m) => m.name.toLowerCase() === key.toLowerCase());
      return hits.length === 1 ? fullName(hits[0]) : key;
    };
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");

    const sources = bankChars.map(([key, c]) => ({
      id: "c:" + key, label: displayName(key), money: c.money || 0, updated: c.bankUpdated || c.updated,
      items: c.items.map((i) => ({ ...i, loc: `${displayName(key)} (${i.where})` })),
    }));
    if (B.guild) {
      sources.push({
        id: "guild", label: "Gildenbank", money: B.guild.money || 0, updated: B.guild.updated,
        items: B.guild.tabs.flatMap((t) => t.items.map((i) => ({ ...i, loc: `Gildenbank – ${t.name}` }))),
      });
    }

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
        const e = map.get(key) || { name: i.name, q: i.q, n: 0, locs: new Set() };
        e.n += i.n; e.locs.add(i.loc); map.set(key, e);
      }));
      const items = [...map.values()]
        .filter((i) => (!q || i.name.toLocaleLowerCase("de").includes(q)) && (fq === "" || String(i.q) === fq))
        .sort((a, b) => b.q - a.q || a.name.localeCompare(b.name, "de"));
      $("#bank-items").innerHTML = items.length
        ? items.map((i) => `<div class="bank-item"><span class="nm"><b style="color:${qColor(i.q)}">${esc(i.name)}</b><small>${esc([...i.locs].join(", "))}</small></span><span class="qty">×${i.n.toLocaleString("de-DE")}</span></div>`).join("")
        : `<p class="bank-empty">Keine passenden Gegenstände.</p>`;
      $("#b-count").textContent = `${items.length} verschiedene Gegenstände`;
    }
    ["#b-search", "#b-quality"].forEach((s) => $(s).addEventListener("input", renderBank));
    renderBank();
  }
})();

-- Donnerbalken Bank
-- Liest den Inhalt von Bank-Charakteren (Taschen + Bankfach) und der
-- Gildenbank aus und stellt ihn als Export-Text für die Homepage bereit.
--
-- Befehle:
--   /gbank an      – diesen Charakter als Bank-Charakter erfassen
--   /gbank aus     – diesen Charakter nicht mehr erfassen
--   /gbank export  – Export-Fenster öffnen (Strg+C zum Kopieren)
--   /gbank status  – zeigt, was zuletzt erfasst wurde
--
-- Außerdem liest es (mit jedem Charakter, der in der Gilde ist) die
-- Gildentermine aus dem Ingame-Kalender.

local ADDON = ...
local DB
local PREFIX = "|cffe2b65cDonnerbalken Bank:|r "

local function say(msg) print(PREFIX .. msg) end

---------------------------------------------------------------------------
-- Container-API (neue C_Container-API mit Rückfall auf die alte)
---------------------------------------------------------------------------
local GetNumSlots = (C_Container and C_Container.GetContainerNumSlots) or GetContainerNumSlots

local function GetSlot(bag, slot)
  if C_Container and C_Container.GetContainerItemInfo then
    local info = C_Container.GetContainerItemInfo(bag, slot)
    if info then return info.itemID, info.stackCount, info.quality, info.hyperlink end
  elseif GetContainerItemInfo then
    local _, count, _, quality, _, _, link, _, _, itemID = GetContainerItemInfo(bag, slot)
    return itemID, count, quality, link
  end
end

local function ItemName(id, link)
  local name = link and link:match("%[(.-)%]")
  if (not name or name == "") and id then
    if C_Item and C_Item.GetItemNameByID then name = C_Item.GetItemNameByID(id) end
    if not name and GetItemInfo then name = GetItemInfo(id) end
  end
  return name or ("Gegenstand #" .. tostring(id))
end

local function BagIDs()
  local ids, last = {}, NUM_TOTAL_EQUIPPED_BAG_SLOTS or NUM_BAG_SLOTS or 4
  for i = 0, last do ids[#ids + 1] = i end
  return ids
end

local function BankIDs()
  local ids = {}
  local E = Enum and Enum.BagIndex
  if E and E.CharacterBankTab_1 then
    -- neueres Bank-System: Bankfächer statt Bankfach + Banktaschen
    for i = 1, 9 do
      local id = E["CharacterBankTab_" .. i]
      if id then ids[#ids + 1] = id end
    end
  else
    ids[#ids + 1] = BANK_CONTAINER or -1
    local first = (NUM_TOTAL_EQUIPPED_BAG_SLOTS or NUM_BAG_SLOTS or 4) + 1
    for i = first, first + (NUM_BANKBAGSLOTS or 7) - 1 do ids[#ids + 1] = i end
  end
  return ids
end

local function ScanContainers(ids, where, out)
  for _, bag in ipairs(ids) do
    local ok, n = pcall(GetNumSlots, bag)
    if ok and n and n > 0 then
      for slot = 1, n do
        local id, count, quality, link = GetSlot(bag, slot)
        if id then out[#out + 1] = { id, ItemName(id, link), quality or 1, count or 1, where } end
      end
    end
  end
end

---------------------------------------------------------------------------
-- JSON-Ausgabe
---------------------------------------------------------------------------
local ESC = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
local function esc(s)
  return (s:gsub('[%c"\\]', function(c) return ESC[c] or string.format("\\u%04x", c:byte()) end))
end

local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" then return false end
    n = n + 1
  end
  return n == #t
end

local function toJSON(v)
  local tv = type(v)
  if tv == "table" then
    local parts = {}
    if isArray(v) then
      for i = 1, #v do parts[i] = toJSON(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = '"' .. esc(tostring(k)) .. '":' .. toJSON(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif tv == "string" then
    return '"' .. esc(v) .. '"'
  elseif tv == "number" then
    if v == math.floor(v) then return string.format("%.0f", v) end
    return tostring(v)
  elseif tv == "boolean" then
    return tostring(v)
  end
  return "null"
end

local LOG_MAX, LOG_EXPORT = 1000, 200 -- gespeicherte / exportierte Protokolleinträge je Art

-- Für die Homepage nur Einzahlungen/Einlagerungen exportieren (die neuesten n);
-- Entnahmen bleiben im Spiel und werden nicht veröffentlicht.
local EXPORT_TYPES = { deposit = true, depositSummary = true }
local function Deposits(t, n)
  local r = {}
  for i = #t, 1, -1 do
    if #r >= n then break end
    if EXPORT_TYPES[t[i][2]] then table.insert(r, 1, t[i]) end
  end
  return r
end

-- Wie viele Stück passen auf einen Stapel? (für die Spender-Rangliste:
-- 1 Stapel Leder = 20 Stück soll so viel zählen wie 1 Waffe)
-- Einmal bekannte Werte merkt sich das Addon; noch nicht geladene Gegenstände
-- werden beim nächsten Export erneut versucht.
local function StackSize(id)
  if not id or id == 0 then return nil end
  local n = DB.stacks[id]
  if n then return n end
  local function ok(v) return type(v) == "number" and v >= 1 end
  if C_Item and C_Item.GetItemMaxStackSizeByID then n = C_Item.GetItemMaxStackSizeByID(id) end
  if not ok(n) and C_Item and C_Item.GetItemInfo then n = select(8, C_Item.GetItemInfo(id)) end
  if not ok(n) and GetItemInfo then n = select(8, GetItemInfo(id)) end
  if type(n) == "number" and n >= 1 then DB.stacks[id] = n; return n end
  if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, id) end
end

local function CollectStacks(log)
  local out = {}
  local function add(id) local n = StackSize(id); if n then out[tostring(id)] = n end end
  for _, c in pairs(DB.chars) do
    for _, it in ipairs(c.bags or {}) do add(it[1]) end
    for _, it in ipairs(c.bank or {}) do add(it[1]) end
  end
  if DB.guild then for _, t in ipairs(DB.guild.tabs) do for _, it in ipairs(t.items) do add(it[1]) end end end
  if log then for _, e in ipairs(log.items) do add(e[4]) end end
  return out
end

local function BuildExport()
  local log = false
  local L = DB.guild and DB.guildLog[DB.guild.name]
  if L then log = { items = Deposits(L.items, LOG_EXPORT), money = Deposits(L.money, LOG_EXPORT) } end
  -- Gildentermine: die der Gilde mit der Gildenbank, sonst die zuletzt gelesenen
  local cal = DB.guild and DB.calendar[DB.guild.name]
  if not cal then
    for _, c in pairs(DB.calendar) do if not cal or c.updated > cal.updated then cal = c end end
  end
  -- Gildenliste (wer wann zuletzt online war): die der eigenen Gilde
  local gname = GetGuildInfo and GetGuildInfo("player")
  local roster = (DB.guild and DB.roster[DB.guild.name]) or (gname and DB.roster[gname])
  DB.lastExport = toJSON({ v = 1, exported = time(), chars = DB.chars, guild = DB.guild or false, guildLog = log, calendar = cal or false, roster = roster or false, stacks = CollectStacks(log) })
  return DB.lastExport
end

---------------------------------------------------------------------------
-- Erfassen
---------------------------------------------------------------------------
local function CharKey() return (UnitName("player")) end
local function IsBankChar() return DB.enabled[CharKey()] == true end

local function CharEntry()
  local key = CharKey()
  DB.chars[key] = DB.chars[key] or { bags = {}, bank = {} }
  return DB.chars[key]
end

---------------------------------------------------------------------------
-- Lagerdauer: pro Bank-Charakter bzw. Gildenbank merkt sich das Addon,
-- seit wann ein Gegenstand (Item-ID) dort liegt. Umlagern zwischen Taschen
-- und Bankfach bzw. zwischen Gildenbankfächern setzt die Zeit nicht zurück.
-- Ist ein Gegenstand ganz weg, beginnt die Zählung beim nächsten Einlagern neu.
--
-- DB.seen[ort][itemID] = { t = erstmals gesehen, i = schon beim allerersten
--   Auslesen vorhanden (dann kann er auch älter sein), w = zuletzt gesehen in }
--
-- Jeder Gegenstand im Export bekommt [6] = seit (Unix-Zeit), [7] = 1/0 für "i".
---------------------------------------------------------------------------
local function Track(place, lists, firstParts, unknownParts)
  DB.seen[place] = DB.seen[place] or {}
  local seen, now, present = DB.seen[place], time(), {}
  for _, list in ipairs(lists) do
    for _, it in ipairs(list) do
      local id, where = it[1], it[5]
      present[id] = true
      local s = seen[id]
      if not s then
        s = { t = now, i = firstParts[where] or nil }
        seen[id] = s
      end
      s.w = where
      it[6], it[7] = s.t, s.i and 1 or 0
    end
  end
  -- nicht mehr vorhandene Gegenstände vergessen – außer ihr letzter Lagerort
  -- konnte gerade nicht gelesen werden (z. B. Gildenbankfach noch nicht geladen)
  for id, s in pairs(seen) do
    if not present[id] and not (unknownParts and unknownParts[s.w]) then seen[id] = nil end
  end
end

local function ScanBags(firstParts)
  if not IsBankChar() then return end
  local c = CharEntry()
  firstParts = firstParts or {}
  if not c.bagsScanned then firstParts["Taschen"] = true; c.bagsScanned = true end
  c.bags = {}
  ScanContainers(BagIDs(), "Taschen", c.bags)
  Track("c:" .. CharKey(), { c.bags, c.bank or {} }, firstParts)
  c.money = GetMoney()
  c.updated = time()
  BuildExport()
end

local bankOpen = false
local function ScanBank()
  if not (bankOpen and IsBankChar()) then return end
  local c = CharEntry()
  local first = {}
  if not c.bankScanned then first["Bank"] = true; c.bankScanned = true end
  c.bank = {}
  ScanContainers(BankIDs(), "Bank", c.bank)
  c.bankUpdated = time()
  ScanBags(first)
end

local guildOpen = false
local function QueryGuildTabs()
  for tab = 1, (GetNumGuildBankTabs() or 0) do
    local _, _, viewable = GetGuildBankTabInfo(tab)
    if viewable then QueryGuildBankTab(tab) end
  end
end

local function ScanGuild()
  if not guildOpen then return end
  local g = {
    name = GetGuildInfo("player"),
    updated = time(),
    money = GetGuildBankMoney and GetGuildBankMoney() or 0,
    tabs = {},
  }
  local place = "g:" .. tostring(g.name)
  DB.guildTabsSeen[place] = DB.guildTabsSeen[place] or {}
  local tabsSeen, lists, first, unknown = DB.guildTabsSeen[place], {}, {}, {}
  for tab = 1, (GetNumGuildBankTabs() or 0) do
    local name, _, viewable = GetGuildBankTabInfo(tab)
    name = name or ("Fach " .. tab)
    local items = {}
    if viewable then
      for slot = 1, (MAX_GUILDBANK_SLOTS_PER_TAB or 98) do
        local link = GetGuildBankItemLink(tab, slot)
        if link then
          local _, count, _, _, quality = GetGuildBankItemInfo(tab, slot)
          local id = tonumber(link:match("item:(%d+)"))
          items[#items + 1] = { id or 0, ItemName(id, link), quality or 1, count or 1, name }
        end
      end
    end
    -- leere oder nicht einsehbare Fächer gelten als "nicht gelesen":
    -- Daten der Gildenbank kommen fachweise verzögert vom Server
    if #items == 0 then unknown[name] = true
    elseif not tabsSeen[name] then first[name] = true; tabsSeen[name] = true end
    lists[#lists + 1] = items
    g.tabs[#g.tabs + 1] = { name = name, viewable = viewable and true or false, items = items }
  end
  Track(place, lists, first, unknown)
  DB.guild = g
  BuildExport()
end

---------------------------------------------------------------------------
-- Gildenbank-Protokoll: wer hat was eingelagert/entnommen, wer hat wie viel
-- Gold eingezahlt/abgehoben.
--
-- WoW liefert je Fach nur die letzten 25 Einträge (dazu das Geldprotokoll),
-- jeweils mit relativer Zeit ("vor 3 Std."). Das Addon rechnet daraus eine
-- ungefähre Uhrzeit aus und sammelt bei jedem Öffnen der Gildenbank neue
-- Einträge dazu. Schon bekannte Einträge werden wiedererkannt (gleicher
-- Inhalt und die Zeit passt ungefähr) – so entsteht eine lange Historie.
--
-- DB.guildLog[Gilde].items: { zeit, typ, name, itemID, itemName, qualität, anzahl, fach }
-- DB.guildLog[Gilde].money: { zeit, typ, name, kupfer }
---------------------------------------------------------------------------
local HOUR = 3600
local QUALITY_BY_COLOR = {
  ff9d9d9d = 0, ffffffff = 1, ff1eff00 = 2, ff0070dd = 3, ffa335ee = 4, ffff8000 = 5, ffe6cc80 = 6, ff00ccff = 7,
}

local function Quality(id, link)
  local q
  if C_Item and C_Item.GetItemQualityByID then q = C_Item.GetItemQualityByID(id) end
  if not q and GetItemInfo then q = select(3, GetItemInfo(link or id)) end
  if not q and link then q = QUALITY_BY_COLOR[(link:match("|c(%x%x%x%x%x%x%x%x)") or ""):lower()] end
  return q or 1
end

local function Ago(y, m, d, h)
  return ((((y or 0) * 12 + (m or 0)) * 30 + (d or 0)) * 24 + (h or 0)) * HOUR
end

-- erlaubte Zeitabweichung beim Wiedererkennen: WoW rundet auf Stunden,
-- bei alten Einträgen (Monate) ist die Angabe noch ungenauer
local function Tolerance(age) return 2 * HOUR + age * 0.05 end

local function Sig(e, n)
  local p = {}
  for i = 2, n do p[#p + 1] = tostring(e[i]) end
  return table.concat(p, "\31")
end

-- fügt neue Einträge aus "fresh" in die (nach Zeit sortierte) Liste ein
local function MergeLog(list, fresh, n, now)
  local used, new = {}, {}
  for _, e in ipairs(fresh) do
    local s, tol, hit = Sig(e, n), Tolerance(now - e[1]), nil
    for i = #list, 1, -1 do
      local o = list[i]
      if o[1] < e[1] - tol then break end
      if not used[i] and math.abs(o[1] - e[1]) <= tol and Sig(o, n) == s then hit = i; break end
    end
    if hit then used[hit] = true else new[#new + 1] = e end
  end
  if #new == 0 then return 0 end
  for _, e in ipairs(new) do list[#list + 1] = e end
  table.sort(list, function(a, b) return a[1] < b[1] end)
  while #list > LOG_MAX do table.remove(list, 1) end
  return #new
end

local function ReadGuildLog()
  local gname = GetGuildInfo("player")
  if not gname or not GetNumGuildBankTransactions then return end
  DB.guildLog[gname] = DB.guildLog[gname] or { items = {}, money = {} }
  local L, now, fresh = DB.guildLog[gname], time(), {}

  for tab = 1, (GetNumGuildBankTabs() or 0) do
    local tabName = GetGuildBankTabInfo(tab) or ("Fach " .. tab)
    for i = 1, (GetNumGuildBankTransactions(tab) or 0) do
      local typ, name, link, count, _, _, y, m, d, h = GetGuildBankTransaction(tab, i)
      if (typ == "deposit" or typ == "withdraw") and link then
        local id = tonumber(link:match("item:(%d+)")) or 0
        fresh[#fresh + 1] = { now - Ago(y, m, d, h), typ, name or "", id, ItemName(id, link), Quality(id, link), count or 1, tabName }
      end
    end
  end
  local added = MergeLog(L.items, fresh, 8, now)

  fresh = {}
  if GetNumGuildBankMoneyTransactions then
    for i = 1, (GetNumGuildBankMoneyTransactions() or 0) do
      local typ, name, amount, y, m, d, h = GetGuildBankMoneyTransaction(i)
      if typ then fresh[#fresh + 1] = { now - Ago(y, m, d, h), typ, name or "", amount or 0 } end
    end
  end
  added = added + MergeLog(L.money, fresh, 4, now)
  if added > 0 then BuildExport() end
end

local function QueryGuildLogs()
  if not QueryGuildBankLog then return end
  local n = GetNumGuildBankTabs() or 0
  -- nacheinander anfragen, damit der Server nicht drosselt; n+1 = Geldprotokoll
  local tabs = {}
  for tab = 1, n do tabs[#tabs + 1] = tab end
  tabs[#tabs + 1] = (MAX_GUILDBANK_TABS or 8) + 1
  for i, tab in ipairs(tabs) do
    C_Timer.After(0.4 * i, function() if guildOpen then QueryGuildBankLog(tab) end end)
  end
end

---------------------------------------------------------------------------
-- Export-Fenster
---------------------------------------------------------------------------
local exportFrame
local function ShowExport()
  local text = BuildExport()
  if not exportFrame then
    local f = CreateFrame("Frame", "DonnerbalkenBankExport", UIParent, "BasicFrameTemplateWithInset")
    f:SetSize(580, 380)
    f:SetPoint("CENTER")
    f:SetFrameStrata("DIALOG")
    f:SetMovable(true)
    f:EnableMouse(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", f.StopMovingOrSizing)
    local title = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    title:SetPoint("TOP", 0, -5)
    title:SetText("Gildenbank-Export  –  Strg+C kopieren, Esc schließen")
    local sf = CreateFrame("ScrollFrame", nil, f, "UIPanelScrollFrameTemplate")
    sf:SetPoint("TOPLEFT", 12, -32)
    sf:SetPoint("BOTTOMRIGHT", -32, 12)
    local eb = CreateFrame("EditBox", nil, sf)
    eb:SetMultiLine(true)
    eb:SetFontObject(ChatFontNormal)
    eb:SetWidth(520)
    eb:SetAutoFocus(true)
    eb:SetScript("OnEscapePressed", function() f:Hide() end)
    eb:SetScript("OnTextChanged", function(self, user) if user then self:SetText(f.text); self:HighlightText() end end)
    sf:SetScrollChild(eb)
    f.eb = eb
    tinsert(UISpecialFrames, "DonnerbalkenBankExport")
    exportFrame = f
  end
  exportFrame.text = text
  exportFrame.eb:SetText(text)
  exportFrame:Show()
  exportFrame.eb:SetFocus()
  exportFrame.eb:HighlightText()
end

---------------------------------------------------------------------------
-- Befehle
---------------------------------------------------------------------------
---------------------------------------------------------------------------
-- Gildentermine aus dem Ingame-Kalender
-- DB.calendar[Gilde] = { guild, updated, events = { {start, ende, titel, art, typ} } }
-- Zeiten als "JJJJ-MM-TTTHH:MM" in Serverzeit, so wie der Kalender sie zeigt.
---------------------------------------------------------------------------
local CAL_TYPES = { GUILD_EVENT = true, GUILD_ANNOUNCEMENT = true }
local CAL_MONTHS = 3 -- aktueller Monat + 2 weitere
local calAsked = false

local function CalTime(t)
  if not t then return false end
  return string.format("%04d-%02d-%02dT%02d:%02d", t.year, t.month, t.monthDay, t.hour or 0, t.minute or 0)
end

local function ReadCalendar()
  if not (C_Calendar and C_Calendar.GetNumDayEvents and C_Calendar.GetDayEvent and C_Calendar.GetMonthInfo
    and C_DateAndTime and C_DateAndTime.GetCurrentCalendarTime) then return end
  local gname = GetGuildInfo("player")
  if not gname then return end
  local now = C_DateAndTime.GetCurrentCalendarTime()
  local shown = C_Calendar.GetMonthInfo(0)
  if not (now and shown) then return end
  -- Der Kalender zählt Monate ab dem gerade angezeigten (der Spieler kann geblättert haben)
  local base = (now.year - shown.year) * 12 + (now.month - shown.month)
  local events, seen = {}, {}
  for m = 0, CAL_MONTHS - 1 do
    local info = C_Calendar.GetMonthInfo(base + m)
    local from = m == 0 and now.monthDay or 1
    for day = from, (info and info.numDays or 31) do
      for i = 1, (C_Calendar.GetNumDayEvents(base + m, day) or 0) do
        local e = C_Calendar.GetDayEvent(base + m, day, i)
        -- mehrtägige Termine nur einmal (am ersten Tag)
        if e and CAL_TYPES[e.calendarType] and (not e.sequenceType or e.sequenceType == "" or e.sequenceType == "START") then
          local start = CalTime(e.startTime)
          local key = start .. "|" .. (e.title or "")
          if not seen[key] then
            seen[key] = true
            -- ohne eingetragenes Ende liefert WoW 2000-01-01 → dann kein Ende
            local ende = CalTime(e.endTime)
            if ende and ende < start then ende = false end
            table.insert(events, { start, ende, e.title or "", e.calendarType, e.eventType or false })
          end
        end
      end
    end
  end
  table.sort(events, function(a, b) return a[1] < b[1] end)
  DB.calendar[gname] = { guild = gname, updated = time(), events = events }
  BuildExport()
end

local function AskCalendar()
  if calAsked or not (C_Calendar and C_Calendar.OpenCalendar) or not IsInGuild() then return end
  calAsked = true
  C_Calendar.OpenCalendar() -- lädt nur die Termine (CALENDAR_UPDATE_EVENT_LIST), öffnet nichts
end

---------------------------------------------------------------------------
-- Gildenliste: wann war wer zuletzt online? (für "Mitglied des Tages")
-- Auf der Homepage landet davon nur, wer länger offline ist – keine Login-Zeiten.
---------------------------------------------------------------------------
local rosterReadAt = 0

local function ReadRoster()
  if not (IsInGuild() and GetNumGuildMembers and GetGuildRosterInfo) then return end
  if GetTime() - rosterReadAt < 10 then return end
  local gname = GetGuildInfo("player")
  local n = GetNumGuildMembers()
  if not gname or not n or n == 0 then return end
  rosterReadAt = GetTime()
  local now, seen = time(), {}
  for i = 1, n do
    local name, _, _, _, _, _, _, _, online = GetGuildRosterInfo(i)
    if type(name) == "string" then
      name = name:match("^[^-]+")
      local t
      if online then
        t = now
      elseif GetGuildRosterLastOnline then
        local y, m, d, h = GetGuildRosterLastOnline(i)
        if type(y) == "number" then t = now - ((((y * 365) + (m or 0) * 30 + (d or 0)) * 24 + (h or 0)) * 3600) end
      end
      if t and (not seen[name] or t > seen[name]) then seen[name] = t end
    end
  end
  DB.roster[gname] = { guild = gname, updated = now, seen = seen }
end

local function AskRoster()
  if not IsInGuild() then return end
  if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
end

local function fmtTime(t) return t and date("%d.%m. %H:%M", t) or "nie" end

SLASH_DONNERBALKENBANK1 = "/gbank"
SlashCmdList.DONNERBALKENBANK = function(msg)
  msg = (msg or ""):lower():match("^%s*(%S*)")
  local key = CharKey()
  if msg == "an" then
    DB.enabled[key] = true
    ScanBags()
    say(key .. " wird jetzt als Bank-Charakter erfasst. Öffne einmal das Bankfach, damit auch die Bank gelesen wird.")
  elseif msg == "aus" then
    DB.enabled[key] = nil
    DB.chars[key] = nil
    DB.seen["c:" .. key] = nil
    BuildExport()
    say(key .. " wird nicht mehr erfasst; gespeicherte Daten wurden entfernt.")
  elseif msg == "export" then
    ShowExport()
  elseif msg == "status" then
    local any = false
    for name, c in pairs(DB.chars) do
      any = true
      say(string.format("%s: %d Gegenstände in Taschen, %d in der Bank (Bank gelesen: %s)", name, #(c.bags or {}), #(c.bank or {}), fmtTime(c.bankUpdated)))
    end
    if DB.guild then
      local n = 0
      for _, t in ipairs(DB.guild.tabs) do n = n + #t.items end
      say(string.format("Gildenbank: %d Gegenstände in %d Fächern (gelesen: %s)", n, #DB.guild.tabs, fmtTime(DB.guild.updated)))
      local L = DB.guildLog[DB.guild.name]
      if L then say(string.format("Gildenbank-Protokoll: %d Einträge zu Gegenständen, %d zu Gold", #L.items, #L.money)) end
    end
    local gname = GetGuildInfo("player")
    local cal = gname and DB.calendar[gname]
    if cal then say(string.format("Gildentermine: %d (gelesen: %s)", #cal.events, fmtTime(cal.updated))) end
    local ros = gname and DB.roster[gname]
    if ros then
      local c = 0
      for _ in pairs(ros.seen) do c = c + 1 end
      say(string.format("Gildenliste: %d Mitglieder (gelesen: %s)", c, fmtTime(ros.updated)))
    end
    if not any and not DB.guild then say("Noch keine Bank erfasst. Auf dem Bank-Charakter: /gbank an") end
  else
    say("/gbank an | aus | export | status")
  end
end

---------------------------------------------------------------------------
-- Ereignisse
---------------------------------------------------------------------------
local f = CreateFrame("Frame")
local function Reg(ev) pcall(f.RegisterEvent, f, ev) end
for _, ev in ipairs({
  "ADDON_LOADED", "PLAYER_LOGIN", "PLAYER_LOGOUT", "BAG_UPDATE_DELAYED", "PLAYER_MONEY",
  "BANKFRAME_OPENED", "BANKFRAME_CLOSED", "PLAYERBANKSLOTS_CHANGED",
  "GUILDBANKFRAME_OPENED", "GUILDBANKFRAME_CLOSED", "GUILDBANKBAGSLOTS_CHANGED", "GUILDBANK_UPDATE_MONEY", "GUILDBANKLOG_UPDATE",
  "PLAYER_INTERACTION_MANAGER_FRAME_SHOW", "PLAYER_INTERACTION_MANAGER_FRAME_HIDE",
  "CALENDAR_UPDATE_EVENT_LIST", "CALENDAR_UPDATE_GUILD_EVENTS", "GUILD_ROSTER_UPDATE",
}) do Reg(ev) end

local PIT = Enum and Enum.PlayerInteractionType
local function OpenBank() bankOpen = true; C_Timer.After(0.5, ScanBank) end
local function OpenGuild() guildOpen = true; QueryGuildTabs(); C_Timer.After(1, ScanGuild); C_Timer.After(1.5, QueryGuildLogs) end

f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 ~= ADDON then return end
    DonnerbalkenBankDB = DonnerbalkenBankDB or {}
    DB = DonnerbalkenBankDB
    DB.enabled = DB.enabled or {}
    DB.chars = DB.chars or {}
    DB.seen = DB.seen or {}
    DB.guildTabsSeen = DB.guildTabsSeen or {}
    DB.guildLog = DB.guildLog or {}
    DB.calendar = DB.calendar or {}
    DB.roster = DB.roster or {}
    DB.stacks = DB.stacks or {}
    return
  end
  if not DB then return end

  if event == "PLAYER_LOGIN" or event == "PLAYER_MONEY" then
    ScanBags()
    if event == "PLAYER_LOGIN" then C_Timer.After(8, AskCalendar); C_Timer.After(12, AskRoster) end
  elseif event == "CALENDAR_UPDATE_EVENT_LIST" or event == "CALENDAR_UPDATE_GUILD_EVENTS" then
    ReadCalendar()
  elseif event == "GUILD_ROSTER_UPDATE" then
    ReadRoster()
  elseif event == "BAG_UPDATE_DELAYED" then
    if bankOpen then ScanBank() else ScanBags() end
  elseif event == "PLAYER_LOGOUT" then
    BuildExport()
  elseif event == "BANKFRAME_OPENED" then
    OpenBank()
  elseif event == "BANKFRAME_CLOSED" then
    bankOpen = false
  elseif event == "PLAYERBANKSLOTS_CHANGED" then
    ScanBank()
  elseif event == "GUILDBANKFRAME_OPENED" then
    OpenGuild()
  elseif event == "GUILDBANKFRAME_CLOSED" then
    guildOpen = false
  elseif event == "GUILDBANKBAGSLOTS_CHANGED" or event == "GUILDBANK_UPDATE_MONEY" then
    ScanGuild()
  elseif event == "GUILDBANKLOG_UPDATE" then
    ReadGuildLog()
  elseif event == "PLAYER_INTERACTION_MANAGER_FRAME_SHOW" and PIT then
    if arg1 == PIT.Banker then OpenBank() elseif arg1 == PIT.GuildBanker then OpenGuild() end
  elseif event == "PLAYER_INTERACTION_MANAGER_FRAME_HIDE" and PIT then
    if arg1 == PIT.Banker then bankOpen = false elseif arg1 == PIT.GuildBanker then guildOpen = false end
  end
end)

-- Donnerbalken Bank
-- Liest den Inhalt von Bank-Charakteren (Taschen + Bankfach) und der
-- Gildenbank aus und stellt ihn als Export-Text für die Homepage bereit.
--
-- Befehle:
--   /gbank an      – diesen Charakter als Bank-Charakter erfassen
--   /gbank aus     – diesen Charakter nicht mehr erfassen
--   /gbank export  – Export-Fenster öffnen (Strg+C zum Kopieren)
--   /gbank status  – zeigt, was zuletzt erfasst wurde

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
    for i = 1, 6 do
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

local function BuildExport()
  DB.lastExport = toJSON({ v = 1, exported = time(), chars = DB.chars, guild = DB.guild or false })
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
    end
    if not any and not DB.guild then say("Noch nichts erfasst. Auf dem Bank-Charakter: /gbank an") end
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
  "GUILDBANKFRAME_OPENED", "GUILDBANKFRAME_CLOSED", "GUILDBANKBAGSLOTS_CHANGED", "GUILDBANK_UPDATE_MONEY",
  "PLAYER_INTERACTION_MANAGER_FRAME_SHOW", "PLAYER_INTERACTION_MANAGER_FRAME_HIDE",
}) do Reg(ev) end

local PIT = Enum and Enum.PlayerInteractionType
local function OpenBank() bankOpen = true; C_Timer.After(0.5, ScanBank) end
local function OpenGuild() guildOpen = true; QueryGuildTabs(); C_Timer.After(1, ScanGuild) end

f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 ~= ADDON then return end
    DonnerbalkenBankDB = DonnerbalkenBankDB or {}
    DB = DonnerbalkenBankDB
    DB.enabled = DB.enabled or {}
    DB.chars = DB.chars or {}
    DB.seen = DB.seen or {}
    DB.guildTabsSeen = DB.guildTabsSeen or {}
    return
  end
  if not DB then return end

  if event == "PLAYER_LOGIN" or event == "PLAYER_MONEY" then
    ScanBags()
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
  elseif event == "PLAYER_INTERACTION_MANAGER_FRAME_SHOW" and PIT then
    if arg1 == PIT.Banker then OpenBank() elseif arg1 == PIT.GuildBanker then OpenGuild() end
  elseif event == "PLAYER_INTERACTION_MANAGER_FRAME_HIDE" and PIT then
    if arg1 == PIT.Banker then bankOpen = false elseif arg1 == PIT.GuildBanker then guildOpen = false end
  end
end)

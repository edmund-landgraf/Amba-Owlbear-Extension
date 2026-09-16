const ABILITY_LABELS = new Set(["Str", "Dex", "Con", "Int", "Wis", "Cha"]);
const SAVE_LABELS = new Set(["Fort", "Ref", "Will"]);
const FIELD_LABELS = new Set([
  "Perception", "Languages", "Skills", "Str", "Dex", "Con", "Int", "Wis", "Cha",
  "AC", "Fort", "Ref", "Will", "HP", "Immunities", "Weaknesses", "Resistances",
  "Speed", "Melee", "Ranged", "Items", "Spells",
]);

export function tidyStatValue(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[，、]/g, ",")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,{2,}/g, ",")
    .replace(/;{2,}/g, ";")
    .replace(/\s+/g, " ")
    .replace(/^[:\s;,]+/, "")
    .replace(/[;,\s]+$/, "")
    .trim();
}

export function stripPf2Links(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\/?[A-Za-z0-9._/-]+\.aspx(?:\?[^\s)]+)?/gi, " ")
    .replace(/\]\([^)]*$/g, " ");
}

export function cleanStatText(value) {
  return tidyStatValue(stripPf2Links(value).replace(/<[^>]+>/g, " ").replace(/\*\*/g, ""));
}

function cleanInline(value) {
  return tidyStatValue(stripPf2Links(value).replace(/<[^>]+>/g, " ").replace(/\*\*/g, ""));
}

function titleCase(value) {
  return String(value ?? "").split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase()).join(" ");
}

function signed(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? (number >= 0 ? `+${number}` : String(number)) : tidyStatValue(value);
}

function readableValue(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, amount]) => amount != null && amount !== "");
    return entries.map(([name, amount]) => `${name} ${amount}`).join(", ");
  }
  const raw = tidyStatValue(value);
  if (!raw || raw === "." || /^and weaknesses\.?$/i.test(raw) || raw === "{}") return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return readableValue(parsed);
  } catch { /* ordinary text */ }
  return raw;
}

function addRow(rows, label, value, kind = "field") {
  const cleaned = tidyStatValue(value);
  if (cleaned) rows.push({ label, value: cleaned, kind });
}

function model(name, creature, traits, source, rows) {
  return {
    name: String(name ?? "Monster"),
    creature: creature || "",
    traits: [...new Set(traits.filter(Boolean))],
    source: source || "",
    rows,
  };
}

export function structuredStatCardModel(row) {
  const traits = [row?.Rarity ?? row?.rarity, row?.Alignment ?? row?.alignment, row?.Size ?? row?.size, row?.Family ?? row?.family]
    .map((value) => readableValue(value))
    .filter(Boolean)
    .map(titleCase);
  const rows = [];
  addRow(rows, "Perception", [signed(row?.Perception ?? row?.perception), readableValue(row?.Senses ?? row?.senses)].filter(Boolean).join("; "));
  addRow(rows, "Languages", readableValue(row?.Languages ?? row?.languages));
  addRow(rows, "Skills", readableValue(row?.Skills ?? row?.skills));
  for (const label of ["Str", "Dex", "Con", "Int", "Wis", "Cha"]) addRow(rows, label, signed(row?.[`${label}Mod`] ?? row?.[`${label.toLowerCase()}Mod`]));
  addRow(rows, "AC", readableValue(row?.AC ?? row?.ac));
  addRow(rows, "Fort", signed(row?.Fortitude ?? row?.fortitude));
  addRow(rows, "Ref", signed(row?.Reflex ?? row?.reflex));
  addRow(rows, "Will", signed(row?.Will ?? row?.will));
  addRow(rows, "HP", readableValue(row?.HP ?? row?.hp));
  for (const label of ["Immunities", "Weaknesses", "Resistances", "Speed", "Items"]) {
    addRow(rows, label, readableValue(row?.[label] ?? row?.[label.toLowerCase()]));
  }
  const level = row?.Level ?? row?.level;
  const sourceBook = readableValue(row?.SourceBook ?? row?.sourceBook);
  const sourcePage = readableValue(row?.SourcePage ?? row?.sourcePage);
  return model(row?.Name ?? row?.name, Number.isFinite(Number(level)) ? `Creature ${level}` : "", traits, [sourceBook, sourcePage ? `pg. ${sourcePage}` : ""].filter(Boolean).join(" "), rows);
}

export function apiStatCardModel(row) {
  const structured = structuredStatCardModel(row);
  const raw = rawMdStatCardModel(row?.RawMD ?? row?.rawMD, row?.Name ?? row?.name);
  if (!raw.rows.length) return structured;
  const details = raw.rows.filter((entry) => entry.kind !== "field" || ["Melee", "Ranged", "Spells"].includes(entry.label));
  return { ...structured, rows: [...structured.rows, ...details] };
}
function rawCreatureStart(lines) {
  return lines.findIndex((line) => /^#{1,3}\s+.*\bCreature\s+[-+]?\d+\b/i.test(line));
}

function actionKind(rest) {
  return /(?:Single Action|Two Actions|Three Actions|Free Action|Reaction|◆|◇|↻|↺)/i.test(rest) ? "action" : "passive";
}

function parseHeader(line, fallbackName) {
  const cleaned = cleanInline(line.replace(/^#{1,3}\s+/, ""));
  const match = cleaned.match(/^(.*?)\s+Creature\s+([-+]?\d+)\b/i);
  const name = tidyStatValue(match?.[1] || fallbackName);
  const creature = match ? `Creature ${match[2]}` : "";
  return { name, creature };
}

export function rawMdStatCardModel(rawMd, fallbackName) {
  const lines = String(rawMd ?? "").replace(/\r/g, "").split("\n");
  const start = rawCreatureStart(lines);
  if (start < 0) return model(fallbackName, "", [], "", []);
  const header = parseHeader(lines[start], fallbackName);
  const rows = [];
  const traits = [];
  let source = "";
  let beforeSource = true;
  let pending = null;

  function flush() {
    if (!pending) return;
    const value = tidyStatValue(pending.value);
    if (value) rows.push({ label: pending.label, value, kind: pending.kind });
    pending = null;
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start + 1 && /^#{1,3}\s+/.test(line)) break;
    if (/^\s*---\s*$/.test(line)) { flush(); continue; }
    if (!line.trim()) continue;
    const bullet = beforeSource && line.match(/^\s*-\s+(.+)$/);
    if (bullet) { traits.push(titleCase(cleanInline(bullet[1]))); continue; }
    const bold = line.match(/^\s*\*\*([^*]+)\*\*\s*(.*)$/);
    if (bold) {
      const label = cleanInline(bold[1]);
      const value = cleanInline(bold[2]);
      if (/^Source$/i.test(label)) { flush(); source = value; beforeSource = false; continue; }
      beforeSource = false;
      if (/^Damage$/i.test(label) && pending && /^(Melee|Ranged)$/i.test(pending.label)) {
        pending.value = `${pending.value}${pending.value ? "; " : ""}Damage ${value}`;
        continue;
      }
      flush();
      const normalized = /^.+Spells$/i.test(label) ? "Spells" : label;
      pending = { label: normalized, value, kind: FIELD_LABELS.has(normalized) ? "field" : actionKind(value) };
      continue;
    }
    const text = cleanInline(line);
    if (!text) continue;
    if (pending) pending.value = `${pending.value}${pending.value ? " " : ""}${text}`;
  }
  flush();
  return model(header.name || fallbackName, header.creature, traits, source, rows);
}

function modifier(value) {
  const match = tidyStatValue(value).match(/^([+\-]?\d+)/);
  return match ? (match[1].startsWith("+") || match[1].startsWith("-") ? match[1] : `+${match[1]}`) : tidyStatValue(value);
}

function combineRows(rows) {
  const output = [];
  let abilities = [];
  let saves = [];
  let ac = null;
  const flushAbilities = () => { if (abilities.length) output.push({ label: "Abilities", value: abilities.map((row) => `${row.label} ${modifier(row.value)}`).join(", "), kind: "field" }); abilities = []; };
  const flushDefense = () => {
    const saveValue = saves.map((row) => `${row.label} ${modifier(row.value)}`).join(", ");
    if (ac || saveValue) output.push({ label: "AC", value: [ac ? tidyStatValue(ac.value).match(/^\d+/)?.[0] ?? tidyStatValue(ac.value) : "", saveValue].filter(Boolean).join("; "), kind: "field" });
    ac = null; saves = [];
  };
  for (const row of rows) {
    if (ABILITY_LABELS.has(row.label)) { flushDefense(); abilities.push(row); continue; }
    if (row.label === "AC") { flushAbilities(); flushDefense(); ac = row; continue; }
    if (SAVE_LABELS.has(row.label)) { flushAbilities(); saves.push(row); continue; }
    flushAbilities(); flushDefense(); output.push(row);
  }
  flushAbilities(); flushDefense();
  return output;
}

export function statCardRowsFromModel(card) {
  const type = [card?.creature, ...(card?.traits ?? [])].filter(Boolean).join(", ");
  return [type ? { label: "Type", value: type, kind: "type" } : null, ...combineRows(card?.rows ?? [])].filter(Boolean);
}
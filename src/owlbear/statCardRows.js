import { normalizePf2eActionTokens, splitActionBlocks } from "./pf2eActionIcons.js";
import { rawMdStatCardModel, statCardRowsFromModel } from "./statCardModel.js";

const STAT_LABELS = [
  "Creature",
  "Perception",
  "Languages",
  "Skills",
  "Str",
  "Dex",
  "Con",
  "Int",
  "Wis",
  "Cha",
  "AC",
  "Fort",
  "Ref",
  "Will",
  "HP",
  "Immunities",
  "Weaknesses",
  "Resistances",
  "Speed",
  "Melee",
  "Ranged",
  "Spells",
  "Items",
];

const ABILITY_LABELS = new Set(["Str", "Dex", "Con", "Int", "Wis", "Cha"]);
const SAVE_LABELS = new Set(["Fort", "Ref", "Will"]);
const ACTION_LABELS = new Set(["Melee", "Ranged", "Spells", "Items", "Notes", "Speed"]);

export function cleanStatText(value) {
  const withoutLinks = stripSourceLinks(String(value ?? ""));
  return tidyStatValue(
    normalizePf2eActionTokens(withoutLinks)
      .replace(/<[^>]+>/g, " ")
      .replace(/\*\*/g, "")
  );
}

function stripSourceLinks(value) {
  return String(value ?? "")
    // Preserve labels while removing AoN/Demiplane destinations.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\/?[A-Za-z0-9._/-]+\.aspx(?:\?[^\s)]+)?/gi, " ")
    .replace(/\]\([^)]*$/g, " ");
}

export function tidyStatValue(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[，、]/g, ",")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,{2,}/g, ",")
    .replace(/;{2,}/g, ";")
    .replace(/\s+/g, " ")
    .replace(/^[:\s;,-]+/, "")
    .replace(/[;,\s]+$/, "")
    .trim();
}

function titleCaseWords(value) {
  return String(value)
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase())
    .join(" ");
}

function signedModifier(value) {
  const match = tidyStatValue(value).match(/^([+-]?)(\d+)/);
  if (!match) return tidyStatValue(value);
  return `${match[1] || "+"}${match[2]}`;
}

function acNumber(value) {
  const match = tidyStatValue(value).match(/^\d+/);
  return match ? match[0] : tidyStatValue(value);
}

function joinLabeledModifiers(rows) {
  return rows.map((row) => `${row.label} ${signedModifier(row.value)}`.trim()).join(", ");
}

function likelyFieldStart(label, value) {
  const rest = String(value ?? "").trim();
  if (!rest) return false;
  if (label === "Creature") return /^\d+\b/i.test(rest);
  if (["Perception", "Str", "Dex", "Con", "Int", "Wis", "Cha", "Fort", "Ref", "Will"].includes(label)) return /^[+\-−]?\d+\b/.test(rest);
  if (label === "AC" || label === "HP") return /^\d+\b/.test(rest);
  if (label === "Speed") return /^(?:\d+\b|land\b|fly\b|swim\b|burrow\b|climb\b)/i.test(rest);
  if (["Languages", "Skills", "Immunities", "Weaknesses", "Resistances", "Items"].includes(label)) return /^[A-Za-z]/.test(rest);
  return true;
}

function stripLeadingName(text, name) {
  if (!name) return text;
  const lowerText = text.toLocaleLowerCase();
  const lowerName = name.toLocaleLowerCase();
  return lowerText.startsWith(lowerName) ? text.slice(name.length).trim() : text;
}

export function splitCreatureHeader(value) {
  let rest = tidyStatValue(value);
  const typeParts = [];

  const namedLevel = rest.match(/^creature\s+(\d+)\b/i);
  const bareLevel = rest.match(/^(\d+)\b/);
  if (namedLevel) {
    typeParts.push(`Creature ${namedLevel[1]}`);
    rest = rest.slice(namedLevel[0].length).trim();
  } else if (bareLevel) {
    typeParts.push(`Creature ${bareLevel[1]}`);
    rest = rest.slice(bareLevel[0].length).trim();
  }

  const traits = [];
  while (rest) {
    const bracket = rest.match(/^\[([^\][]+)\]\s*/);
    if (bracket) {
      traits.push(titleCaseWords(bracket[1]));
      rest = rest.slice(bracket[0].length).trimStart();
      continue;
    }
    const word = rest.match(/^([A-Za-z][A-Za-z0-9'-]*)(?=\s|$|,)/);
    if (!word || /^(the|a|an|of|and)$/i.test(word[1])) break;
    traits.push(titleCaseWords(word[1]));
    rest = rest.slice(word[0].length).replace(/^,/, "").trimStart();
  }

  return {
    type: tidyStatValue([...typeParts, ...traits].join(", ")),
    flavor: tidyStatValue(rest),
  };
}

function withCreatureHeader(rows, intro) {
  const creatureRow = rows.find((row) => row.label === "Creature");
  const headerSource = tidyStatValue([intro, creatureRow?.value].filter(Boolean).join(" "));
  const withoutCreature = rows.filter((row) => row.label !== "Creature" && row.label !== "Type");
  const { type, flavor } = splitCreatureHeader(headerSource);
  const headed = [];
  if (type) headed.push({ label: "Type", value: type });
  if (flavor) headed.push({ label: "Flavor", value: flavor });
  return [...headed, ...withoutCreature];
}

export function pf2eStatRows(text, name) {
  if (/^#{1,3}\s+.*\bCreature\s+[-+]?\d+\b/im.test(String(text ?? ""))) {
    return statCardRowsFromModel(rawMdStatCardModel(text, name));
  }
  const trimmed = stripLeadingName(cleanStatText(text), name);
  if (!trimmed) return [];

  const labelPattern = new RegExp(`\\b(${STAT_LABELS.join("|")})\\b`, "g");
  const matches = [...trimmed.matchAll(labelPattern)].filter((match, index, allMatches) => {
    if (match[1] === "Creature" && !(index === 0 || match.index === 0 || /\s/.test(trimmed[match.index - 1] ?? ""))) return false;
    const next = allMatches[index + 1];
    const candidate = trimmed.slice((match.index ?? 0) + match[1].length, next?.index ?? trimmed.length);
    return likelyFieldStart(match[1], candidate);
  });

  if (!matches.length) {
    const { type, flavor } = splitCreatureHeader(trimmed);
    if (type || flavor) {
      return [
        type ? { label: "Type", value: type } : null,
        flavor ? { label: "Flavor", value: flavor } : null,
      ].filter(Boolean);
    }
    return [{ label: "Notes", value: trimmed }];
  }

  const intro = tidyStatValue(trimmed.slice(0, matches[0].index));
  const rows = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const label = match[1];
    const start = match.index + label.length;
    const end = next?.index ?? trimmed.length;
    const value = tidyStatValue(trimmed.slice(start, end));
    if (value) rows.push({ label, value });
  }

  return expandActionRows(combineAbilityAndSaveRows(withCreatureHeader(rows, intro))).map((row) => ({
    ...row,
    value: tidyStatValue(row.value),
  }));
}

function expandActionRows(rows) {
  const expanded = [];
  for (const row of rows) {
    if (!ACTION_LABELS.has(row.label)) {
      expanded.push(row);
      continue;
    }
    const parts = splitActionBlocks(row.value);
    parts.forEach((value, index) => {
      expanded.push({ label: index === 0 ? row.label : "", value: tidyStatValue(value) });
    });
  }
  return expanded;
}

function combineAbilityAndSaveRows(rows) {
  const combined = [];
  let abilities = [];
  let saves = [];
  let ac = null;

  function flushAbilities() {
    if (abilities.length) {
      combined.push({ label: "Abilities", value: joinLabeledModifiers(abilities) });
      abilities = [];
    }
  }

  function flushDefense() {
    const saveLine = saves.length ? joinLabeledModifiers(saves) : "";
    if (ac && saveLine) {
      combined.push({ label: "AC", value: `${acNumber(ac.value)}; ${saveLine}` });
    } else if (ac) {
      combined.push({ label: "AC", value: acNumber(ac.value) });
    } else if (saveLine) {
      combined.push({ label: "AC", value: saveLine });
    }
    ac = null;
    saves = [];
  }

  for (const row of rows) {
    if (ABILITY_LABELS.has(row.label)) {
      flushDefense();
      abilities.push(row);
      continue;
    }
    if (row.label === "AC") {
      flushAbilities();
      flushDefense();
      ac = row;
      continue;
    }
    if (SAVE_LABELS.has(row.label)) {
      flushAbilities();
      saves.push(row);
      continue;
    }
    flushAbilities();
    flushDefense();
    combined.push(row);
  }

  flushAbilities();
  flushDefense();
  return combined;
}

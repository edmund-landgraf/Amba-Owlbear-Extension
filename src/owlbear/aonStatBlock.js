const AON_ORIGIN = "https://2e.aonprd.com";

export function aonMonsterUrl(path) {
  if (!path) return `${AON_ORIGIN}/Creatures.aspx`;
  return path.startsWith("http") ? path : `${AON_ORIGIN}${path}`;
}

export function stripAonMarkup(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[_*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function signed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number >= 0 ? `+${number}` : String(number);
}

function eliteHpDelta(level) {
  if (level <= 2) return 10;
  if (level <= 5) return 15;
  if (level <= 20) return 20;
  return 30;
}

function adjustHpRaw(hpRaw, delta) {
  const text = String(hpRaw ?? "");
  const match = text.match(/(\d+)/);
  if (!match) return text;
  const next = Number(match[1]) + delta;
  return text.replace(match[1], String(next));
}

function adjustSkillMarkdown(skills, delta) {
  return String(skills ?? "").replace(/([+-]\d+)/g, (token) => signed(Number(token) + delta));
}

export function pickAonCreatureHit(hits, query) {
  const needle = String(query ?? "").toLocaleLowerCase();
  const ranked = [...(hits ?? [])].sort((left, right) => {
    const a = left?._source ?? {};
    const b = right?._source ?? {};
    const score = (source) => {
      let value = 0;
      if (String(source.name ?? "").toLocaleLowerCase() === needle) value += 10;
      if (source.legacy_id && !source.remaster_id) value += 5;
      if (source.remaster_id) value -= 5;
      return value;
    };
    return score(b) - score(a);
  });
  return ranked[0] ?? null;
}

export function applyPf2eVariant(source, variant) {
  if (variant !== "elite" && variant !== "weak") return { ...source, variant: null };

  const direction = variant === "elite" ? 1 : -1;
  const level = Number(source.level) || 0;
  const delta = 2 * direction;
  const hpDelta = eliteHpDelta(level) * direction;

  return {
    ...source,
    variant,
    level: level + direction,
    ac: (Number(source.ac) || 0) + delta,
    perception: (Number(source.perception) || 0) + delta,
    fortitude_save: (Number(source.fortitude_save) || 0) + delta,
    reflex_save: (Number(source.reflex_save) || 0) + delta,
    will_save: (Number(source.will_save) || 0) + delta,
    hp_raw: adjustHpRaw(source.hp_raw, hpDelta),
    skill_markdown: adjustSkillMarkdown(source.skill_markdown, delta),
    combatDelta: delta,
  };
}

function extraCombatText(text, delta = 0) {
  const cleaned = stripAonMarkup(text);
  const start = cleaned.search(/\b(Melee|Ranged|Speed)\b/i);
  if (start < 0) return "";
  const fromCombat = cleaned.slice(start).replace(/^Speed\b[^]*?(?=\bMelee\b|\bRanged\b|\bSpells\b|$)/i, "").trim();
  if (!fromCombat || !delta) return fromCombat;
  return fromCombat
    .replace(/DC\s+(\d+)/gi, (_, value) => `DC ${Number(value) + delta}`)
    .replace(/([+-]\d+)/g, (token) => signed(Number(token) + delta));
}

export function formatAonStatBlock(source, variant = null) {
  const adjusted = applyPf2eVariant(source, variant);
  const size = firstValue(adjusted.size);
  const traits = (adjusted.trait_raw ?? []).join(" ");
  const languages = stripAonMarkup(adjusted.language_markdown);
  const skills = stripAonMarkup(adjusted.skill_markdown);
  const immunities = stripAonMarkup(adjusted.immunity_markdown);
  const resistances = stripAonMarkup(adjusted.resistance_markdown);
  const weaknesses = stripAonMarkup(adjusted.weakness_markdown);
  const speed = stripAonMarkup(firstValue(adjusted.speed_markdown) ?? firstValue(adjusted.speed_raw));
  const senses = stripAonMarkup(adjusted.sense_markdown ?? adjusted.vision);
  const extra = extraCombatText(source.text, adjusted.combatDelta ?? 0);

  const lines = [
    `Creature ${adjusted.level ?? ""} ${size ?? ""} ${traits}`.replace(/\s+/g, " ").trim(),
    `Perception ${signed(adjusted.perception)}${senses ? `; ${senses}` : ""}`,
    languages ? `Languages ${languages}` : "",
    skills ? `Skills ${skills}` : "",
    `Str ${signed(adjusted.strength)} Dex ${signed(adjusted.dexterity)} Con ${signed(adjusted.constitution)} Int ${signed(adjusted.intelligence)} Wis ${signed(adjusted.wisdom)} Cha ${signed(adjusted.charisma)}`,
    `AC ${adjusted.ac} Fort ${signed(adjusted.fortitude_save)} Ref ${signed(adjusted.reflex_save)} Will ${signed(adjusted.will_save)}`,
    `HP ${stripAonMarkup(adjusted.hp_raw)}`,
    immunities ? `Immunities ${immunities}` : "",
    resistances ? `Resistances ${resistances}` : "",
    weaknesses ? `Weaknesses ${weaknesses}` : "",
    speed ? `Speed ${speed}` : "",
    extra,
  ];

  return lines.filter(Boolean).join(" ");
}

export function creatureFromAonHit(hit, variant = null) {
  const source = hit?._source;
  if (!source?.name) return null;
  const adjusted = applyPf2eVariant(source, variant);
  return {
    name: source.name,
    variant: adjusted.variant,
    level: adjusted.level,
    size: firstValue(adjusted.size),
    source: firstValue(adjusted.source_raw ?? adjusted.primary_source_raw),
    sourceUrl: aonMonsterUrl(source.url),
    statBlock: formatAonStatBlock(source, variant),
  };
}

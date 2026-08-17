import { creatureFromAonHit, pickAonCreatureHit } from "./aonStatBlock.js";

const AON_SEARCH_URL = "https://elasticsearch.aonprd.com/aon/_search";
const LOOKUP_TIMEOUT_MS = 3000;
const AON_SOURCE_FIELDS = [
  "name",
  "url",
  "level",
  "size",
  "trait_raw",
  "hp_raw",
  "ac",
  "perception",
  "fortitude_save",
  "reflex_save",
  "will_save",
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "language_markdown",
  "skill_markdown",
  "immunity_markdown",
  "resistance_markdown",
  "weakness_markdown",
  "speed_markdown",
  "speed_raw",
  "sense_markdown",
  "vision",
  "source_raw",
  "primary_source_raw",
  "text",
  "legacy_id",
  "remaster_id",
];

const cache = new Map();

export function encounterRuleset(encounter, block) {
  const value = String(block?.ruleset ?? encounter?.ruleset ?? block?.source ?? encounter?.source ?? "").toLocaleLowerCase();
  if (!value || /aon|pf2e|2e|pathfinder/.test(value)) return "pf2e";
  return value;
}

async function lookupPf2eCreature(query, variant = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(AON_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        size: 8,
        query: {
          bool: {
            must: [{ term: { category: "creature" } }, { match: { name: query } }],
          },
        },
        _source: AON_SOURCE_FIELDS,
      }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const hit = pickAonCreatureHit(data?.hits?.hits ?? [], query);
    return creatureFromAonHit(hit, variant);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const helpers = {
  pf2e: lookupPf2eCreature,
};

export async function lookupCreatureName({ query, ruleset = "pf2e", variant = null }) {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) return null;

  const key = `${ruleset}|${normalizedQuery.toLocaleLowerCase()}|${variant ?? "normal"}`;
  if (cache.has(key)) return cache.get(key);

  const helper = helpers[ruleset];
  const result = helper ? await helper(normalizedQuery, variant) : null;
  cache.set(key, result);
  return result;
}

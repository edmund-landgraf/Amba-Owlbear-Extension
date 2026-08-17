import { aonCreatureIdFromPath, creatureFromAonHit, pickAonCreatureHit } from "./aonStatBlock.js";

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

async function searchAonCreatures(esQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(AON_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        size: 8,
        query: esQuery,
        _source: AON_SOURCE_FIELDS,
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.hits?.hits ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function pickAonCreatureByPath(hits, path) {
  const needle = String(path ?? "").toLocaleLowerCase();
  const exact = (hits ?? []).find((hit) => String(hit?._source?.url ?? "").toLocaleLowerCase() === needle);
  return exact ?? hits?.[0] ?? null;
}

async function lookupPf2eCreatureByPath(path, variant = null) {
  const id = aonCreatureIdFromPath(path);
  const should = [{ match_phrase: { url: path } }];
  if (Number.isFinite(id)) {
    should.push({ term: { legacy_id: id } }, { term: { remaster_id: id } });
  }

  const hits = await searchAonCreatures({
    bool: {
      must: [{ term: { category: "creature" } }],
      should,
      minimum_should_match: 1,
    },
  });
  return creatureFromAonHit(pickAonCreatureByPath(hits, path), variant);
}

async function lookupPf2eCreature(query, variant = null) {
  const hits = await searchAonCreatures({
    bool: {
      must: [{ term: { category: "creature" } }, { match: { name: query } }],
    },
  });
  return creatureFromAonHit(pickAonCreatureHit(hits, query), variant);
}

const helpers = {
  pf2e: lookupPf2eCreature,
};

export async function lookupCreatureName({ query, aonPath = null, ruleset = "pf2e", variant = null }) {
  const path = String(aonPath ?? "").trim();
  const normalizedQuery = String(query ?? "").trim();
  if (!path && !normalizedQuery) return null;

  const key = path
    ? `${ruleset}|url:${path.toLocaleLowerCase()}|${variant ?? "normal"}`
    : `${ruleset}|${normalizedQuery.toLocaleLowerCase()}|${variant ?? "normal"}`;
  if (cache.has(key)) return cache.get(key);

  const helper = helpers[ruleset];
  let result = null;
  if (path) {
    result = await lookupPf2eCreatureByPath(path, variant);
  } else if (helper) {
    result = await helper(normalizedQuery, variant);
  }
  cache.set(key, result);
  return result;
}

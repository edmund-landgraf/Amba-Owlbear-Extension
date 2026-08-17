import { aonCreatureIdFromPath, creatureFromAonHit, pickAonCreatureHit } from "./aonStatBlock.js";

const AON_SEARCH_URL = "https://elasticsearch.aonprd.com/aon/_search";
const LOCAL_PF2_API_BASE_URL = (import.meta.env.VITE_PF2_API_BASE_URL ?? "http://localhost:3333").replace(/\/+$/, "");
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

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchAonCreatures(esQuery) {
  const data = await fetchJsonWithTimeout(AON_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: 8,
      query: esQuery,
      _source: AON_SOURCE_FIELDS,
    }),
  });
  return data?.hits?.hits ?? [];
}

function pickAonCreatureByPath(hits, path) {
  const needle = String(path ?? "").toLocaleLowerCase();
  const exact = (hits ?? []).find((hit) => String(hit?._source?.url ?? "").toLocaleLowerCase() === needle);
  return exact ?? hits?.[0] ?? null;
}

function aonIdFromLookupResult(result) {
  return aonCreatureIdFromPath(result?.sourceUrl);
}

function localImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value, `${LOCAL_PF2_API_BASE_URL}/`).href;
  } catch {
    return null;
  }
}

function localMonsterRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.monsters)) return data.monsters;
  return [];
}

function localMonsterAonId(row) {
  const value = row?.AonId ?? row?.aonId ?? row?.aon_id ?? row?.legacy_id ?? row?.legacyId;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function pickLocalMonster(rows, name, aonId) {
  const lowerName = String(name ?? "").trim().toLocaleLowerCase();
  const exact = rows.filter((row) => String(row?.Name ?? row?.name ?? "").trim().toLocaleLowerCase() === lowerName);
  if (Number.isFinite(aonId)) {
    return exact.find((row) => localMonsterAonId(row) === aonId) ?? rows.find((row) => localMonsterAonId(row) === aonId) ?? exact[0] ?? null;
  }
  return exact[0] ?? rows[0] ?? null;
}

async function lookupLocalMonsterImage(name, aonId = null) {
  const query = String(name ?? "").trim();
  if (!query) return null;

  const params = new URLSearchParams({ name: query, limit: "8" });
  const data = await fetchJsonWithTimeout(`${LOCAL_PF2_API_BASE_URL}/api/monsters?${params}`);
  const row = pickLocalMonster(localMonsterRows(data), query, aonId);
  return localImageUrl(row?.ImageUrl ?? row?.imageUrl ?? row?.image_url ?? row?.RawJson?.image ?? row?.rawJson?.image);
}

async function withLocalMonsterArt(result, fallbackName = "") {
  if (!result) return result;
  const imageUrl = await lookupLocalMonsterImage(result.name || fallbackName, aonIdFromLookupResult(result));
  return imageUrl ? { ...result, imageUrl } : result;
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
  const result = creatureFromAonHit(pickAonCreatureByPath(hits, path), variant);
  return withLocalMonsterArt(result);
}

async function lookupPf2eCreature(query, variant = null) {
  const hits = await searchAonCreatures({
    bool: {
      must: [{ term: { category: "creature" } }, { match: { name: query } }],
    },
  });
  const result = creatureFromAonHit(pickAonCreatureHit(hits, query), variant);
  return withLocalMonsterArt(result, query);
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

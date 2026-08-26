import { aonCreatureIdFromPath, aonMonsterUrl, creatureFromAonHit, pickAonCreatureHit } from "./aonStatBlock.js";
import { browserFetchableArtUrl } from "./imageUtils.js";

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

export function clearCreatureLookupCache() {
  cache.clear();
}

export function encounterRuleset(encounter, block) {
  const value = String(block?.ruleset ?? encounter?.ruleset ?? "").trim().toLocaleLowerCase();
  if (/5e|dnd|dungeons/.test(value)) return value;
  return "pf2e";
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = String(url).startsWith(LOCAL_PF2_API_BASE_URL) ? 15000 : LOOKUP_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const credentials = String(url).startsWith(LOCAL_PF2_API_BASE_URL) ? "include" : options.credentials;

  try {
    const response = await fetch(url, { ...options, credentials, signal: controller.signal });
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
  const userExact = exact.find((row) => userMonsterIdFromRow(row));
  if (userExact) return userExact;
  if (Number.isFinite(aonId)) {
    return exact.find((row) => localMonsterAonId(row) === aonId) ?? rows.find((row) => localMonsterAonId(row) === aonId) ?? exact[0] ?? null;
  }
  return exact[0] ?? rows[0] ?? null;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function userMonsterIdFromRow(row) {
  return positiveId(row?.UserMonsterId ?? row?.userMonsterId);
}

export function artUrlFromLocalRow(row) {
  if (!row) return null;
  const userId = userMonsterIdFromRow(row);
  if (userId) return `${LOCAL_PF2_API_BASE_URL}/api/user-monsters/${userId}/image`;
  const rawImage = row?.ImageUrl ?? row?.imageUrl ?? row?.image_url ?? row?.RawJson?.image ?? row?.rawJson?.image;
  if (rawImage) return browserFetchableArtUrl(localImageUrl(rawImage));
  return null;
}

export function sourceUrlFromLocalRow(row) {
  if (!row) return null;
  const raw = String(row.AonUrl ?? row.aonUrl ?? row.aon_url ?? "").trim();
  if (/aonprd\.com/i.test(raw)) return raw.startsWith("http") ? raw : aonMonsterUrl(raw);
  const aonId = localMonsterAonId(row);
  if (aonId) return aonMonsterUrl(`/Monsters.aspx?ID=${aonId}`);
  return null;
}

async function lookupLocalMonsterRow(name, aonId = null) {
  const query = String(name ?? "").trim();
  if (!query) return null;

  const params = new URLSearchParams({ name: query, limit: "8" });
  const data = await fetchJsonWithTimeout(`${LOCAL_PF2_API_BASE_URL}/api/monsters?${params}`);
  return pickLocalMonster(localMonsterRows(data), query, aonId);
}

async function withLocalMonsterArt(result, fallbackName = "") {
  const names = [...new Set([fallbackName, result?.name].filter((name) => String(name ?? "").trim()))];
  if (!names.length) return result;

  const aonId = aonIdFromLookupResult(result);
  let merged = result;
  for (const lookupName of names) {
    const row = await lookupLocalMonsterRow(lookupName, aonId);
    if (!row) continue;
    const imageUrl = merged?.imageUrl || artUrlFromLocalRow(row);
    const sourceUrl = merged?.sourceUrl || sourceUrlFromLocalRow(row);
    if (!imageUrl && !sourceUrl) continue;
    merged = {
      ...(merged ?? { name: lookupName }),
      ...(imageUrl ? { imageUrl } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
    if (imageUrl && sourceUrl) return merged;
  }

  return merged;
}

async function lookupPf2eCreatureByPath(path, variant = null, fallbackName = "") {
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
  return withLocalMonsterArt(result, fallbackName);
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
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (cached?.imageUrl && cached?.sourceUrl) return cached;
    const withArt = await withLocalMonsterArt(cached, normalizedQuery);
    cache.set(key, withArt);
    return withArt;
  }

  const helper = helpers[ruleset] ?? helpers.pf2e;
  let result = null;
  if (path) {
    result = await lookupPf2eCreatureByPath(path, variant, normalizedQuery);
  } else if (helper) {
    result = await helper(normalizedQuery, variant);
  }
  if (!result?.imageUrl) {
    result = await withLocalMonsterArt(result, normalizedQuery);
  }
  cache.set(key, result);
  return result;
}

import { getMonsterTokenImageUrl, toAmbaUrl } from "../amba/ambaApi.js";
import { monsterTokenSvgUrl } from "./tokenSvg.js";

export const TOKEN_COLORS = [
  "#7c3aed",
  "#45c7d8",
  "#78f05b",
  "#ffd23c",
  "#d46bef",
  "#ff4e4e",
  "#ff7a2f",
  "#2d6aef",
];

function asAbsoluteUrl(value) {
  if (typeof value !== "string" || !value) return null;
  return /^https?:\/\//i.test(value) ? value : toAmbaUrl(value);
}

function firstUrl(...values) {
  for (const value of values) {
    const url = asAbsoluteUrl(value);
    if (url) return url;
  }
  return null;
}

export function encounterTitle(encounter) {
  return encounter.title ?? encounter.name ?? "AMBA Encounter";
}

export function encounterId(encounter) {
  return encounter.id ?? encounter.encounterId ?? encounter.slug ?? encounterTitle(encounter);
}

export function mapUrl(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  return firstUrl(
    map?.url,
    map?.imageUrl,
    map?.src,
    map?.payload?.url,
    encounter.mapUrl,
    encounter.mapImageUrl,
    encounter.imageUrl
  );
}

export function mapDpi(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  const value =
    map?.grid?.cellSize ??
    map?.payload?.grid?.cellSize ??
    map?.dpi ??
    encounter.mapDpi ??
    encounter.grid?.cellSize;
  const dpi = Number.parseInt(value, 10);
  return Number.isFinite(dpi) && dpi > 0 ? dpi : undefined;
}

export function monsterBlocks(encounter) {
  const blocks =
    encounter.monsterBlocks ??
    encounter.monsters ??
    encounter.npcs ??
    encounter.creatures ??
    [];
  return Array.isArray(blocks) ? blocks : [];
}

export function monsterName(block) {
  return block.name ?? block.title ?? block.npc?.name ?? block.monster?.name ?? "Monster";
}

export function monsterId(block) {
  return block.id ?? block.npcId ?? block.monsterId ?? block.npc?.id ?? block.monster?.id;
}

export function monsterCount(block) {
  const value = block.count ?? block.quantity ?? block.number ?? block.instances?.length ?? 1;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function appendTokenOptions(url, options) {
  if (!options?.label && !options?.fontSize) return url;

  const next = new URL(url);
  if (options.label) next.searchParams.set("label", options.label);
  if (options.fontSize) next.searchParams.set("fontSize", String(options.fontSize));
  return next.href;
}

export function monsterTokenUrl(moduleId, block, color, options = {}) {
  const explicit = firstUrl(
    block.tokenUrl,
    block.tokenSvgUrl,
    block.imageUrl,
    block.portraitUrl,
    block.npc?.tokenUrl,
    block.npc?.tokenSvgUrl,
    block.npc?.imageUrl,
    block.monster?.tokenUrl,
    block.monster?.tokenSvgUrl,
    block.monster?.imageUrl
  );
  if (explicit) return appendTokenOptions(explicit, options);

  const id = monsterId(block);
  if (block.useAmbaTokenEndpoint && id) return getMonsterTokenImageUrl(moduleId, id, color, options);

  return monsterTokenSvgUrl({
    label: options.label,
    name: monsterName(block),
    color,
    fontSize: options.fontSize,
  });
}

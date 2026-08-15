import { getMonsterTokenImageUrl, toAmbaUrl } from "../amba/ambaApi.js";

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

export function monsterTokenUrl(moduleId, block, color) {
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
  if (explicit) return explicit;

  const id = monsterId(block);
  return id ? getMonsterTokenImageUrl(moduleId, id, color) : null;
}

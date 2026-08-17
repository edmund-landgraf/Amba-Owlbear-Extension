import { getMonsterTokenImageUrl, toAmbaUrl } from "../amba/ambaApi.js";
import { monsterIdentity, monsterRawTitle } from "./creatureIdentity.js";
import { monsterTokenSvgUrl } from "./tokenSvg.js";

export { monsterAonPath, monsterIdentity, monsterRawTitle, parseCreatureIdentity } from "./creatureIdentity.js";

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
  const artifact = mapArtifact(encounter);
  return firstUrl(
    map?.url,
    map?.imageUrl,
    map?.src,
    map?.payload?.url,
    map?.payload?.imageUrl,
    artifact?.payload?.url,
    artifact?.payload?.imageUrl,
    encounter.mapUrl,
    encounter.mapImageUrl,
    encounter.imageUrl
  );
}

export function mapSourceId(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  return map?.id ?? map?.artifactId ?? map?.payload?.id ?? mapUrl(encounter);
}

export function mapDpi(encounter) {
  const grid = encounterMapGrid(encounter);
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  const value =
    grid?.cellSize ??
    grid?.dpi ??
    grid?.gridSize ??
    grid?.pixelsPerSquare ??
    map?.dpi ??
    encounter.mapDpi;
  const dpi = Number.parseFloat(value);
  return Number.isFinite(dpi) && dpi > 0 ? dpi : undefined;
}

function artifactTypeKey(artifact) {
  return artifact?.artifactType?.key ?? artifact?.artifactTypeKey ?? artifact?.type;
}

function mapArtifact(encounter) {
  return (encounter?.artifacts ?? []).find((artifact) => artifactTypeKey(artifact) === "map") ?? null;
}

export function encounterMapGrid(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  const artifact = mapArtifact(encounter);
  const payload = map?.payload ?? artifact?.payload ?? {};
  const candidates = [
    map?.grid,
    payload.grid,
    encounter.grid,
    encounter.metadata?.map?.grid,
    encounter.metadata?.grid,
    payload,
    map,
    artifact?.payload,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const cellSize =
        candidate.cellSize ??
        candidate.dpi ??
        candidate.gridSize ??
        candidate.pixelsPerSquare ??
        candidate.squareSize;
      const columns = candidate.columns ?? candidate.cols ?? candidate.squaresWide ?? candidate.gridWidth;
      const rows = candidate.rows ?? candidate.squaresHigh ?? candidate.gridHeight;
      const scale = candidate.scale ?? candidate.gridScale;
      const offset = candidate.offset ?? candidate.gridOffset;
      if (
        cellSize != null ||
        columns != null ||
        rows != null ||
        offset != null ||
        candidate.offsetX != null ||
        candidate.originX != null
      ) {
        return {
          ...candidate,
          cellSize: cellSize ?? candidate.cellSize,
          columns: columns ?? candidate.columns,
          rows: rows ?? candidate.rows,
          scale: scale ?? candidate.scale,
          offset: offset ?? candidate.offset,
          width: candidate.width ?? payload.width ?? map?.width,
          height: candidate.height ?? payload.height ?? map?.height,
        };
      }
    }
  }
  return null;
}

export function encounterPlacements(encounter) {
  const raw =
    encounter.owlbearPlacements ??
    encounter.placements ??
    encounter.metadata?.owlbearPlacements ??
    encounter.metadata?.placements;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.placements)) return raw.placements;
  return [];
}

export function savedMapPlacement(encounter) {
  return (
    encounterPlacements(encounter).find(
      (placement) => placement?.kind === "encounter-map" || placement?.kind === "map"
    ) ?? null
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
  return monsterIdentity(block).name;
}

export function monsterId(block) {
  return block.id ?? block.npcId ?? block.monsterId ?? block.npc?.id ?? block.monster?.id;
}

export function monsterSourceId(block) {
  return (
    block.artifactId ??
    block.sourceId ??
    block.id ??
    block.npcId ??
    block.monsterId ??
    block.npc?.id ??
    block.monster?.id ??
    monsterName(block)
  );
}

export function monsterCount(block) {
  return monsterIdentity(block).count;
}

export function monsterStatBlock(block) {
  return (
    block.resolvedStatBlock ??
    block.statBlock ??
    block.content ??
    block.description ??
    block.payload?.statBlock ??
    block.payload?.content ??
    block.npc?.statBlock ??
    block.monster?.statBlock ??
    ""
  );
}

function keyPathIncludes(path, pattern) {
  return path.some((key) => pattern.test(key));
}

function looksLikeImageUrl(url) {
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)|\/image|\/images|\/uploads|\/assets/i.test(String(url ?? ""));
}

function collectUrlByKey(value, acceptsPath, path = [], seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return acceptsPath(path, value) ? asAbsoluteUrl(value) : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = collectUrlByKey(entry, acceptsPath, path, seen);
      if (found) return found;
    }
    return null;
  }

  const role = String(value.role ?? value.type ?? value.kind ?? value.name ?? value.label ?? "").toLocaleLowerCase();
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key.toLocaleLowerCase()];
    const found = collectUrlByKey(entry, (candidatePath, url) => acceptsPath(candidatePath, url, role), nextPath, seen);
    if (found) return found;
  }
  return null;
}

function isMonsterArtPath(path, url, role = "") {
  if (keyPathIncludes(path, /token|map|sheet|note|source|aon|stat/i)) return false;
  if (/token|map|sheet|note|source|aon|stat/.test(role)) return false;
  return (
    keyPathIncludes(path, /monsterart|artwork|portrait|image|thumbnail|hero|picture|asset|url/i) ||
    /art|portrait|monster|creature|npc|image|thumbnail/.test(role)
  ) && looksLikeImageUrl(url);
}

function isTokenArtPath(path, url, role = "") {
  if (keyPathIncludes(path, /map|sheet|note|source|aon|stat/i)) return false;
  if (/map|sheet|note|source|aon|stat/.test(role)) return false;
  return (
    keyPathIncludes(path, /tokenart|tokensvg|tokenimage|tokenurl|token/i) ||
    /token/.test(role)
  ) && looksLikeImageUrl(url);
}

export function monsterArtUrl(block) {
  return firstUrl(
    block.resolvedImageUrl,
    block.ImageUrl,
    block.imageUrl,
    block.monsterArtUrl,
    block.artUrl,
    block.artworkUrl,
    block.portraitUrl,
    block.payload?.resolvedImageUrl,
    block.payload?.ImageUrl,
    block.payload?.imageUrl,
    block.payload?.monsterArtUrl,
    block.payload?.artUrl,
    block.payload?.artworkUrl,
    block.payload?.portraitUrl,
    block.npc?.resolvedImageUrl,
    block.npc?.ImageUrl,
    block.npc?.imageUrl,
    block.npc?.monsterArtUrl,
    block.npc?.artUrl,
    block.npc?.artworkUrl,
    block.npc?.portraitUrl,
    block.monster?.resolvedImageUrl,
    block.monster?.ImageUrl,
    block.monster?.imageUrl,
    block.monster?.monsterArtUrl,
    block.monster?.artUrl,
    block.monster?.artworkUrl,
    block.monster?.portraitUrl
  );
}

export function monsterTokenArtUrl(block) {
  return firstUrl(
    block.TokenArtUrl,
    block.TokenUrl,
    block.TokenSvgUrl,
    block.tokenArtUrl,
    block.tokenUrl,
    block.tokenSvgUrl,
    block.payload?.TokenArtUrl,
    block.payload?.TokenUrl,
    block.payload?.TokenSvgUrl,
    block.payload?.tokenArtUrl,
    block.payload?.tokenUrl,
    block.payload?.tokenSvgUrl,
    block.npc?.TokenArtUrl,
    block.npc?.TokenUrl,
    block.npc?.TokenSvgUrl,
    block.npc?.tokenArtUrl,
    block.npc?.tokenUrl,
    block.npc?.tokenSvgUrl,
    block.monster?.TokenArtUrl,
    block.monster?.TokenUrl,
    block.monster?.TokenSvgUrl,
    block.monster?.tokenArtUrl,
    block.monster?.tokenUrl,
    block.monster?.tokenSvgUrl
  );
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

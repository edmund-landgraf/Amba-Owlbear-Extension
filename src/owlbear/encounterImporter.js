import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { getMonsterTokenImageUrl, toAmbaUrl } from "../amba/ambaApi.js";
import {
  fetchImageBlob,
  imageInfoFromUrl,
  imageSizeFromBlob,
  rasterizeSvgFile,
  safeName,
} from "./imageUtils.js";
import {
  belowBounds,
  boundsFromImageInfo,
  getSceneBoundsForLayers,
  gridPosition,
  NS,
} from "./layout.js";

const TOKEN_COLORS = [
  "#7c3aed",
  "#45c7d8",
  "#78f05b",
  "#ffd23c",
  "#d46bef",
  "#ff4e4e",
  "#ff7a2f",
  "#2d6aef",
];

async function addItemsToCurrentScene(items) {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("No Owlbear scene is currently open. Open or create a blank scene, then import again.");
  }
  await OBR.scene.items.addItems(items);
}

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

function encounterTitle(encounter) {
  return encounter.title ?? encounter.name ?? "AMBA Encounter";
}

function encounterId(encounter) {
  return encounter.id ?? encounter.encounterId ?? encounter.slug ?? encounterTitle(encounter);
}

function mapUrl(encounter) {
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

function monsterBlocks(encounter) {
  const blocks =
    encounter.monsterBlocks ??
    encounter.monsters ??
    encounter.npcs ??
    encounter.creatures ??
    [];
  return Array.isArray(blocks) ? blocks : [];
}

function monsterName(block) {
  return block.name ?? block.title ?? block.npc?.name ?? block.monster?.name ?? "Monster";
}

function monsterId(block) {
  return block.id ?? block.npcId ?? block.monsterId ?? block.npc?.id ?? block.monster?.id;
}

function monsterCount(block) {
  const value = block.count ?? block.quantity ?? block.number ?? block.instances?.length ?? 1;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function monsterTokenUrl(moduleId, block, color) {
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

async function rasterizedTokenInfo(url, filename) {
  const svgFile = await fetchImageBlob(url, `${filename}.svg`);
  if (!/svg/i.test(svgFile.type) && !/\.svg($|\?)/i.test(url)) {
    const size = await imageSizeFromBlob(svgFile, filename);
    return {
      image: { ...size, url, mime: svgFile.type || "image/png" },
      grid: { dpi: Math.max(size.width, size.height), offset: { x: size.width / 2, y: size.height / 2 } },
    };
  }

  const pngFile = await rasterizeSvgFile(svgFile, `${filename}.png`, 512, 512);
  const objectUrl = URL.createObjectURL(pngFile);
  return {
    image: { width: 512, height: 512, url: objectUrl, mime: "image/png" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

async function buildMapItem({ moduleId, encounter, position }) {
  const url = mapUrl(encounter);
  if (!url) return null;

  const info = await imageInfoFromUrl(url, `${safeName(encounterTitle(encounter), "encounter")}-map`);
  const item = buildImage(info.image, info.grid)
    .name(`${encounterTitle(encounter)} Map`)
    .description(`AMBA encounter map for ${encounterTitle(encounter)}`)
    .layer("MAP")
    .position(position)
    .locked(true)
    .metadata({
      [`${NS}/moduleId`]: moduleId,
      [`${NS}/encounterId`]: encounterId(encounter),
      [`${NS}/kind`]: "encounter-map",
    })
    .build();

  return { item, bounds: boundsFromImageInfo(info, position) };
}

async function buildMonsterTokenItems({ moduleId, encounter, origin }) {
  const items = [];
  const blocks = monsterBlocks(encounter);

  for (const [blockIndex, block] of blocks.entries()) {
    const color = TOKEN_COLORS[blockIndex % TOKEN_COLORS.length];
    const url = monsterTokenUrl(moduleId, block, color);
    if (!url) continue;

    const name = monsterName(block);
    const count = monsterCount(block);
    const token = await rasterizedTokenInfo(url, safeName(name, "monster-token"));

    for (let copy = 0; copy < count; copy += 1) {
      const position = gridPosition(items.length, {
        startX: origin.x + 256,
        startY: origin.y + 256,
        columns: 8,
        gapX: 620,
        gapY: 620,
      });
      items.push(
        buildImage(token.image, token.grid)
          .name(count > 1 ? `${name} ${copy + 1}` : name)
          .description(`AMBA monster token for ${name}`)
          .plainText(name)
          .layer("CHARACTER")
          .position(position)
          .metadata({
            [`${NS}/moduleId`]: moduleId,
            [`${NS}/encounterId`]: encounterId(encounter),
            [`${NS}/monsterId`]: monsterId(block) ?? "",
            [`${NS}/kind`]: "monster-token",
          })
          .build()
      );
    }
  }

  return items;
}

export async function addEncounterToCurrentScene({ moduleId, encounter }) {
  const items = [];
  const mapPosition = { x: 600, y: 600 };
  const map = await buildMapItem({ moduleId, encounter, position: mapPosition });
  if (map) items.push(map.item);

  const existingMapBounds = map ? map.bounds : await getSceneBoundsForLayers(["MAP"]);
  const monsterOrigin = belowBounds(existingMapBounds, 600);
  const monsterItems = await buildMonsterTokenItems({ moduleId, encounter, origin: monsterOrigin });
  items.push(...monsterItems);

  if (!items.length) {
    throw new Error("This encounter did not include a map or monster tokens AMBA can export yet.");
  }

  await addItemsToCurrentScene(items);
  return {
    mapImported: Boolean(map),
    monsterTokensImported: monsterItems.length,
  };
}

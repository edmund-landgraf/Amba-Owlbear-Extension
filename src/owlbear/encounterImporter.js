import { buildImage } from "@owlbear-rodeo/sdk";
import { imageInfoFromUrl, safeName } from "./imageUtils.js";
import { addItemsToCurrentScene } from "./sceneItems.js";
import {
  encounterId,
  encounterTitle,
  mapUrl,
  monsterBlocks,
  monsterCount,
  monsterId,
  monsterName,
  monsterTokenUrl,
  TOKEN_COLORS,
} from "./encounterData.js";
import {
  belowBounds,
  boundsFromImageInfo,
  getSceneBoundsForLayers,
  gridPosition,
  NS,
} from "./layout.js";
import { rasterizedTokenInfo } from "./tokenImage.js";

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

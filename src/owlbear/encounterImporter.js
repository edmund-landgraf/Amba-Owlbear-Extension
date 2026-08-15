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
  combineBounds,
  getSceneBoundsForLayers,
  gridPosition,
  imagePositionRightOfBounds,
  NS,
} from "./layout.js";
import { rasterizedTokenInfo } from "./tokenImage.js";
import { labelBaseForBlocks, labelFontSize, numberedLabel } from "./monsterLabels.js";

async function buildMapItem({ moduleId, encounter, occupiedBounds }) {
  const url = mapUrl(encounter);
  if (!url) return null;

  const info = await imageInfoFromUrl(url, `${safeName(encounterTitle(encounter), "encounter")}-map`);
  const position = imagePositionRightOfBounds(occupiedBounds, info, 1000);
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
  const labelBases = labelBaseForBlocks(blocks, monsterName);

  for (const [blockIndex, block] of blocks.entries()) {
    const color = TOKEN_COLORS[blockIndex % TOKEN_COLORS.length];
    const name = monsterName(block);
    const count = monsterCount(block);
    const labelBase = labelBases[blockIndex];

    for (let copy = 0; copy < count; copy += 1) {
      const label = numberedLabel(labelBase, copy);
      const url = monsterTokenUrl(moduleId, block, color, {
        label,
        fontSize: labelFontSize(label),
      });
      if (!url) continue;

      const token = await rasterizedTokenInfo(url, safeName(`${name}-${label}`, "monster-token"));
      const position = gridPosition(items.length, {
        startX: origin.x + 256,
        startY: origin.y + 256,
        columns: 8,
        gapX: 620,
        gapY: 620,
      });
      items.push(
        buildImage(token.image, token.grid)
          .name(`${label} ${name}`)
          .description(`AMBA monster token for ${name}`)
          .plainText(label)
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
  const occupiedBounds = await getSceneBoundsForLayers(["MAP", "CHARACTER"]);
  const map = await buildMapItem({ moduleId, encounter, occupiedBounds });
  if (map) items.push(map.item);

  const stagingBounds = combineBounds(occupiedBounds, map?.bounds);
  const monsterOrigin = belowBounds(stagingBounds, 600);
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

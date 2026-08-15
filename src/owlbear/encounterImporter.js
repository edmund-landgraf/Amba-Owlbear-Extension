import { buildImage, buildShape, buildText } from "@owlbear-rodeo/sdk";
import { imageInfoFromUrl, safeName } from "./imageUtils.js";
import { addItemsToCurrentScene } from "./sceneItems.js";
import {
  encounterId,
  encounterTitle,
  mapDpi,
  mapSourceId,
  mapUrl,
  monsterBlocks,
  monsterCount,
  monsterId,
  monsterName,
  monsterSourceId,
  monsterStatBlock,
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
import {
  encounterItemMetadata,
  findImportedItem,
  getImportedEncounterItems,
  saveEncounterSceneMetadata,
} from "./encounterMetadata.js";

function statBlockRichText(block) {
  const text = monsterStatBlock(block);
  const lines = [
    monsterName(block),
    block.level ? `Level ${block.level}` : "",
    block.source ? `Source: ${block.source}` : "",
    text,
  ].filter(Boolean);
  return lines.map((line) => ({
    type: "paragraph",
    children: [{ text: String(line).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }],
  }));
}

async function buildMapItem({ moduleId, encounter, occupiedBounds, importedItems }) {
  const url = mapUrl(encounter);
  if (!url) return null;

  const sourceId = mapSourceId(encounter);
  if (findImportedItem(importedItems, { kind: "encounter-map", sourceId })) {
    return { skipped: true };
  }

  const info = await imageInfoFromUrl(
    url,
    `${safeName(encounterTitle(encounter), "encounter")}-map`,
    "image/png",
    mapDpi(encounter)
  );
  const position = imagePositionRightOfBounds(occupiedBounds, info, 1000);
  const item = buildImage(info.image, info.grid)
    .name(`${encounterTitle(encounter)} Map`)
    .description(`AMBA encounter map for ${encounterTitle(encounter)}`)
    .layer("MAP")
    .position(position)
    .locked(true)
    .metadata({
      ...encounterItemMetadata({
        moduleId,
        encounterId: encounterId(encounter),
        kind: "encounter-map",
        sourceId,
      }),
    })
    .build();

  return { item, bounds: boundsFromImageInfo(info, position) };
}

async function buildMonsterTokenItems({ moduleId, encounter, origin, importedItems }) {
  const items = [];
  let skipped = 0;
  const blocks = monsterBlocks(encounter);
  const labelBases = labelBaseForBlocks(blocks, monsterName);

  for (const [blockIndex, block] of blocks.entries()) {
    const color = TOKEN_COLORS[blockIndex % TOKEN_COLORS.length];
    const name = monsterName(block);
    const count = monsterCount(block);
    const labelBase = labelBases[blockIndex];

    for (let copy = 0; copy < count; copy += 1) {
      const label = numberedLabel(labelBase, copy);
      const sourceId = monsterSourceId(block);
      const tokenInstanceId = `${safeName(sourceId, "monster")}-${copy + 1}`;
      if (findImportedItem(importedItems, { kind: "monster-token", tokenInstanceId })) {
        skipped += 1;
        continue;
      }

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
            ...encounterItemMetadata({
              moduleId,
              encounterId: encounterId(encounter),
              kind: "monster-token",
              sourceId,
              monsterId: monsterId(block) ?? "",
              tokenInstanceId,
            }),
          })
          .build()
      );
    }
  }

  return { items, skipped };
}

function buildMonsterStatCardItems({ moduleId, encounter, origin, importedItems }) {
  const items = [];
  const blocks = monsterBlocks(encounter);

  for (const [index, block] of blocks.entries()) {
    const text = monsterStatBlock(block);
    if (!text) continue;

    const sourceId = monsterSourceId(block);
    if (findImportedItem(importedItems, { kind: "monster-stat-card", sourceId })) continue;

    const position = gridPosition(index, {
      startX: origin.x + 360,
      startY: origin.y + 260,
      columns: 2,
      gapX: 900,
      gapY: 520,
    });
    const metadata = encounterItemMetadata({
      moduleId,
      encounterId: encounterId(encounter),
      kind: "monster-stat-card",
      sourceId,
      monsterId: monsterId(block) ?? "",
    });

    items.push(
      buildShape()
        .name(`${monsterName(block)} Stat Card`)
        .description(`AMBA monster stat block for ${monsterName(block)}`)
        .shapeType("RECTANGLE")
        .width(760)
        .height(420)
        .fillColor("#f7f2e8")
        .fillOpacity(1)
        .strokeColor("#4a4036")
        .strokeOpacity(1)
        .strokeWidth(6)
        .layer("NOTE")
        .position(position)
        .metadata(metadata)
        .build(),
      buildText()
        .name(`${monsterName(block)} Stat Text`)
        .description(`AMBA monster stat text for ${monsterName(block)}`)
        .richText(statBlockRichText(block))
        .width(680)
        .height("AUTO")
        .padding(0)
        .fontSize(24)
        .fillColor("#251f1a")
        .layer("NOTE")
        .position(position)
        .zIndex(1)
        .metadata({ ...metadata, [`${NS}/kind`]: "monster-stat-card-text" })
        .build()
    );
  }

  return items;
}

export async function addEncounterToCurrentScene({ moduleId, encounter, options = {} }) {
  const importOptions = {
    importMap: true,
    importMonsterTokens: true,
    importStatCards: true,
    ...options,
  };
  const items = [];
  const id = encounterId(encounter);
  const importedItems = await getImportedEncounterItems(moduleId, id);
  const occupiedBounds = await getSceneBoundsForLayers(["MAP", "CHARACTER"]);
  const map = importOptions.importMap
    ? await buildMapItem({ moduleId, encounter, occupiedBounds, importedItems })
    : null;
  if (map?.item) items.push(map.item);

  const stagingBounds = combineBounds(occupiedBounds, map?.bounds);
  const monsterOrigin = belowBounds(stagingBounds, 600);
  const monsterResult = importOptions.importMonsterTokens
    ? await buildMonsterTokenItems({
        moduleId,
        encounter,
        origin: monsterOrigin,
        importedItems,
      })
    : { items: [], skipped: 0 };
  items.push(...monsterResult.items);

  const cardOrigin = belowBounds(combineBounds(stagingBounds, { min: monsterOrigin, max: monsterOrigin }), 1200);
  const statCardItems = importOptions.importStatCards
    ? buildMonsterStatCardItems({
        moduleId,
        encounter,
        origin: cardOrigin,
        importedItems,
      })
    : [];
  items.push(...statCardItems);

  if (!items.length && !importedItems.length) {
    throw new Error("This encounter did not include a map or monster tokens AMBA can export yet.");
  }

  if (items.length) await addItemsToCurrentScene(items);
  await saveEncounterSceneMetadata({ moduleId, encounterId: id, title: encounterTitle(encounter) });
  return {
    mapImported: Boolean(map?.item),
    mapSkipped: Boolean(map?.skipped),
    monsterTokensImported: monsterResult.items.length,
    monsterTokensSkipped: monsterResult.skipped,
    statCardsImported: statCardItems.length,
  };
}

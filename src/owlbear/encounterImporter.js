import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { browserFetchableArtUrl, fetchImageBlob, imageInfoFromUrl, safeName, scaleImageToFit } from "./imageUtils.js";
import { publishTokenPng } from "./tokenHost.js";
import { rasterizedMonsterArtTokenFile, rasterizedMonsterTokenFile } from "./tokenImage.js";
import { renderStatCardSvgFile } from "./statCardImage.js";
import { cleanStatText, pf2eStatRows } from "./statCardRows.js";
import { apiStatCardModel, rawMdStatCardModel, statCardRowsFromModel } from "./statCardModel.js";
import { inferMapGrid } from "./mapGridInference.js";
import { addItemsToCurrentScene, deleteItemsFromCurrentScene, moveItemsInCurrentScene, unlockAmbaStatCardsInCurrentScene, unlockItemsInCurrentScene } from "./sceneItems.js";
import { currentOwlbearSceneId, requireOpenScene } from "./sceneService.js";
import {
  encounterId,
  encounterMapGrid,
  encounterTitle,
  mapDpi,
  mapSourceId,
  mapUrl,
  savedMapPlacement,
  savedTokenPlacement,
  monsterBlocks,
  monsterCount,
  monsterArtUrl,
  monsterTokenArtUrl,
  monsterId,
  monsterIdentity,
  monsterName,
  monsterRawTitle,
  monsterSourceId,
  monsterStatBlock,
} from "./encounterData.js";
import { buildTokenFills, contrastingGlyphColors } from "./tokenColors.js";
import { aonMonsterUrl } from "./aonStatBlock.js";
import { monsterSourceUrl } from "./creatureIdentity.js";
import { encounterRuleset, lookupCreatureName } from "./creatureLookup.js";
import {
  boundsFromCenteredSize,
  boundsFromImageInfo,
  clusterOriginForMap,
  combineBounds,
  getItemListBounds,
  lastPlacementFromBounds,
  monsterColumnOrigin,
} from "./layout.js";
import { nextClusterOrigin, recordCluster, seedClusterFromBounds } from "./placementTable.js";
import { labelBaseForBlocks, numberedLabel } from "./monsterLabels.js";
import {
  encounterItemMetadata,
  findImportedItem,
  getAmbaOwnedItems,
  getImportedEncounterItems,
  saveEncounterSceneMetadata,
} from "./encounterMetadata.js";

function variantLabel(variant) {
  if (variant === "elite") return "Elite";
  if (variant === "weak") return "Weak";
  return "Normal";
}

function monsterItemDescription(kind, name, block) {
  const summary = kind === "token" ? `AMBA monster token for ${name}` : `AMBA monster stat block for ${name}`;
  const sourceUrl = String(block?.sourceUrl ?? monsterSourceUrl(block) ?? "").trim();
  return sourceUrl ? `${summary}\n${sourceUrl}` : summary;
}

function isNoiseTypeRow(value) {
  return /party level|target moderate|composition|\bx\s*\d+\b/i.test(value);
}

function statCardContent(block, { name, count, variant } = {}) {
  const displayName = name ?? monsterName(block);
  const quantity = count ?? monsterCount(block);
  const rawStatBlock = monsterStatBlock(block);
  const model = block?.statCardMonster
    ? apiStatCardModel(block.statCardMonster)
    : rawMdStatCardModel(rawStatBlock, displayName);
  const rows = (model.rows.length ? statCardRowsFromModel(model) : pf2eStatRows(rawStatBlock, displayName)).filter(
    (row) => row.label !== "Type" || !isNoiseTypeRow(row.value)
  );
  const meta = [block.level ? `Level ${block.level}` : "", block.source ? `Source: ${block.source}` : "", block.sourceUrl ?? ""]
    .filter(Boolean)
    .join("  |  ");
  return {
    header: `${quantity}x    ${variantLabel(variant ?? block.resolvedVariant)}`,
    name: displayName,
    meta,
    rows,
  };
}

function monsterTypeKey(block) {
  const identity = monsterIdentity(block);
  return [
    monsterId(block) ?? "",
    identity.variant ?? "",
    identity.name.toLocaleLowerCase(),
    cleanStatText(monsterStatBlock(block)).toLocaleLowerCase(),
  ].join("|");
}

function monsterSize(block) {
  const metadata = block.metadata ?? block.payload?.metadata ?? {};
  const directSize = block.size ?? block.creatureSize ?? metadata.size ?? metadata.creatureSize;
  const sizeText = typeof directSize === "string" ? directSize : cleanStatText(monsterStatBlock(block));
  const match = sizeText.match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  return match ? match[1].toLocaleLowerCase() : "medium";
}

function pf2eSpaceMultiplier(size) {
  switch (size) {
    case "tiny":
      return 0.5;
    case "large":
      return 2;
    case "huge":
      return 3;
    case "gargantuan":
      return 4;
    case "small":
    case "medium":
    default:
      return 1;
  }
}

function monsterTypeGroups(encounter) {
  const groups = new Map();

  for (const block of monsterBlocks(encounter)) {
    const key = monsterTypeKey(block);
    const existing = groups.get(key);
    if (existing) {
      existing.count += monsterCount(block);
      continue;
    }

    groups.set(key, {
      key,
      block,
      count: monsterCount(block),
      sourceId: monsterId(block) ?? monsterSourceId(block) ?? key,
    });
  }

  return [...groups.values()];
}

const STAT_CARD_WIDTH = 1040;
const STAT_CARD_HEIGHT = 1040;

async function monsterTokenImage(label, name, color, cells, artUrl, glyphColors) {
  let png = null;
  let artToken = false;
  if (artUrl) {
    png = await rasterizedMonsterArtTokenFile({ artUrl, name: safeName(name, "monster") }).catch(() => null);
    artToken = Boolean(png);
  }
  if (!png) {
    png = await rasterizedMonsterTokenFile({
      label,
      name,
      color,
      textFill: glyphColors?.fill,
      textStroke: glyphColors?.stroke,
    });
  }
  const url = await publishTokenPng(png);
  return {
    image: { width: 512, height: 512, url, mime: "image/png" },
    grid: { dpi: Math.round(512 / Math.max(cells, 0.5)), offset: { x: 256, y: 256 } },
    artToken,
  };
}

async function applySceneGridFromAmba(grid) {
  const scale = grid?.scale ?? grid?.gridScale ?? "5 ft";
  try {
    if (typeof OBR.scene.grid.setType === "function") {
      await OBR.scene.grid.setType("SQUARE");
    }
    if (typeof OBR.scene.grid.setScale === "function") {
      await OBR.scene.grid.setScale(scale);
    }
  } catch {
    // Some rooms or roles cannot mutate the scene grid.
  }
}

async function mapPositionForGrid(visualCenter, imageSize, grid) {
  const sceneDpi = await sceneGridDpi();
  const cellSize = grid?.cellSize;
  const offset = grid?.offset ?? { x: imageSize.width / 2, y: imageSize.height / 2 };
  if (!cellSize) return snapScenePosition(visualCenter);

  const worldPerPixel = sceneDpi / cellSize;
  const position = {
    x: visualCenter.x + (offset.x - imageSize.width / 2) * worldPerPixel,
    y: visualCenter.y + (offset.y - imageSize.height / 2) * worldPerPixel,
  };
  return snapScenePosition(position);
}

async function snapScenePosition(position) {
  try {
    if (typeof OBR.scene.grid.snapPosition === "function") {
      return await OBR.scene.grid.snapPosition(position);
    }
  } catch {
    // Keep the computed position if snapping is unavailable.
  }
  return position;
}

async function sceneGridDpi() {
  try {
    const dpi = await OBR.scene.grid.getDpi();
    return Number.isFinite(dpi) && dpi > 0 ? dpi : 150;
  } catch {
    return 150;
  }
}

async function applyMapGridToItem(itemId, inferredGrid) {
  if (!itemId || !inferredGrid?.cellSize) return;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      item.grid = {
        dpi: inferredGrid.cellSize,
        offset: inferredGrid.offset ?? item.grid?.offset ?? { x: 0, y: 0 },
      };
      item.scale = { x: 1, y: 1 };
      item.locked = inferredGrid.source === "metadata" || inferredGrid.source === "inferred";
    }
  });
}

async function buildMapItem({ moduleId, encounter, clusterOrigin, importedItems }) {
  const url = mapUrl(encounter);
  if (!url) return null;

  const sourceId = mapSourceId(encounter);
  const existing = findImportedItem(importedItems, { kind: "encounter-map", sourceId });

  const info = await imageInfoFromUrl(
    url,
    `${safeName(encounterTitle(encounter), "encounter")}-map`,
    "image/png",
    mapDpi(encounter)
  );
  const inferredGrid = await inferMapGrid(info, encounterMapGrid(encounter));
  if (inferredGrid) {
    info.grid.dpi = inferredGrid.cellSize;
    if (inferredGrid.offset) info.grid.offset = inferredGrid.offset;
    await applySceneGridFromAmba(inferredGrid);
  }
  const warnings = inferredGrid?.warnings ?? [];

  if (existing) {
    await unlockItemsInCurrentScene([existing.id]);
    await applyMapGridToItem(existing.id, inferredGrid);
    const visualCenter = existing.position ?? { x: 0, y: 0 };
    const snapped = await mapPositionForGrid(visualCenter, info.image, inferredGrid);
    await moveItemsInCurrentScene([{ id: existing.id, position: snapped }]);
    return {
      updated: true,
      bounds: boundsFromImageInfo(info, visualCenter),
      warnings,
    };
  }

  const saved = savedMapPlacement(encounter);
  const mapImage = { ...info.image };
  const stagedPosition = clusterOriginForMap(clusterOrigin, info);
  const position = saved?.position
    ? saved.position
    : await mapPositionForGrid(stagedPosition, info.image, inferredGrid);
  const rotation = Number.isFinite(saved?.rotation) ? saved.rotation : 0;
  const builder = buildImage(mapImage, info.grid)
    .name(`${encounterTitle(encounter)} Map`)
    .description(`AMBA encounter map for ${encounterTitle(encounter)}`)
    .layer("MAP")
    .position(position)
    .rotation(rotation)
    .locked(inferredGrid?.source === "metadata" || inferredGrid?.source === "inferred");
  const item = builder
    .metadata({
      ...encounterItemMetadata({
        moduleId,
        encounterId: encounterId(encounter),
        kind: "encounter-map",
        sourceId,
      }),
    })
    .build();

  return { item, bounds: boundsFromImageInfo(info, position), warnings };
}

async function resolveMonsterGroups(encounter, onStatus = () => {}) {
  const groups = monsterTypeGroups(encounter);
  onStatus(`Resolving ${groups.length} monster type${groups.length === 1 ? "" : "s"}...`);
  await Promise.all(
    groups.map(async (group) => {
      if (group.block?.resolvedStatBlock) {
        const displayName = group.block.resolvedName || monsterName(group.block) || "Monster";
        group.displayName = displayName;
        group.variant = group.block.resolvedVariant ?? "normal";
        group.block.resolvedVariant = group.variant;
        return;
      }
      const identity = monsterIdentity(group.block);
      const looked = await lookupCreatureName({
        aonPath: identity.aonPath,
        query: identity.candidateName || monsterRawTitle(group.block),
        ruleset: encounterRuleset(encounter, group.block),
        variant: identity.variant,
      });
      const displayName = looked?.name || identity.name || "Monster";
      group.block.resolvedName = displayName;
      if (looked?.statBlock) group.block.resolvedStatBlock = looked.statBlock;
      if (looked?.level != null) group.block.level = looked.level;
      if (looked?.source) group.block.source = looked.source;
      if (looked?.size) group.block.size = looked.size;
      const demiplaneUrl = identity.sourceUrl && /demiplane\.com/i.test(identity.sourceUrl) ? identity.sourceUrl : null;
      if (demiplaneUrl) group.block.sourceUrl = demiplaneUrl;
      else if (looked?.sourceUrl) group.block.sourceUrl = looked.sourceUrl;
      else if (identity.aonPath) group.block.sourceUrl = aonMonsterUrl(identity.aonPath);
      else if (identity.sourceUrl) group.block.sourceUrl = identity.sourceUrl;
      if (group.block.sourceUrl) {
        const host = /demiplane\.com/i.test(group.block.sourceUrl) ? "Demiplane" : "AoN";
        onStatus(`${host} link for ${displayName}: ${group.block.sourceUrl}`);
      } else {
        onStatus(`No source link for ${displayName}.`);
      }
      if (looked?.imageUrl) {
        const usable = browserFetchableArtUrl(looked.imageUrl);
        if (usable) {
          group.block.resolvedImageUrl = usable;
          onStatus(`Found monster art candidate for ${displayName} (${new URL(usable).origin}).`);
        } else {
          onStatus(`Skipping non-fetchable art host for ${displayName}.`);
        }
      } else {
        onStatus(`Local PF2 art lookup returned no URL for ${displayName}.`);
      }
      group.displayName = displayName;
      group.variant = identity.variant ?? "normal";
      group.block.resolvedVariant = group.variant;
    })
  );
  return groups;
}


async function monsterArtFile(artUrl, name, onStatus = () => {}) {
  if (!artUrl) {
    onStatus(`No monster art candidate for ${name}.`);
    return null;
  }
  try {
    onStatus(`Fetching monster art for ${name} from ${(() => { try { return new URL(artUrl).origin; } catch { return "invalid-url"; } })()}...`);
    let file = /\.svg($|\?)/i.test(String(artUrl))
      ? await rasterizedMonsterArtTokenFile({ artUrl, name: safeName(name, "monster") })
      : await fetchImageBlob(artUrl, `${safeName(name, "monster")}-art`);
    file = await scaleImageToFit(file, 840, 630, `${safeName(name, "monster")}-art`);
    onStatus(`Monster art loaded for ${name}.`);
    return file;
  } catch (error) {
    let origin = "";
    try {
      origin = new URL(artUrl, window.location.origin).origin;
    } catch {
      origin = String(artUrl).slice(0, 80);
    }
    onStatus(`Monster art failed for ${name}: ${error instanceof Error ? error.message : String(error)} (${origin})`);
    return null;
  }
}

async function pushStatCardItem({
  items,
  moduleId,
  encounter,
  block,
  name,
  count,
  variant,
  sourceId,
  position,
  gridDpi,
  tokenLabel,
  tokenColor,
  glyphColors,
  artUrl,
  onStatus = () => {},
}) {
  const content = statCardContent(block, { name, count, variant });
  const tokenFile = tokenLabel
    ? await rasterizedMonsterTokenFile({
        label: tokenLabel,
        name,
        color: tokenColor,
        textFill: glyphColors?.fill,
        textStroke: glyphColors?.stroke,
      })
    : null;
  const artFile = await monsterArtFile(artUrl, name, onStatus);
  onStatus(`Rendering ${name} stat card SVG...`);
  const file = await renderStatCardSvgFile({ ...content, tokenFile, artFile });
  const cardWidth = file.statCardWidth ?? STAT_CARD_WIDTH;
  const cardHeight = file.statCardHeight ?? STAT_CARD_HEIGHT;
  const url = await publishTokenPng(file);
  items.push(
    buildImage(
      { width: cardWidth, height: cardHeight, url, mime: "image/svg+xml" },
      { dpi: gridDpi, offset: { x: cardWidth / 2, y: cardHeight / 2 } }
    )
      .name(`${name} Stat Card`)
      .description(monsterItemDescription("stat-card", name, block))
      .plainText("")
      .textFillOpacity(0)
      .layer("NOTE")
      .position(position)
      .metadata(
        encounterItemMetadata({
          moduleId,
          encounterId: encounterId(encounter),
          kind: "monster-stat-card",
          sourceId,
          monsterId: monsterId(block) ?? "",
        })
      )
      .build()
  );
}

function applySavedTransform(builder, saved) {
  if (Number.isFinite(saved?.rotation)) builder.rotation(saved.rotation);
  if (saved?.scale && Number.isFinite(saved.scale.x) && Number.isFinite(saved.scale.y)) {
    builder.scale(saved.scale);
  }
  return builder;
}

async function buildMonsterStagingItems({
  moduleId,
  encounter,
  origin,
  importedItems,
  importTokens,
  importStatCards,
  includeMonsterArt,
  makeTokenArt,
  randomizeTokenColors,
  onStatus = () => {},
}) {
  const items = [];
  const itemBatches = [];
  const idsToReplace = [];
  const tokenMoves = [];
  const placedBounds = [];
  let tokenSkipped = 0;
  let tokenImported = 0;
  let cardsImported = 0;
  const groups = await resolveMonsterGroups(encounter, onStatus);
  const tokenFills = buildTokenFills(groups.length, { randomize: randomizeTokenColors });
  const labelBases = labelBaseForBlocks(groups, (group) => group.displayName);
  const gridDpi = Math.min(Math.max(await sceneGridDpi(), 80), 180);
  const tokenGap = gridDpi * 0.25;
  let cursorY = origin.y;

  for (const [groupIndex, group] of groups.entries()) {
    const groupItems = [];
    const block = group.block;
    const color = tokenFills[groupIndex];
    const glyphColors = randomizeTokenColors ? contrastingGlyphColors(color) : null;
    const name = group.displayName;
    const cardArtUrl = browserFetchableArtUrl(monsterArtUrl(block));
    const tokenArtUrl = browserFetchableArtUrl(monsterTokenArtUrl(block));
    const labelBase = labelBases[groupIndex];
    const cells = pf2eSpaceMultiplier(monsterSize(block));
    const tokenSpan = Math.round(gridDpi * cells);
    const hasCard = importStatCards && Boolean(monsterStatBlock(block));
    const cardCenterX = origin.x + STAT_CARD_WIDTH / 2;
    const tokenRowWidth = group.count * tokenSpan + Math.max(0, group.count - 1) * tokenGap;
    const tokenRowStartX = (hasCard ? cardCenterX : origin.x + tokenRowWidth / 2) - tokenRowWidth / 2;
    const tokenCenterY = cursorY + tokenSpan / 2;
    const cardCenterY = cursorY + (importTokens ? tokenSpan + tokenGap : 0) + STAT_CARD_HEIGHT / 2;
    let stagedNewItems = false;

    if (importTokens) {
      for (let copy = 0; copy < group.count; copy += 1) {
        const label = numberedLabel(labelBase, copy, group.count);
        const sourceId = group.sourceId;
        const tokenInstanceId = `${safeName(sourceId, "monster")}-${copy + 1}`;
        const stagedPosition = {
          x: tokenRowStartX + copy * (tokenSpan + tokenGap) + tokenSpan / 2,
          y: tokenCenterY,
        };
        const existingToken = findImportedItem(importedItems, { kind: "monster-token", tokenInstanceId });
        if (existingToken?.id) {
          tokenMoves.push({
            id: existingToken.id,
            description: monsterItemDescription("token", name, block),
          });
          tokenSkipped += 1;
          continue;
        }
        const saved = savedTokenPlacement(encounter, tokenInstanceId);
        const position = saved?.position ?? stagedPosition;
        if (!saved?.position) stagedNewItems = true;
        const metadata = encounterItemMetadata({
          moduleId,
          encounterId: encounterId(encounter),
          kind: "monster-token",
          sourceId,
          monsterId: monsterId(block) ?? "",
          tokenInstanceId,
        });
        if (makeTokenArt && tokenArtUrl) onStatus(`Rendering token art for ${label} ${name}...`);
        if (makeTokenArt && !tokenArtUrl) onStatus(`No token art candidate for ${label} ${name}; using label token.`);
        const tokenImage = await monsterTokenImage(
          label,
          name,
          color,
          cells,
          makeTokenArt ? tokenArtUrl : null,
          glyphColors
        );
        if (makeTokenArt && tokenImage.artToken) onStatus(`Token art rendered for ${label} ${name}.`);
        if (makeTokenArt && tokenArtUrl && !tokenImage.artToken) onStatus(`Token art failed for ${label} ${name}; using label token.`);
        const useArtToken = tokenImage.artToken;
        const builder = buildImage(tokenImage.image, tokenImage.grid)
          .name(`${label} ${name}`)
          .description(monsterItemDescription("token", name, block))
          .plainText(useArtToken ? label : "")
          .layer("CHARACTER")
          .position(position)
          .metadata(metadata);
        applySavedTransform(builder, saved);
        if (!useArtToken) {
          builder.textFillOpacity(0).textStrokeOpacity(0);
        }
        const tokenItem = builder.build();
        if (saved?.scale && Number.isFinite(saved.scale.x) && Number.isFinite(saved.scale.y)) {
          tokenItem.scale = saved.scale;
        }
        groupItems.push(tokenItem);
        placedBounds.push(boundsFromCenteredSize(position, tokenSpan, tokenSpan));
        tokenImported += 1;
      }
    }

    if (hasCard) {
      const existingCard = findImportedItem(importedItems, { kind: "monster-stat-card", sourceId: group.sourceId });
      const existingText = findImportedItem(importedItems, { kind: "monster-stat-card-text", sourceId: group.sourceId });
      if (existingCard?.id) idsToReplace.push(existingCard.id);
      if (existingText?.id) idsToReplace.push(existingText.id);
      const cardPosition = existingCard?.position ?? { x: cardCenterX, y: cardCenterY };
      if (!existingCard?.position) stagedNewItems = true;
      await pushStatCardItem({
        items: groupItems,
        moduleId,
        encounter,
        block,
        name,
        count: group.count,
        variant: group.variant,
        sourceId: group.sourceId,
        position: cardPosition,
        gridDpi,
        tokenLabel: labelBase,
        tokenColor: color,
        glyphColors,
        artUrl: includeMonsterArt ? cardArtUrl : null,
        onStatus,
      });
      if (!existingCard?.position) {
        placedBounds.push(boundsFromCenteredSize(cardPosition, STAT_CARD_WIDTH, STAT_CARD_HEIGHT));
      }
      cardsImported += 1;
    }

    if (stagedNewItems) {
      if (hasCard) {
        cursorY = cardCenterY + STAT_CARD_HEIGHT / 2 + 60;
      } else if (importTokens) {
        cursorY = tokenCenterY + tokenSpan / 2 + gridDpi * 0.75;
      }
    }

    if (groupItems.length) {
      items.push(...groupItems);
      itemBatches.push(groupItems);
    }
  }

  return { items, itemBatches, idsToReplace, tokenMoves, tokenSkipped, tokenImported, cardsImported, placedBounds };
}

export async function addEncounterToCurrentScene({ moduleId, encounter, options = {}, onStatus = () => {} }) {
  onStatus("Checking Owlbear scene...");
  await requireOpenScene();
  const importOptions = {
    importMap: true,
    importMonsterTokens: true,
    importStatCards: true,
    includeMonsterArt: false,
    makeTokenArt: false,
    randomizeTokenColors: false,
    ...options,
  };
  const items = [];
  const id = encounterId(encounter);
  onStatus("Reading existing AMBA scene items...");
  const importedItems = await getImportedEncounterItems(moduleId, id);
  await unlockAmbaStatCardsInCurrentScene();
  const sceneId = await currentOwlbearSceneId();
  seedClusterFromBounds(sceneId, await getItemListBounds(await getAmbaOwnedItems()));
  const clusterOrigin = nextClusterOrigin(sceneId);
  if (importOptions.importMap) {
    onStatus("Preparing encounter map...");
    await applySceneGridFromAmba(encounterMapGrid(encounter));
  }
  const map = importOptions.importMap
    ? await buildMapItem({
        moduleId,
        encounter,
        clusterOrigin,
        importedItems,
      })
    : null;
  if (map?.item) items.push(map.item);

  const monsterOrigin = monsterColumnOrigin(
    map?.bounds ? { x: map.bounds.min.x, y: map.bounds.min.y } : clusterOrigin,
    map?.bounds
  );
  const monsterResult =
    importOptions.importMonsterTokens || importOptions.importStatCards
      ? await buildMonsterStagingItems({
          moduleId,
          encounter,
          origin: monsterOrigin,
          importedItems,
          importTokens: importOptions.importMonsterTokens,
          importStatCards: importOptions.importStatCards,
          includeMonsterArt: importOptions.includeMonsterArt,
          makeTokenArt: importOptions.makeTokenArt,
          randomizeTokenColors: importOptions.randomizeTokenColors,
          onStatus,
        })
      : { items: [], itemBatches: [], idsToReplace: [], tokenMoves: [], tokenSkipped: 0, tokenImported: 0, cardsImported: 0, placedBounds: [] };
  items.push(...monsterResult.items);

  if (!items.length && !importedItems.length) {
    throw new Error("This encounter did not include a map or monster tokens AMBA can export yet.");
  }

  onStatus("Updating stat cards and keeping existing token positions...");
  await deleteItemsFromCurrentScene(monsterResult.idsToReplace);
  await moveItemsInCurrentScene(monsterResult.tokenMoves);
  if (map?.item) {
    onStatus("Adding map to scene...");
    await addItemsToCurrentScene([map.item]);
  }
  for (const batch of monsterResult.itemBatches ?? []) {
    if (batch.length) {
      onStatus(`Adding ${batch.length} monster item${batch.length === 1 ? "" : "s"} to scene...`);
      await addItemsToCurrentScene(batch);
    }
  }
  onStatus("Saving scene metadata...");
  const clusterBounds = combineBounds(map?.item ? map.bounds : null, ...(monsterResult.placedBounds ?? []));
  if (clusterBounds) {
    recordCluster(sceneId, { encounterId: id, origin: clusterOrigin, bounds: clusterBounds });
  }
  const lastPlacement = lastPlacementFromBounds(clusterBounds ?? map?.bounds);
  await saveEncounterSceneMetadata({
    moduleId,
    encounterId: id,
    title: encounterTitle(encounter),
    lastPlacement,
  });
  return {
    mapImported: Boolean(map?.item) || Boolean(map?.updated),
    mapSkipped: Boolean(map?.skipped),
    mapWarnings: map?.warnings ?? [],
    monsterTokensImported: monsterResult.tokenImported,
    monsterTokensSkipped: monsterResult.tokenSkipped,
    statCardsImported: monsterResult.cardsImported,
  };
}

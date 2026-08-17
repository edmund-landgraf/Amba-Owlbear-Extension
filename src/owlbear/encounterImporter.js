import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { imageInfoFromUrl, safeName } from "./imageUtils.js";
import { publishTokenPng } from "./tokenHost.js";
import { rasterizedMonsterTokenFile } from "./tokenImage.js";
import { rasterizeStatCardPng } from "./statCardImage.js";
import { inferMapGrid } from "./mapGridInference.js";
import { addItemsToCurrentScene, deleteItemsFromCurrentScene, moveItemsInCurrentScene, unlockAmbaStatCardsInCurrentScene } from "./sceneItems.js";
import { requireOpenScene } from "./sceneService.js";
import {
  encounterId,
  encounterMapGrid,
  encounterTitle,
  mapDpi,
  mapSourceId,
  mapUrl,
  savedMapPlacement,
  monsterBlocks,
  monsterCount,
  monsterId,
  monsterIdentity,
  monsterName,
  monsterRawTitle,
  monsterSourceId,
  monsterStatBlock,
  TOKEN_COLORS,
} from "./encounterData.js";
import { encounterRuleset, lookupCreatureName } from "./creatureLookup.js";
import {
  belowBounds,
  boundsFromImageInfo,
  combineBounds,
  getSceneBoundsForLayers,
  imagePositionRightOfBounds,
  NS,
} from "./layout.js";
import { labelBaseForBlocks, numberedLabel } from "./monsterLabels.js";
import {
  encounterItemMetadata,
  findImportedItem,
  getImportedEncounterItems,
  saveEncounterSceneMetadata,
} from "./encounterMetadata.js";

function variantLabel(variant) {
  if (variant === "elite") return "Elite";
  if (variant === "weak") return "Weak";
  return "Normal";
}

function isNoiseTypeRow(value) {
  return /party level|target moderate|composition|\bx\s*\d+\b/i.test(value);
}

function statCardContent(block, { name, count, variant } = {}) {
  const displayName = name ?? monsterName(block);
  const quantity = count ?? monsterCount(block);
  const rawText = cleanStatText(monsterStatBlock(block));
  const rows = pf2eStatRows(rawText, displayName).filter(
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

function cleanStatText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingName(text, name) {
  if (!name) return text;
  const lowerText = text.toLocaleLowerCase();
  const lowerName = name.toLocaleLowerCase();
  return lowerText.startsWith(lowerName) ? text.slice(name.length).trim() : text;
}

function pf2eStatRows(text, name) {
  const trimmed = stripLeadingName(text, name);
  if (!trimmed) return [];

  const labels = [
    "Creature",
    "Perception",
    "Languages",
    "Skills",
    "Str",
    "Dex",
    "Con",
    "Int",
    "Wis",
    "Cha",
    "AC",
    "Fort",
    "Ref",
    "Will",
    "HP",
    "Immunities",
    "Weaknesses",
    "Resistances",
    "Speed",
    "Melee",
    "Ranged",
    "Spells",
    "Items",
  ];
  const labelPattern = new RegExp(`\\b(${labels.join("|")})\\b`, "g");
  const matches = [...trimmed.matchAll(labelPattern)].filter((match, index, all) => {
    if (match[1] !== "Creature") return true;
    return index === 0 || match.index === 0 || /\s/.test(trimmed[match.index - 1] ?? "");
  });

  if (!matches.length) {
    return [{ label: "Notes", value: trimmed }];
  }

  const rows = [];
  const intro = trimmed.slice(0, matches[0].index).trim();
  if (intro) rows.push({ label: "Type", value: intro });

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const label = match[1];
    const start = match.index + label.length;
    const end = next?.index ?? trimmed.length;
    const value = trimmed.slice(start, end).replace(/^[:\s;,-]+/, "").replace(/[;\s]+$/, "").trim();
    if (value) rows.push({ label, value });
  }

  return combineAbilityAndSaveRows(rows);
}

function combineAbilityAndSaveRows(rows) {
  const combined = [];
  const abilityLabels = new Set(["Str", "Dex", "Con", "Int", "Wis", "Cha"]);
  const saveLabels = new Set(["Fort", "Ref", "Will"]);
  let abilities = [];
  let saves = [];

  function flushAbilities() {
    if (abilities.length) {
      combined.push({ label: "Abilities", value: abilities.map((row) => `${row.label} ${row.value}`).join(", ") });
      abilities = [];
    }
  }

  function flushSaves() {
    if (saves.length) {
      combined.push({ label: "Saves", value: saves.map((row) => `${row.label} ${row.value}`).join(", ") });
      saves = [];
    }
  }

  for (const row of rows) {
    if (abilityLabels.has(row.label)) {
      flushSaves();
      abilities.push(row);
      continue;
    }
    if (saveLabels.has(row.label)) {
      flushAbilities();
      saves.push(row);
      continue;
    }
    flushAbilities();
    flushSaves();
    combined.push(row);
  }

  flushAbilities();
  flushSaves();
  return combined;
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
const STAT_CARD_HEIGHT = 760;

async function monsterTokenImage(label, name, color, cells) {
  const png = await rasterizedMonsterTokenFile({ label, name, color });
  const url = await publishTokenPng(png);
  return {
    image: { width: 512, height: 512, url, mime: "image/png" },
    grid: { dpi: Math.round(512 / Math.max(cells, 0.5)), offset: { x: 256, y: 256 } },
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

function itemScale(value) {
  if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
  if (Number.isFinite(value)) return { x: value, y: value };
  return null;
}

async function sceneGridDpi() {
  try {
    const dpi = await OBR.scene.grid.getDpi();
    return Number.isFinite(dpi) && dpi > 0 ? dpi : 150;
  } catch {
    return 150;
  }
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
  const inferredGrid = await inferMapGrid(info, encounterMapGrid(encounter));
  if (inferredGrid) {
    info.grid.dpi = inferredGrid.cellSize;
    if (inferredGrid.offset) info.grid.offset = inferredGrid.offset;
    await applySceneGridFromAmba(inferredGrid);
  }
  const warnings = inferredGrid?.warnings ?? [];
  const saved = savedMapPlacement(encounter);
  const mapImage = { ...info.image, url };
  const stagedPosition = imagePositionRightOfBounds(occupiedBounds, info, 1000);
  const position = saved?.position
    ? saved.position
    : await snapScenePosition(stagedPosition);
  const scale = itemScale(saved?.scale);
  const rotation = Number.isFinite(saved?.rotation) ? saved.rotation : 0;
  const builder = buildImage(mapImage, info.grid)
    .name(`${encounterTitle(encounter)} Map`)
    .description(`AMBA encounter map for ${encounterTitle(encounter)}`)
    .layer("MAP")
    .position(position)
    .rotation(rotation)
    .locked(inferredGrid?.source === "metadata");
  if (scale) builder.scale(scale);
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

async function resolveMonsterGroups(encounter) {
  const groups = monsterTypeGroups(encounter);
  await Promise.all(
    groups.map(async (group) => {
      const identity = monsterIdentity(group.block);
      const looked = await lookupCreatureName({
        aonPath: identity.aonPath,
        query: identity.aonPath ? "" : identity.candidateName || monsterRawTitle(group.block),
        ruleset: encounterRuleset(encounter, group.block),
        variant: identity.variant,
      });
      const displayName = looked?.name || identity.name || "Monster";
      group.block.resolvedName = displayName;
      if (looked?.statBlock) group.block.resolvedStatBlock = looked.statBlock;
      if (looked?.level != null) group.block.level = looked.level;
      if (looked?.source) group.block.source = looked.source;
      if (looked?.size) group.block.size = looked.size;
      if (looked?.sourceUrl) group.block.sourceUrl = looked.sourceUrl;
      group.displayName = displayName;
      group.variant = identity.variant ?? "normal";
      group.block.resolvedVariant = group.variant;
    })
  );
  return groups;
}


async function pushStatCardItem({ items, moduleId, encounter, block, name, count, variant, sourceId, position, gridDpi }) {
  const content = statCardContent(block, { name, count, variant });
  const file = await rasterizeStatCardPng(content);
  const url = await publishTokenPng(file);
  const dpi = gridDpi * 2;
  items.push(
    buildImage(
      { width: STAT_CARD_WIDTH * 2, height: STAT_CARD_HEIGHT * 2, url, mime: "image/png" },
      { dpi, offset: { x: STAT_CARD_WIDTH, y: STAT_CARD_HEIGHT } }
    )
      .name(`${name} Stat Card`)
      .description(`AMBA monster stat block for ${name}`)
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

async function buildMonsterStagingItems({
  moduleId,
  encounter,
  origin,
  importedItems,
  importTokens,
  importStatCards,
}) {
  const items = [];
  const itemBatches = [];
  const idsToReplace = [];
  const tokenMoves = [];
  let tokenSkipped = 0;
  let tokenImported = 0;
  let cardsImported = 0;
  const groups = await resolveMonsterGroups(encounter);
  const labelBases = labelBaseForBlocks(groups, (group) => group.displayName);
  const gridDpi = Math.min(Math.max(await sceneGridDpi(), 80), 180);
  const tokenGap = gridDpi * 0.25;
  let cursorY = origin.y;

  for (const [groupIndex, group] of groups.entries()) {
    const groupItems = [];
    const block = group.block;
    const color = TOKEN_COLORS[groupIndex % TOKEN_COLORS.length];
    const name = group.displayName;
    const labelBase = labelBases[groupIndex];
    const cells = pf2eSpaceMultiplier(monsterSize(block));
    const tokenSpan = Math.round(gridDpi * cells);
    const hasCard = importStatCards && Boolean(monsterStatBlock(block));
    const cardCenterX = origin.x + STAT_CARD_WIDTH / 2;
    const tokenRowWidth = group.count * tokenSpan + Math.max(0, group.count - 1) * tokenGap;
    const tokenRowStartX = (hasCard ? cardCenterX : origin.x + tokenRowWidth / 2) - tokenRowWidth / 2;
    const tokenCenterY = cursorY + tokenSpan / 2;
    const cardCenterY = cursorY + (importTokens ? tokenSpan + tokenGap : 0) + STAT_CARD_HEIGHT / 2;

    if (importTokens) {
      for (let copy = 0; copy < group.count; copy += 1) {
        const label = numberedLabel(labelBase, copy, group.count);
        const sourceId = group.sourceId;
        const tokenInstanceId = `${safeName(sourceId, "monster")}-${copy + 1}`;
        const position = {
          x: tokenRowStartX + copy * (tokenSpan + tokenGap) + tokenSpan / 2,
          y: tokenCenterY,
        };
        const existingToken = findImportedItem(importedItems, { kind: "monster-token", tokenInstanceId });
        if (existingToken?.id) {
          tokenMoves.push({ id: existingToken.id, position });
          tokenSkipped += 1;
          continue;
        }
        const metadata = encounterItemMetadata({
          moduleId,
          encounterId: encounterId(encounter),
          kind: "monster-token",
          sourceId,
          monsterId: monsterId(block) ?? "",
          tokenInstanceId,
        });
        const tokenImage = await monsterTokenImage(label, name, color, cells);
        groupItems.push(
          buildImage(tokenImage.image, tokenImage.grid)
            .name(`${label} ${name}`)
            .description(`AMBA monster token for ${name}`)
            .plainText("")
            .textFillOpacity(0)
            .textStrokeOpacity(0)
            .layer("CHARACTER")
            .position(position)
            .metadata(metadata)
            .build()
        );
        tokenImported += 1;
      }
    }

    if (hasCard) {
      const existingCard = findImportedItem(importedItems, { kind: "monster-stat-card", sourceId: group.sourceId });
      const existingText = findImportedItem(importedItems, { kind: "monster-stat-card-text", sourceId: group.sourceId });
      if (existingCard?.id) idsToReplace.push(existingCard.id);
      if (existingText?.id) idsToReplace.push(existingText.id);
      await pushStatCardItem({
        items: groupItems,
        moduleId,
        encounter,
        block,
        name,
        count: group.count,
        variant: group.variant,
        sourceId: group.sourceId,
        position: { x: cardCenterX, y: cardCenterY },
        gridDpi,
      });
      cardsImported += 1;
    }

    if (hasCard) {
      cursorY = cardCenterY + STAT_CARD_HEIGHT / 2 + 60;
    } else if (importTokens) {
      cursorY = tokenCenterY + tokenSpan / 2 + gridDpi * 0.75;
    }

    if (groupItems.length) {
      items.push(...groupItems);
      itemBatches.push(groupItems);
    }
  }

  return { items, itemBatches, idsToReplace, tokenMoves, tokenSkipped, tokenImported, cardsImported };
}

export async function addEncounterToCurrentScene({ moduleId, encounter, options = {} }) {
  await requireOpenScene();
  const importOptions = {
    importMap: true,
    importMonsterTokens: true,
    importStatCards: true,
    ...options,
  };
  const items = [];
  const id = encounterId(encounter);
  const importedItems = await getImportedEncounterItems(moduleId, id);
  await unlockAmbaStatCardsInCurrentScene();
  const mapLayerBounds = await getSceneBoundsForLayers(["MAP"]);
  if (importOptions.importMap) {
    await applySceneGridFromAmba(encounterMapGrid(encounter));
  }
  const map = importOptions.importMap
    ? await buildMapItem({
        moduleId,
        encounter,
        occupiedBounds: await getSceneBoundsForLayers(["MAP", "CHARACTER"]),
        importedItems,
      })
    : null;
  if (map?.item) items.push(map.item);

  const monsterOrigin = belowBounds(combineBounds(mapLayerBounds, map?.bounds), 400);
  const monsterResult =
    importOptions.importMonsterTokens || importOptions.importStatCards
      ? await buildMonsterStagingItems({
          moduleId,
          encounter,
          origin: monsterOrigin,
          importedItems,
          importTokens: importOptions.importMonsterTokens,
          importStatCards: importOptions.importStatCards,
        })
      : { items: [], itemBatches: [], idsToReplace: [], tokenMoves: [], tokenSkipped: 0, tokenImported: 0, cardsImported: 0 };
  items.push(...monsterResult.items);

  if (!items.length && !importedItems.length) {
    throw new Error("This encounter did not include a map or monster tokens AMBA can export yet.");
  }

  await deleteItemsFromCurrentScene(monsterResult.idsToReplace);
  await moveItemsInCurrentScene(monsterResult.tokenMoves);
  if (map?.item) await addItemsToCurrentScene([map.item]);
  for (const batch of monsterResult.itemBatches ?? []) {
    if (batch.length) await addItemsToCurrentScene(batch);
  }
  await saveEncounterSceneMetadata({ moduleId, encounterId: id, title: encounterTitle(encounter) });
  return {
    mapImported: Boolean(map?.item),
    mapSkipped: Boolean(map?.skipped),
    mapWarnings: map?.warnings ?? [],
    monsterTokensImported: monsterResult.tokenImported,
    monsterTokensSkipped: monsterResult.tokenSkipped,
    statCardsImported: monsterResult.cardsImported,
  };
}

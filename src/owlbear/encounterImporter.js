import OBR, { buildImage, buildShape, buildText } from "@owlbear-rodeo/sdk";
import { imageInfoFromUrl, safeName } from "./imageUtils.js";
import { inferMapGrid } from "./mapGridInference.js";
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
import { labelBaseForBlocks, numberedLabel } from "./monsterLabels.js";
import {
  encounterItemMetadata,
  findImportedItem,
  getImportedEncounterItems,
  saveEncounterSceneMetadata,
} from "./encounterMetadata.js";

function statBlockRichText(block) {
  const rawText = cleanStatText(monsterStatBlock(block));
  const name = monsterName(block);
  const rows = pf2eStatRows(rawText, name);
  const headerParts = [name, block.level ? `Level ${block.level}` : "", block.source ? `Source: ${block.source}` : ""]
    .filter(Boolean)
    .join("  |  ");

  return [
    {
      type: "paragraph",
      children: [{ text: headerParts, bold: true }],
    },
    ...rows.map(({ label, value }) => ({
      type: "paragraph",
      children: [
        { text: `${label.padEnd(11, " ")} `, bold: true },
        { text: value },
      ],
    })),
  ];
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
  return [
    monsterId(block) ?? "",
    monsterName(block).toLocaleLowerCase(),
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

function tokenBaseFontSize(label, tokenSize) {
  const ratio = label.length <= 1 ? 0.48 : label.length === 2 ? 0.38 : 0.3;
  return Math.max(18, Math.round(tokenSize * ratio));
}

function tokenSubscriptFontSize(tokenSize) {
  return Math.max(12, Math.round(tokenSize * 0.2));
}

function tokenLabelText(label) {
  return [
    {
      type: "paragraph",
      children: [{ text: label, bold: true }],
    },
  ];
}

function centeredBoxPosition(position, width, height, inset = { x: 0, y: 0 }) {
  return {
    x: position.x + inset.x - width / 2,
    y: position.y + inset.y - height / 2,
  };
}

function encounterMapGrid(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  return map?.grid ?? map?.payload?.grid ?? encounter.grid ?? null;
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
  }
  const mapImage = { ...info.image, url };
  const position = imagePositionRightOfBounds(occupiedBounds, info, 1000);
  const item = buildImage(mapImage, info.grid)
    .name(`${encounterTitle(encounter)} Map`)
    .description(`AMBA encounter map for ${encounterTitle(encounter)}`)
    .layer("MAP")
    .position(position)
    .locked(false)
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
  let imported = 0;
  const groups = monsterTypeGroups(encounter);
  const labelBases = labelBaseForBlocks(groups, (group) => monsterName(group.block));
  const gridDpi = await sceneGridDpi();
  const baseGap = gridDpi * 1.25;

  for (const [groupIndex, group] of groups.entries()) {
    const block = group.block;
    const color = TOKEN_COLORS[groupIndex % TOKEN_COLORS.length];
    const name = monsterName(block);
    const labelBase = labelBases[groupIndex];
    const footprintSize = Math.round(gridDpi * pf2eSpaceMultiplier(monsterSize(block)));
    const tokenSize = Math.round(footprintSize * 0.72);
    const labelWidth = Math.max(tokenSize * 0.62, tokenSize - gridDpi * 0.3);
    const labelHeight = Math.max(tokenSize * 0.4, tokenSize * 0.5);

    for (let copy = 0; copy < group.count; copy += 1) {
      const label = numberedLabel(labelBase, copy);
      const sourceId = group.sourceId;
      const tokenInstanceId = `${safeName(sourceId, "monster")}-${copy + 1}`;
      if (findImportedItem(importedItems, { kind: "monster-token", tokenInstanceId })) {
        skipped += 1;
        continue;
      }

      const position = gridPosition(items.length, {
        startX: origin.x + footprintSize / 2,
        startY: origin.y + footprintSize / 2,
        columns: 8,
        gapX: Math.max(baseGap, footprintSize + gridDpi * 0.25),
        gapY: Math.max(baseGap, footprintSize + gridDpi * 0.25),
      });
      const tokenCenter = {
        x: position.x + tokenSize / 2,
        y: position.y + tokenSize / 2,
      };
      const baseTextWidth = labelWidth * 0.82;
      const baseTextHeight = labelHeight;
      const numberTextWidth = labelWidth * 0.36;
      const numberTextHeight = labelHeight * 0.55;
      const tokenId = `amba-token-${safeName(tokenInstanceId, "monster")}-${crypto.randomUUID()}`;
      const baseTextId = `${tokenId}-label-base`;
      const numberTextId = `${tokenId}-label-number`;
      const metadata = encounterItemMetadata({
        moduleId,
        encounterId: encounterId(encounter),
        kind: "monster-token",
        sourceId,
        monsterId: monsterId(block) ?? "",
        tokenInstanceId,
      });

      items.push(
        buildShape()
          .id(tokenId)
          .name(`${label} ${name}`)
          .description(`AMBA monster token for ${name}`)
          .shapeType("CIRCLE")
          .width(tokenSize)
          .height(tokenSize)
          .fillColor(color)
          .fillOpacity(1)
          .strokeColor("#f5f3ff")
          .strokeOpacity(1)
          .strokeWidth(Math.max(3, Math.round(gridDpi * 0.04)))
          .layer("CHARACTER")
          .position(position)
          .zIndex(0)
          .disableAutoZIndex(true)
          .metadata({
            ...metadata,
            [`${NS}/groupId`]: tokenId,
            [`${NS}/groupRole`]: "background",
          })
          .build(),
        buildText()
          .id(baseTextId)
          .name(`${label} ${name} Label Base`)
          .description(`AMBA monster token base label for ${name}`)
          .richText(tokenLabelText(labelBase))
          .width(labelWidth * 0.82)
          .height(labelHeight)
          .padding(0)
          .fontSize(tokenBaseFontSize(labelBase, tokenSize))
          .fontWeight(700)
          .fillColor("#ffffff")
          .strokeColor("#1f160f")
          .strokeOpacity(1)
          .strokeWidth(6)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .layer("CHARACTER")
          .position(centeredBoxPosition(tokenCenter, baseTextWidth, baseTextHeight, { x: -tokenSize * 0.04, y: tokenSize * 0.04 }))
          .zIndex(10)
          .attachedTo(tokenId)
          .disableHit(true)
          .disableAutoZIndex(true)
          .metadata({
            ...metadata,
            [`${NS}/kind`]: "monster-token-label",
            [`${NS}/groupId`]: tokenId,
            [`${NS}/groupRole`]: "label-base",
          })
          .build(),
        buildText()
          .id(numberTextId)
          .name(`${label} ${name} Label Number`)
          .description(`AMBA monster token number label for ${name}`)
          .richText(tokenLabelText(String(copy + 1)))
          .width(numberTextWidth)
          .height(numberTextHeight)
          .padding(0)
          .fontSize(tokenSubscriptFontSize(tokenSize))
          .fontWeight(700)
          .fillColor("#ffffff")
          .strokeColor("#1f160f")
          .strokeOpacity(1)
          .strokeWidth(4)
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .layer("CHARACTER")
          .position(centeredBoxPosition(tokenCenter, numberTextWidth, numberTextHeight, { x: tokenSize * 0.18, y: tokenSize * 0.18 }))
          .zIndex(11)
          .attachedTo(tokenId)
          .disableHit(true)
          .disableAutoZIndex(true)
          .metadata({
            ...metadata,
            [`${NS}/kind`]: "monster-token-label",
            [`${NS}/groupId`]: tokenId,
            [`${NS}/groupRole`]: "label-number",
          })
          .build()
      );
      imported += 1;
    }
  }

  return { items, skipped, imported };
}

function buildMonsterStatCardItems({ moduleId, encounter, origin, importedItems }) {
  const items = [];
  let imported = 0;
  const groups = monsterTypeGroups(encounter);

  for (const [index, group] of groups.entries()) {
    const block = group.block;
    const text = monsterStatBlock(block);
    if (!text) continue;

    const sourceId = group.sourceId;
    if (findImportedItem(importedItems, { kind: "monster-stat-card", sourceId })) continue;

    const position = gridPosition(index, {
      startX: origin.x + 1300,
      startY: origin.y + 260,
      columns: 1,
      gapX: 1100,
      gapY: 820,
    });
    const cardId = `amba-stat-card-${safeName(sourceId, "monster")}-${crypto.randomUUID()}`;
    const textId = `${cardId}-text`;
    const metadata = encounterItemMetadata({
      moduleId,
      encounterId: encounterId(encounter),
      kind: "monster-stat-card",
      sourceId,
      monsterId: monsterId(block) ?? "",
    });

    items.push(
      buildShape()
        .id(cardId)
        .name(`${monsterName(block)} Stat Card`)
        .description(`AMBA monster stat block for ${monsterName(block)}`)
        .shapeType("RECTANGLE")
        .width(1040)
        .height(760)
        .fillColor("#f7f2e8")
        .fillOpacity(1)
        .strokeColor("#4a4036")
        .strokeOpacity(1)
        .strokeWidth(6)
        .layer("NOTE")
        .position(position)
        .locked(true)
        .zIndex(0)
        .disableAutoZIndex(true)
        .metadata({ ...metadata, [`${NS}/groupId`]: cardId, [`${NS}/groupRole`]: "background" })
        .build(),
      buildText()
        .id(textId)
        .name(`${monsterName(block)} Stat Text`)
        .description(`AMBA monster stat text for ${monsterName(block)}`)
        .richText(statBlockRichText(block))
        .width(940)
        .height(660)
        .padding(0)
        .fontFamily("Consolas")
        .fontSize(17)
        .lineHeight(1.18)
        .fillColor("#251f1a")
        .textAlignVertical("TOP")
        .layer("NOTE")
        .position(position)
        .locked(true)
        .disableHit(true)
        .zIndex(10)
        .attachedTo(cardId)
        .disableAutoZIndex(true)
        .metadata({
          ...metadata,
          [`${NS}/kind`]: "monster-stat-card-text",
          [`${NS}/groupId`]: cardId,
          [`${NS}/groupRole`]: "text",
        })
        .build()
    );
    imported += 1;
  }

  return { items, imported };
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
    : { items: [], skipped: 0, imported: 0 };
  items.push(...monsterResult.items);

  const statCardResult = importOptions.importStatCards
    ? buildMonsterStatCardItems({
        moduleId,
        encounter,
        origin: monsterOrigin,
        importedItems,
      })
    : { items: [], imported: 0 };
  items.push(...statCardResult.items);

  if (!items.length && !importedItems.length) {
    throw new Error("This encounter did not include a map or monster tokens AMBA can export yet.");
  }

  if (items.length) await addItemsToCurrentScene(items);
  await saveEncounterSceneMetadata({ moduleId, encounterId: id, title: encounterTitle(encounter) });
  return {
    mapImported: Boolean(map?.item),
    mapSkipped: Boolean(map?.skipped),
    monsterTokensImported: monsterResult.imported,
    monsterTokensSkipped: monsterResult.skipped,
    statCardsImported: statCardResult.imported,
  };
}

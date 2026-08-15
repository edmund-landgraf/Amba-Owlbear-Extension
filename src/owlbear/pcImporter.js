import OBR, { buildImage, buildImageUpload, buildSceneUpload, buildShape, buildText } from "@owlbear-rodeo/sdk";
import {
  getPcNoteImageUrl,
  getPcSheetImageUrl,
  getPcTokenImageUrl,
  toAmbaUrl,
} from "../amba/ambaApi.js";
import { htmlToOwlbearRichText } from "../amba/htmlToOwlbearRichText.js";
import {
  fetchImageBlob,
  imageInfoFromUrl,
  rasterizeSvgFile,
  safeName,
} from "./imageUtils.js";
import { getSceneBoundsForLayers, gridPosition, NS, rightOfBounds } from "./layout.js";

// Default purple used when a flow does not provide a rotated color.
const TOKEN_COLOR = "#7c3aed";

// Eight colors based on the Owlbear sticky-note color strip.
// Token and note colors rotate together by PC index: PC 0 gets purple, PC 1
// gets cyan, and so on; after blue the palette wraps.
const NOTE_COLORS = [
  "#7c3aed",
  "#45c7d8",
  "#78f05b",
  "#ffd23c",
  "#d46bef",
  "#ff4e4e",
  "#ff7a2f",
  "#2d6aef",
];

// Find the AMBA narrative that contains a character sheet.
// Sheet-specific flows intentionally fail when this is missing; the main
// token+placeholder-note flow does not call this helper.
function characterSheetHtml(pc) {
  const sheet = pc.narratives?.find(
    (narrative) =>
      /character sheet/i.test(narrative.title) || narrative.content.includes("pf2e-sheet")
  );
  if (!sheet) throw new Error(`No character sheet found for ${pc.name}.`);
  return sheet.content;
}

// Find portrait art for a PC from metadata or artifacts.
// If this returns null, tokenInfo falls back to AMBA's generated letter token.
function portraitPath(pc) {
  const art = Array.isArray(pc.metadata?.characterArt)
    ? pc.metadata.characterArt.find((entry) => typeof entry?.url === "string" && entry.url)
    : null;
  if (art) return art.url;
  if (typeof pc.metadata?.portraitUrl === "string" && pc.metadata.portraitUrl) return pc.metadata.portraitUrl;
  const artifact = pc.artifacts?.find((entry) => entry.artifactType?.key === "image" && typeof entry.payload?.url === "string" && ["portrait", "art"].includes(entry.payload?.role));
  return artifact?.payload?.url ?? null;
}

// Resolve the token image for a PC.
// Prefer real portrait art when present and decodable; otherwise use the AMBA
// generated 512x512 colored first-letter token.
async function tokenInfo(moduleId, pc, color = TOKEN_COLOR) {
  const path = portraitPath(pc);
  if (path) {
    const url = toAmbaUrl(path);
    try {
      return await imageInfoFromUrl(url, `${safeName(pc.name)}-portrait`);
    } catch {
      // Fall through to generated AMBA token if portrait metadata is stale.
    }
  }

  // Generated AMBA tokens are always 512x512, so we do not need to decode the
  // SVG just to learn dimensions.
  const url = getPcTokenImageUrl(moduleId, pc.id, color);
  return {
    file: await fetchImageBlob(url, `${safeName(pc.name)}-token.svg`),
    image: { width: 512, height: 512, url, mime: "image/svg+xml" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

// Build one Character-library upload for a PC token.
// Owlbear will still ask the user which Characters folder to use; the SDK does
// not expose a folder target parameter.
async function generatedTokenUpload(moduleId, moduleTitle, pc, color = TOKEN_COLOR) {
  const url = getPcTokenImageUrl(moduleId, pc.id, color);
  const svgFile = await fetchImageBlob(url, `${safeName(pc.name)}-token.svg`);
  const pngFile = await rasterizeSvgFile(svgFile, `${safeName(pc.name)}-token.png`, 512, 512);
  return buildImageUpload(pngFile)
    .name(pc.name)
    .description(`AMBA generated token for ${pc.name} from ${moduleTitle}`)
    .grid({ dpi: 512, offset: { x: 256, y: 256 } })
    .plainText(pc.name)
    .build();
}

// Image-backed note helper retained for older experiments.
// The current note prototype uses Shape + Text instead, because text overlays on
// image notes produced vertical editing behavior in Owlbear.
async function noteInfo(moduleId, pc) {
  const url = getPcNoteImageUrl(moduleId, pc.id, TOKEN_COLOR);
  return {
    image: { width: 512, height: 512, url, mime: "image/svg+xml" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

// Resolve a rendered character sheet PNG.
// Missing sheets surface as 404s from AMBA; the sheet-image importer handles
// those with Promise.allSettled so one missing sheet does not stop the batch.
async function snapshotInfo(moduleId, pc) {
  const url = getPcSheetImageUrl(moduleId, pc.id, TOKEN_COLOR);
  const info = await imageInfoFromUrl(url, `${safeName(pc.name)}-character-sheet-snapshot.png`);
  return {
    ...info,
    grid: { dpi: 200, offset: { x: info.image.width / 2, y: info.image.height / 2 } },
  };
}

// Normalize thrown values from Owlbear/browser APIs into readable messages.
// Validation errors can be plain objects, not Error instances.
function uploadErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : String(error);
  } catch {
    return String(error);
  }
}

// Add items directly to the current Owlbear scene.
// This is the no-folder-picker path; unlike asset upload and scene upload, it
// does not ask the user to pick a library folder.
async function addItemsToCurrentScene(items) {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("No Owlbear scene is currently open. Open or create a blank scene, then import again.");
  }
  await OBR.scene.items.addItems(items);
}

// Legacy/full character-sheet bundle builder.
//
// This creates three Owlbear items for one PC:
// 1. a CHARACTER-layer token,
// 2. a NOTE-layer rich-text sheet note,
// 3. a NOTE-layer rendered PNG sheet snapshot.
//
// The current "Load all PCs" path below no longer uses this because it requires
// every PC to have a sheet. It remains here for the sheet-heavy prototype paths.
async function buildPcItems({ moduleId, pc, index = 0 }) {
  let token;
  let sheet;
  let snapshot;
  let sheetRichText;
  try {
    token = await tokenInfo(moduleId, pc);
    sheet = await noteInfo(moduleId, pc);
    snapshot = await snapshotInfo(moduleId, pc);
    sheetRichText = htmlToOwlbearRichText(characterSheetHtml(pc));
  } catch (error) {
    throw new Error(`Preparing ${pc.name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Metadata is attached to every generated item so future tools can trace an
  // Owlbear item back to its AMBA module and PC.
  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };

  // Full sheet bundles are tall, so each PC gets a new vertical row.
  const rowY = 100 + index * 2300;

  // Token: normal Owlbear image item on the CHARACTER layer.
  const tokenItem = buildImage(token.image, token.grid)
    .name(pc.name).description(`AMBA character token for ${pc.name}`).plainText(pc.name)
    .layer("CHARACTER").position({ x: 200, y: rowY + 200 })
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-token" }).build();

  // Rich-text sheet note: the HTML sheet is converted into Owlbear's rich-text
  // JSON and rendered over the generated note backing image.
  const sheetItem = buildImage(sheet.image, sheet.grid)
    .name(`${pc.name} Character Sheet`).description(`AMBA character sheet for ${pc.name}`)
    .textItemType("TEXT").richText(sheetRichText).textWidth(920).textHeight("AUTO")
    .textPadding(36).fontSize(18).textFillColor("#1a1a1a")
    .layer("NOTE").position({ x: 500, y: rowY })
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet" }).build();

  // Snapshot image: a visual PNG render of the sheet, useful because Owlbear
  // scene notes do not render arbitrary HTML/CSS directly.
  const snapshotItem = buildImage(snapshot.image, snapshot.grid)
    .name(`${pc.name} Character Sheet Snapshot`)
    .description(`Rendered AMBA character sheet snapshot for ${pc.name}`)
    .layer("NOTE").position({ x: 1700, y: rowY })
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet-snapshot" }).build();

  return { items: [tokenItem, sheetItem, snapshotItem], thumbnail: token.file };
}

// Placeholder note text used by the current root-scene prototype.
// The requested content is intentionally simple: "Content For {PC Name}".
function placeholderRichText(pc) {
  return [
    {
      type: "paragraph",
      children: [{ text: `Content For ${pc.name}` }],
    },
  ];
}

// Current primary item builder for "Load all PCs".
//
// For each PC it creates:
// - a token image item on the CHARACTER layer,
// - a colored rectangle Shape on the NOTE layer,
// - a Text item on top of that rectangle.
//
// Shape + Text is deliberate. A previous image-note/text-overlay approach looked
// close visually, but Owlbear treated edited text as if the box was too narrow,
// causing vertical letters. A standalone Text item with explicit width behaves
// much more predictably.
async function buildPcTokenAndNoteItems({ moduleId, pc, index = 0 }) {
  let token;

  // Rotate through the eight Owlbear-like note colors, keeping the token and
  // companion note in the same color family.
  const color = NOTE_COLORS[index % NOTE_COLORS.length];
  try {
    token = await tokenInfo(moduleId, pc, color);
  } catch (error) {
    throw new Error(`Preparing ${pc.name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // All items in the token+note group share metadata so they can be found or
  // cleaned up together later.
  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };

  // Simple 3-column scene-root layout for fast visual testing.
  const row = Math.floor(index / 3);
  const column = index % 3;
  const originX = 200 + column * 1100;
  const originY = 200 + row * 700;

  // Token item. The URL is the short AMBA token.svg URL, not embedded base64.
  const tokenItem = buildImage(token.image, token.grid)
    .name(pc.name)
    .description(`AMBA generated token for ${pc.name}`)
    .plainText(pc.name)
    .layer("CHARACTER")
    .position({ x: originX, y: originY })
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-token" })
    .build();

  // Note background as a real Owlbear shape, not an image pretending to be a
  // note. This makes selection and editing more predictable.
  const noteShape = buildShape()
    .name(`${pc.name} Note`)
    .description(`AMBA note for ${pc.name}`)
    .shapeType("RECTANGLE")
    .width(420)
    .height(260)
    .fillColor(color)
    .fillOpacity(1)
    .strokeColor("#f5f3ff")
    .strokeOpacity(1)
    .strokeWidth(8)
    .layer("NOTE")
    .position({ x: originX + 470, y: originY })
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-placeholder-note" })
    .build();

  // Editable note text on top of the colored shape.
  // Width is explicit to prevent the vertical-letter wrapping seen in testing.
  const noteText = buildText()
    .name(`${pc.name} Note Text`)
    .description(`AMBA note text for ${pc.name}`)
    .richText(placeholderRichText(pc))
    .width(340)
    .height("AUTO")
    .padding(0)
    .fontSize(28)
    .fillColor("#ffffff")
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .layer("NOTE")
    .position({ x: originX + 470, y: originY })
    .zIndex(1)
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-placeholder-note-text" })
    .build();

  return [tokenItem, noteShape, noteText];
}

// Upload a single-PC scene to Owlbear's Scenes library.
// This is a preserved experimental path; the direct current-scene import is the
// lower-friction path during development because scene/library uploads can open
// Owlbear picker UI.
export async function importPcAsScene({ moduleId, moduleTitle, pc }) {
  const { items, thumbnail } = await buildPcItems({ moduleId, pc });
  const scene = buildSceneUpload().name(`${moduleTitle} — ${pc.name}`).gridType("SQUARE")
    .gridScale("5 ft").items(items).thumbnail(thumbnail).build();

  try {
    await OBR.assets.uploadScenes([scene]);
    return "scene";
  } catch (error) {
    try {
      await addItemsToCurrentScene(items);
      return "current-scene";
    } catch (fallbackError) {
      throw new Error(`Uploading scene for ${pc.name} failed: ${uploadErrorMessage(error)}. Adding to the current scene also failed: ${uploadErrorMessage(fallbackError)}`);
    }
  }
}

// Add the legacy/full sheet bundle for one PC directly to the current scene.
// This still requires a character sheet, so it is not used by "Load all PCs".
export async function addPcToCurrentScene({ moduleId, pc }) {
  const { items } = await buildPcItems({ moduleId, pc });
  await addItemsToCurrentScene(items);
  return "current-scene";
}

// Upload one module scene containing the legacy/full sheet bundles.
// If the scene upload fails or is rejected, this falls back to adding the same
// items to the current scene.
export async function importPcsAsScene({ moduleId, moduleTitle, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const built = await Promise.all(
    pcs.map((pc, index) => buildPcItems({ moduleId, pc, index }))
  );
  const scene = buildSceneUpload()
    .name(moduleTitle)
    .gridType("SQUARE")
    .gridScale("5 ft")
    .items(built.flatMap((entry) => entry.items))
    .thumbnail(built[0].thumbnail)
    .build();

  try {
    await OBR.assets.uploadScenes([scene]);
    return "scene";
  } catch (error) {
    try {
      await addItemsToCurrentScene(built.flatMap((entry) => entry.items));
      return "current-scene";
    } catch (fallbackError) {
      throw new Error(`Uploading ${moduleTitle} scene failed: ${uploadErrorMessage(error)}. Adding to the current scene also failed: ${uploadErrorMessage(fallbackError)}`);
    }
  }
}

// Add legacy/full sheet bundles for all PCs directly to the current scene.
// Useful for testing the rich-text note + PNG snapshot combo, but sheetless PCs
// can still make this fail.
export async function addPcsToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const built = await Promise.all(
    pcs.map((pc, index) => buildPcItems({ moduleId, pc, index }))
  );
  await addItemsToCurrentScene(built.flatMap((entry) => entry.items));
  return "current-scene";
}

// Main root-scene import used by the "Load all PCs" button.
// This avoids sheets entirely, so incomplete PC data can still be visualized as
// token+placeholder-note pairs.
export async function addPcTokensAndNotesToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const built = await Promise.all(
    pcs.map((pc, index) => buildPcTokenAndNoteItems({ moduleId, pc, index }))
  );
  await addItemsToCurrentScene(built.flat());
  return built.length;
}

// Build one rendered character-sheet PNG item.
// These snapshots are placed below the token/note prototype area so they do not
// overlap the root token layout.
async function buildPcSheetImageItem({ moduleId, pc, index = 0, origin = { x: 3600, y: 200 } }) {
  const snapshot = await snapshotInfo(moduleId, pc);
  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };
  const position = gridPosition(index, {
    startX: origin.x,
    startY: origin.y,
    columns: 2,
    gapX: 1100,
    gapY: 1500,
  });
  return buildImage(snapshot.image, snapshot.grid)
    .name(`${pc.name} Character Sheet`)
    .description(`Rendered AMBA character sheet for ${pc.name}`)
    .layer("NOTE")
    .position(position)
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet-snapshot" })
    .build();
}

// Import available rendered sheet PNGs into the current scene.
// Missing sheets are expected for some PCs, so each PC is attempted separately
// and the function returns imported/skipped counts.
export async function addPcSheetImagesToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const mapBounds = await getSceneBoundsForLayers(["MAP"]);
  const origin = rightOfBounds(mapBounds, 1000);

  const results = await Promise.allSettled(
    pcs.map((pc, index) => buildPcSheetImageItem({ moduleId, pc, index, origin }))
  );
  const items = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (items.length) await addItemsToCurrentScene(items);
  return {
    imported: items.length,
    skipped: results.length - items.length,
  };
}

// Upload generated token PNGs to Owlbear's Characters asset library.
// Owlbear's public SDK does not accept a folder ID here, so this will invoke
// Owlbear's asset-folder picker when used.
export async function uploadPcTokensToCharacters({ moduleId, moduleTitle, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const uploads = await Promise.all(
    pcs.map((pc, index) => generatedTokenUpload(moduleId, moduleTitle, pc, NOTE_COLORS[index % NOTE_COLORS.length]))
  );
  await OBR.assets.uploadImages(uploads, "CHARACTER");
  return uploads.length;
}

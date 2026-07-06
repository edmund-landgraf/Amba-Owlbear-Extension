import OBR, { buildImage, buildImageUpload, buildSceneUpload, buildShape, buildText } from "@owlbear-rodeo/sdk";
import {
  getPcNoteImageUrl,
  getPcSheetImageUrl,
  getPcTokenImageUrl,
  toAmbaUrl,
} from "../amba/ambaApi.js";
import { htmlToOwlbearRichText } from "../amba/htmlToOwlbearRichText.js";

const NS = "com.adventuremakerbyact.owlbear";
const TOKEN_COLOR = "#7c3aed";
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

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "character";
}

function characterSheetHtml(pc) {
  const sheet = pc.narratives?.find(
    (narrative) =>
      /character sheet/i.test(narrative.title) || narrative.content.includes("pf2e-sheet")
  );
  if (!sheet) throw new Error(`No character sheet found for ${pc.name}.`);
  return sheet.content;
}

function portraitPath(pc) {
  const art = Array.isArray(pc.metadata?.characterArt)
    ? pc.metadata.characterArt.find((entry) => typeof entry?.url === "string" && entry.url)
    : null;
  if (art) return art.url;
  if (typeof pc.metadata?.portraitUrl === "string" && pc.metadata.portraitUrl) return pc.metadata.portraitUrl;
  const artifact = pc.artifacts?.find((entry) => entry.artifactType?.key === "image" && typeof entry.payload?.url === "string" && ["portrait", "art"].includes(entry.payload?.role));
  return artifact?.payload?.url ?? null;
}

async function fetchImageBlob(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${filename}: ${response.status}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`${filename} was empty.`);
  return new File([blob], filename, { type: blob.type || "image/png" });
}

async function imageSizeFromBlob(blob, name) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`Unable to decode ${name} (${blob.type || "unknown type"}, ${blob.size ?? 0} bytes).`);
  }
  try { return { width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
}

async function imageInfoFromUrl(url, filename, fallbackType = "image/png") {
  const file = await fetchImageBlob(url, filename);
  const size = await imageSizeFromBlob(file, filename);
  return {
    file,
    image: { ...size, url, mime: file.type || fallbackType },
    grid: { dpi: Math.max(size.width, size.height), offset: { x: size.width / 2, y: size.height / 2 } },
  };
}

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

  const url = getPcTokenImageUrl(moduleId, pc.id, color);
  return {
    file: await fetchImageBlob(url, `${safeName(pc.name)}-token.svg`),
    image: { width: 512, height: 512, url, mime: "image/svg+xml" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

function rasterizeSvgFile(svgFile, filename, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(svgFile);

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error(`Unable to render ${filename}`));
            return;
          }
          resolve(new File([blob], filename, { type: "image/png" }));
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode ${filename}`));
    };

    image.src = objectUrl;
  });
}

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

async function noteInfo(moduleId, pc) {
  const url = getPcNoteImageUrl(moduleId, pc.id, TOKEN_COLOR);
  return {
    image: { width: 512, height: 512, url, mime: "image/svg+xml" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

async function snapshotInfo(moduleId, pc) {
  const url = getPcSheetImageUrl(moduleId, pc.id, TOKEN_COLOR);
  const info = await imageInfoFromUrl(url, `${safeName(pc.name)}-character-sheet-snapshot.png`);
  return {
    ...info,
    grid: { dpi: 200, offset: { x: info.image.width / 2, y: info.image.height / 2 } },
  };
}

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

async function addItemsToCurrentScene(items) {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("No Owlbear scene is currently open. Open or create a blank scene, then import again.");
  }
  await OBR.scene.items.addItems(items);
}

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

  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };
  const rowY = 100 + index * 2300;
  const tokenItem = buildImage(token.image, token.grid)
    .name(pc.name).description(`AMBA character token for ${pc.name}`).plainText(pc.name)
    .layer("CHARACTER").position({ x: 200, y: rowY + 200 })
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-token" }).build();
  const sheetItem = buildImage(sheet.image, sheet.grid)
    .name(`${pc.name} Character Sheet`).description(`AMBA character sheet for ${pc.name}`)
    .textItemType("TEXT").richText(sheetRichText).textWidth(920).textHeight("AUTO")
    .textPadding(36).fontSize(18).textFillColor("#1a1a1a")
    .layer("NOTE").position({ x: 500, y: rowY })
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet" }).build();
  const snapshotItem = buildImage(snapshot.image, snapshot.grid)
    .name(`${pc.name} Character Sheet Snapshot`)
    .description(`Rendered AMBA character sheet snapshot for ${pc.name}`)
    .layer("NOTE").position({ x: 1700, y: rowY })
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet-snapshot" }).build();

  return { items: [tokenItem, sheetItem, snapshotItem], thumbnail: token.file };
}

function placeholderRichText(pc) {
  return [
    {
      type: "paragraph",
      children: [{ text: `Content For ${pc.name}` }],
    },
  ];
}

async function buildPcTokenAndNoteItems({ moduleId, pc, index = 0 }) {
  let token;
  const color = NOTE_COLORS[index % NOTE_COLORS.length];
  try {
    token = await tokenInfo(moduleId, pc, color);
  } catch (error) {
    throw new Error(`Preparing ${pc.name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };
  const row = Math.floor(index / 3);
  const column = index % 3;
  const originX = 200 + column * 1100;
  const originY = 200 + row * 700;

  const tokenItem = buildImage(token.image, token.grid)
    .name(pc.name)
    .description(`AMBA generated token for ${pc.name}`)
    .plainText(pc.name)
    .layer("CHARACTER")
    .position({ x: originX, y: originY })
    .metadata({ ...metadata, [`${NS}/kind`]: "pc-token" })
    .build();
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

export async function addPcToCurrentScene({ moduleId, pc }) {
  const { items } = await buildPcItems({ moduleId, pc });
  await addItemsToCurrentScene(items);
  return "current-scene";
}

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

export async function addPcsToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const built = await Promise.all(
    pcs.map((pc, index) => buildPcItems({ moduleId, pc, index }))
  );
  await addItemsToCurrentScene(built.flatMap((entry) => entry.items));
  return "current-scene";
}

export async function addPcTokensAndNotesToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const built = await Promise.all(
    pcs.map((pc, index) => buildPcTokenAndNoteItems({ moduleId, pc, index }))
  );
  await addItemsToCurrentScene(built.flat());
  return built.length;
}

async function buildPcSheetImageItem({ moduleId, pc, index = 0 }) {
  const snapshot = await snapshotInfo(moduleId, pc);
  const metadata = { [`${NS}/moduleId`]: moduleId, [`${NS}/pcId`]: pc.id };
  const row = Math.floor(index / 3);
  const column = index % 3;
  return buildImage(snapshot.image, snapshot.grid)
    .name(`${pc.name} Character Sheet`)
    .description(`Rendered AMBA character sheet for ${pc.name}`)
    .layer("NOTE")
    .position({ x: 200 + column * 950, y: 1000 + row * 1400 })
    .metadata({ ...metadata, [`${NS}/kind`]: "character-sheet-snapshot" })
    .build();
}

export async function addPcSheetImagesToCurrentScene({ moduleId, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const results = await Promise.allSettled(
    pcs.map((pc, index) => buildPcSheetImageItem({ moduleId, pc, index }))
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

export async function uploadPcTokensToCharacters({ moduleId, moduleTitle, pcs }) {
  if (!pcs.length) throw new Error("No PCs found to import.");

  const uploads = await Promise.all(
    pcs.map((pc, index) => generatedTokenUpload(moduleId, moduleTitle, pc, NOTE_COLORS[index % NOTE_COLORS.length]))
  );
  await OBR.assets.uploadImages(uploads, "CHARACTER");
  return uploads.length;
}

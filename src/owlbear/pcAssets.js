import { buildImageUpload } from "@owlbear-rodeo/sdk";
import {
  getPcNoteImageUrl,
  getPcSheetImageUrl,
  // getPcTokenImageUrl,
  toAmbaUrl,
} from "../amba/ambaApi.js";
import { firstLetterLabel, letterTokenSvg, letterTokenSvgUrl } from "./tokenSvg.js";
import {
  fetchImageBlob,
  mediumTokenFromFile,
  overlayTokenOnImage,
  rasterizeSvgFile,
  safeName,
  sceneImageFromFile,
} from "./imageUtils.js";
import { rasterizedTokenInfo } from "./tokenImage.js";

export const TOKEN_COLOR = "#7c3aed";

export const NOTE_COLORS = [
  "#7c3aed",
  "#45c7d8",
  "#78f05b",
  "#ffd23c",
  "#d46bef",
  "#ff4e4e",
  "#ff7a2f",
  "#2d6aef",
];

export function characterSheetHtml(pc) {
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

export async function tokenInfo(moduleId, pc, color = TOKEN_COLOR) {
  const path = portraitPath(pc);
  if (path) {
    const url = toAmbaUrl(path);
    try {
      const file = await fetchImageBlob(url, `${safeName(pc.name)}-portrait`);
      return await mediumTokenFromFile(file, `${safeName(pc.name)}-portrait.png`);
    } catch {
      // Fall through to a generated first-letter token if portrait metadata is stale.
    }
  }

  return rasterizedTokenInfo(
    letterTokenSvgUrl({
      label: firstLetterLabel(pc.name),
      name: pc.name,
      color,
    }),
    `${safeName(pc.name)}-token`
  );
}

export async function generatedTokenUpload(moduleId, moduleTitle, pc, color = TOKEN_COLOR) {
  // const url = getPcTokenImageUrl(moduleId, pc.id, color);
  // const svgFile = await fetchImageBlob(url, `${safeName(pc.name)}-token.svg`);
  const svgFile = new File(
    [letterTokenSvg({ label: firstLetterLabel(pc.name), name: pc.name, color })],
    `${safeName(pc.name)}-token.svg`,
    { type: "image/svg+xml" }
  );
  const pngFile = await rasterizeSvgFile(svgFile, `${safeName(pc.name)}-token.png`, 512, 512);
  return buildImageUpload(pngFile)
    .name(pc.name)
    .description(`AMBA generated token for ${pc.name} from ${moduleTitle}`)
    .grid({ dpi: 512, offset: { x: 256, y: 256 } })
    .plainText(pc.name)
    .build();
}

export async function noteInfo(moduleId, pc) {
  const url = getPcNoteImageUrl(moduleId, pc.id, TOKEN_COLOR);
  const svgFile = await fetchImageBlob(url, `${safeName(pc.name)}-note.svg`);
  const pngFile = await rasterizeSvgFile(svgFile, `${safeName(pc.name)}-note.png`, 512, 512);
  return sceneImageFromFile(pngFile, { width: 512, height: 512, dpi: 512, mime: "image/png" });
}

export async function snapshotInfo(moduleId, pc, color = TOKEN_COLOR) {
  const url = getPcSheetImageUrl(moduleId, pc.id, color);
  const filename = `${safeName(pc.name)}-character-sheet-snapshot.png`;
  const sheetFile = await fetchImageBlob(url, filename);
  const tokenPng = await rasterizeSvgFile(
    new File(
      [letterTokenSvg({ label: firstLetterLabel(pc.name), name: pc.name, color })],
      `${safeName(pc.name)}-token.svg`,
      { type: "image/svg+xml" }
    ),
    `${safeName(pc.name)}-token.png`,
    512,
    512
  );
  const composited = await overlayTokenOnImage(sheetFile, tokenPng, {
    anchor: "top-left",
    sizeRatio: 0.055,
    maxSize: 68,
    marginX: 28,
    marginY: 22,
  });
  const info = await sceneImageFromFile(composited, { mime: "image/png" });
  return {
    ...info,
    grid: { dpi: 200, offset: { x: info.image.width / 2, y: info.image.height / 2 } },
  };
}

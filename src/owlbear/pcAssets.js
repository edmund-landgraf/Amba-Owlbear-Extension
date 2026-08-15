import { buildImageUpload } from "@owlbear-rodeo/sdk";
import {
  getPcNoteImageUrl,
  getPcSheetImageUrl,
  getPcTokenImageUrl,
  toAmbaUrl,
} from "../amba/ambaApi.js";
import {
  fetchImageBlob,
  imageInfoFromUrl,
  rasterizeSvgFile,
  safeName,
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
      return await imageInfoFromUrl(url, `${safeName(pc.name)}-portrait`);
    } catch {
      // Fall through to generated AMBA token if portrait metadata is stale.
    }
  }

  const url = getPcTokenImageUrl(moduleId, pc.id, color);
  return rasterizedTokenInfo(url, `${safeName(pc.name)}-token`);
}

export async function generatedTokenUpload(moduleId, moduleTitle, pc, color = TOKEN_COLOR) {
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

export async function noteInfo(moduleId, pc) {
  const url = getPcNoteImageUrl(moduleId, pc.id, TOKEN_COLOR);
  return {
    image: { width: 512, height: 512, url, mime: "image/svg+xml" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

export async function snapshotInfo(moduleId, pc) {
  const url = getPcSheetImageUrl(moduleId, pc.id, TOKEN_COLOR);
  const info = await imageInfoFromUrl(url, `${safeName(pc.name)}-character-sheet-snapshot.png`);
  return {
    ...info,
    grid: { dpi: 200, offset: { x: info.image.width / 2, y: info.image.height / 2 } },
  };
}

import { imageInfoFromUrl, safeName } from "../owlbear/imageUtils.js";
import {
  encounterTitle,
  mapDpi,
  mapSourceId,
  mapUrl,
  monsterBlocks,
  monsterCount,
} from "../owlbear/encounterData.js";

function mapGrid(encounter) {
  const map = encounter.map ?? encounter.battleMap ?? encounter.encounterMap;
  return map?.grid ?? map?.payload?.grid ?? encounter.grid ?? null;
}

function gridSummary(grid, dpi) {
  const scale = grid?.scale ?? grid?.gridScale ?? "5 ft";
  const columns = Number.parseInt(grid?.columns, 10);
  const rows = Number.parseInt(grid?.rows, 10);
  const size = Number.parseInt(grid?.cellSize ?? dpi, 10);
  const parts = [];
  if (Number.isFinite(size) && size > 0) parts.push(`${size}px/square`);
  if (Number.isFinite(columns) && Number.isFinite(rows)) parts.push(`${columns} x ${rows} squares`);
  if (scale) parts.push(`1 square = ${scale}`);
  return parts.join(", ") || "Grid metadata not supplied";
}

export async function analyzeEncounterForExport(encounter) {
  const url = mapUrl(encounter);
  const blocks = monsterBlocks(encounter);
  const totalMonsters = blocks.reduce((sum, block) => sum + monsterCount(block), 0);
  const dpi = mapDpi(encounter);
  const grid = mapGrid(encounter);
  const result = {
    title: encounterTitle(encounter),
    hasMap: Boolean(url),
    mapUrl: url,
    mapSourceId: mapSourceId(encounter),
    mapDpi: dpi,
    mapGridSummary: gridSummary(grid, dpi),
    mapReady: false,
    mapError: null,
    mapImage: null,
    monsterBlockCount: blocks.length,
    totalMonsterTokens: totalMonsters,
    exportable: Boolean(url || blocks.length),
  };

  if (!url) return result;

  try {
    const info = await imageInfoFromUrl(
      url,
      `${safeName(encounterTitle(encounter), "encounter")}-map-analysis`,
      "image/png",
      dpi
    );
    result.mapReady = true;
    result.mapImage = {
      width: info.image.width,
      height: info.image.height,
      mime: info.image.mime,
      dpi: info.grid.dpi,
    };
  } catch (error) {
    result.mapError = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export function renderEncounterAnalysis(container, analysis, options = {}) {
  if (!container || !analysis) return;

  const mapDetail = analysis.hasMap
    ? analysis.mapReady
      ? `${analysis.mapImage.width} x ${analysis.mapImage.height} ${analysis.mapImage.mime}; ${analysis.mapGridSummary}`
      : `Map found, but not ready: ${analysis.mapError ?? "unknown error"}`
    : "No map found";

  container.innerHTML = `
    <div class="encounter-analysis">
      <div><strong>Encounter:</strong> ${escapeHtml(analysis.title)}</div>
      <div><strong>Map:</strong> ${escapeHtml(mapDetail)}</div>
      <div><strong>Monster blocks:</strong> ${analysis.monsterBlockCount} block${analysis.monsterBlockCount === 1 ? "" : "s"}; ${analysis.totalMonsterTokens} token${analysis.totalMonsterTokens === 1 ? "" : "s"} planned</div>
      <div><strong>Export plan:</strong> ${escapeHtml(exportPlanText(analysis, options))}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function exportPlanText(analysis, options) {
  const parts = [];
  if (options.importMap && analysis.hasMap) parts.push("map");
  if (options.importMonsterTokens && analysis.monsterBlockCount) parts.push("monster tokens");
  if (options.importStatCards && analysis.monsterBlockCount) parts.push("stat cards");
  if (options.includePcTokens) parts.push("PC tokens");
  if (!parts.length) return "nothing selected";
  return parts.join(", ");
}

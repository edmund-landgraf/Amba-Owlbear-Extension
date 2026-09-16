import { apiStatCardModel, statCardRowsFromModel } from "../src/owlbear/statCardModel.js";
import { renderStatCardSvgFile } from "../src/owlbear/statCardImage.js";

const baseUrl = (process.env.PF2_API_BASE_URL || "http://127.0.0.1:3334").replace(/\/+$/, "");
const seed = Number(process.env.STAT_CARD_SEED || 7249);
const response = await fetch(`${baseUrl}/api/monsters?limit=100&offset=0`);
if (!response.ok) throw new Error(`PF2 API list failed: ${response.status}`);
const rows = (await response.json()).rows ?? [];
const choose = async (source) => {
  const candidates = rows.filter((row) => source === "Demiplane" ? /demiplane\.com/i.test(row.AonUrl ?? "") : /aonprd\.com/i.test(row.AonUrl ?? ""));
  if (candidates.length < 3) throw new Error(`Expected at least three ${source} monsters in seeded API page, found ${candidates.length}.`);
  let state = seed + source.length;
  const selected = [];
  const visited = new Set();
  while (selected.length < 3 && visited.size < candidates.length) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const row = candidates[state % candidates.length];
    if (visited.has(row.MonsterId)) continue;
    visited.add(row.MonsterId);
    const response = await fetch(new URL(row.ImageUrl || `/api/monsters/${row.MonsterId}/image`, baseUrl));
    if (response.ok) selected.push({ row, art: await response.blob() });
  }
  if (selected.length < 3) throw new Error(`Expected three ${source} monsters with unlocked local art, found ${selected.length}.`);
  return selected;
};

const sample = [...await choose("AoN"), ...await choose("Demiplane")];
for (const { row, art: artBlob } of sample) {
  const source = /demiplane\.com/i.test(row.AonUrl ?? "") ? "Demiplane" : "AoN";
  const model = apiStatCardModel(row);
  const imageResponse = await fetch(new URL(row.ImageUrl || `/api/monsters/${row.MonsterId}/image`, baseUrl));
  if (!imageResponse.ok) throw new Error(`${row.Name}: art request failed (${imageResponse.status}).`);
  const art = new File([await imageResponse.blob()], `${row.MonsterId}-art`);
  const svg = await renderStatCardSvgFile({ header: "1x Normal", name: model.name, rows: statCardRowsFromModel(model), artFile: art, width: 1040 });
  if (!(await svg.text()).includes("stat-card-art-frame")) throw new Error(`${row.Name}: art frame missing from rendered SVG.`);
  console.log(`${source}\t${row.MonsterId}\t${row.Name}\t${svg.statCardWidth}x${svg.statCardHeight}`);
}
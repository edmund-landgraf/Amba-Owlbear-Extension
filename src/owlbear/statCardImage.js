import { dataUrlFromFile } from "./imageUtils.js";
import { actionIconGroup, iconLayoutSize, tokenizeStatValue } from "./pf2eActionIcons.js";

const INK = "#171412";
const PAPER = "#f4f1e9";
const RULE = "#171412";
const CHIP_COLORS = ["#405586", "#6f8b4b", "#844b3c", "#596974", "#7b663d"];
const BODY_SIZE = 20;
const BODY_LINE_HEIGHT = 25;

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function estimateTextWidth(text, size, bold = false) {
  return String(text ?? "").length * size * (bold ? 0.6 : 0.57);
}

function textNode({ x, y, text, size = BODY_SIZE, weight = "400", anchor = "start", fill = INK }) {
  return "<text x=\"" + x + "\" y=\"" + y + "\" text-anchor=\"" + anchor + "\" font-family=\"Arial, Helvetica, sans-serif\" font-size=\"" + size + "\" font-weight=\"" + weight + "\" fill=\"" + fill + "\">" + escapeXml(text) + "</text>";
}

function lineNode(x1, y, x2, width = 1.5) {
  return "<line x1=\"" + x1 + "\" y1=\"" + y + "\" x2=\"" + x2 + "\" y2=\"" + y + "\" stroke=\"" + RULE + "\" stroke-width=\"" + width + "\" />";
}

function imageNode(href, x, y, width, height) {
  if (!href) return "";
  return "<image href=\"" + escapeXml(href) + "\" x=\"" + x + "\" y=\"" + y + "\" width=\"" + width + "\" height=\"" + height + "\" preserveAspectRatio=\"xMidYMid meet\" />";
}

async function embeddedImage(file) {
  if (!file) return null;
  try { return await dataUrlFromFile(file); } catch { return null; }
}

function chipText(value) {
  return String(value ?? "").replace(/^Creature\s+[-+]?\d+\s*,?\s*/i, "").split(/,\s*/).map((part) => part.trim()).filter(Boolean);
}

function styledUnits(fragments) {
  const units = [];
  for (const fragment of fragments) {
    const raw = String(fragment.text ?? "");
    if (/^\s/.test(raw) && units.length && !/^\s+$/.test(units.at(-1)?.text ?? "")) {
      units.push({ text: " ", bold: fragment.bold });
    }
    for (const token of tokenizeStatValue(raw)) {
      if (token.icon) units.push(token);
      else for (const part of String(token.text ?? "").split(/(\s+)/).filter(Boolean)) units.push({ text: part, bold: fragment.bold });
    }
    if (/\s$/.test(raw) && units.length && !/^\s+$/.test(units.at(-1)?.text ?? "")) {
      units.push({ text: " ", bold: fragment.bold });
    }
  }
  return units;
}

function unitWidth(unit, size) {
  return unit.icon ? iconLayoutSize(size) + size * 0.12 : estimateTextWidth(unit.text, size, unit.bold);
}

function wrapUnits(units, maxWidth, size) {
  const lines = [];
  let current = [];
  let width = 0;
  for (const unit of units) {
    if (!unit.icon && /^\s+$/.test(unit.text) && current.length === 0) continue;
    const nextWidth = unitWidth(unit, size);
    if (current.length && width + nextWidth > maxWidth) {
      lines.push(current);
      current = [];
      width = 0;
      if (!unit.icon && /^\s+$/.test(unit.text)) continue;
    }
    current.push(unit);
    width += nextWidth;
  }
  if (current.length) lines.push(current);
  return lines.length ? lines : [[]];
}

function renderUnits(parts, units, x, y, size) {
  let cursor = x;
  let run = [];
  const flushText = () => {
    if (!run.length) return;
    const content = run.map((unit) => `<tspan font-weight="${unit.bold ? "700" : "400"}" xml:space="preserve">${escapeXml(unit.text)}</tspan>`).join("");
    parts.push(`<text x="${cursor}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${INK}">${content}</text>`);
    cursor += run.reduce((width, unit) => width + estimateTextWidth(unit.text, size, unit.bold), 0);
    run = [];
  };
  for (const unit of units) {
    if (!unit.icon) { run.push(unit); continue; }
    flushText();
    const iconSize = iconLayoutSize(size);
    parts.push(actionIconGroup(unit.icon, cursor, y - iconSize + 4, iconSize));
    cursor += iconSize + size * 0.12;
  }
  flushText();
}

function headerLayout(name, maxWidth) {
  for (let size = 31; size >= 20; size -= 1) {
    if (estimateTextWidth(name, size, true) <= maxWidth) return { lines: [name], size };
  }
  const words = String(name ?? "").split(/\s+/).filter(Boolean);
  const lines = ["", ""];
  for (const word of words) {
    const candidate = [lines[0], word].filter(Boolean).join(" ");
    if (estimateTextWidth(candidate, 20, true) <= maxWidth || !lines[0]) lines[0] = candidate;
    else lines[1] = [lines[1], word].filter(Boolean).join(" ");
  }
  return { lines: lines.filter(Boolean), size: 20 };
}

function defenseFragments(rows) {
  const fragments = [];
  for (const label of ["HP", "Immunities", "Weaknesses", "Resistances"]) {
    const value = rows.find((row) => row.label === label)?.value;
    if (!String(value ?? "").trim()) continue;
    if (fragments.length) fragments.push({ text: "; " });
    fragments.push({ text: label + " ", bold: true }, { text: String(value) });
  }
  return fragments;
}

function displayRows(rows) {
  const result = [];
  const defenses = defenseFragments(rows);
  let defensesAdded = false;
  for (const row of rows) {
    const label = row.label;
    const value = String(row.value ?? "").trim();
    if (!value || label === "Type" || label === "Flavor") continue;
    if (["HP", "Immunities", "Weaknesses", "Resistances"].includes(label)) {
      if (!defensesAdded && defenses.length) {
        result.push({ label: "", fragments: defenses, kind: "defense" });
        defensesAdded = true;
      }
      continue;
    }
    if (label === "Abilities") {
      result.push({ label: "", value: value.replace(/,\s*(?=(?:Str|Dex|Con|Int|Wis|Cha)\b)/g, "; "), kind: "abilities" });
      continue;
    }
    result.push({ label, value, kind: row.kind ?? (label ? label.toLocaleLowerCase() : "ability") });
  }
  return result;
}

function rowFragments(row) {
  if (row.fragments) return row.fragments;
  const fragments = [];
  if (row.label) fragments.push({ text: row.label + " ", bold: true });
  if (!row.label) {
    const match = row.value.match(/^(.{1,64}?)(?=\s+(?:>{1,3}|◆{1,3}|◇|↻|↺|Single Action|Two Actions|Three Actions|Free Action|Reaction))/);
    if (match) {
      fragments.push({ text: match[1], bold: true }, { text: row.value.slice(match[1].length) });
      return fragments;
    }
  }
  fragments.push({ text: row.value });
  return fragments;
}

export async function renderStatCardSvgFile({ header, name, rows, tokenFile, artFile, width = 1040 }) {
  const tokenData = await embeddedImage(tokenFile);
  const artData = await embeddedImage(artFile);
  const left = 10;
  const right = width - 10;
  const artBounds = artData ? { x: width - 314, y: 12, width: 300, height: 205 } : null;
  const topRight = artBounds ? artBounds.x - 14 : right;
  const typeRow = rows.find((row) => row.label === "Type");
  const creatureType = String(typeRow?.value ?? "").match(/\bCreature\s+[-+]?\d+\b/i)?.[0] ?? "";
  const traits = chipText(typeRow?.value);
  const bodyRows = displayRows(rows);
  const content = [];

  if (artData) {
    content.push("<rect id=\"stat-card-art-frame\" x=\"" + artBounds.x + "\" y=\"" + artBounds.y + "\" width=\"" + artBounds.width + "\" height=\"" + artBounds.height + "\" fill=\"#faf8f2\" stroke=\"" + RULE + "\" stroke-width=\"2\" />");
    content.push(imageNode(artData, artBounds.x + 7, artBounds.y + 7, artBounds.width - 14, artBounds.height - 14).replace("<image ", "<image id=\"stat-card-art\" "));
  }
  if (tokenData) content.push(imageNode(tokenData, 10, 10, 64, 64).replace("<image ", "<image id=\"stat-card-badge\" "));

  const titleLeft = tokenData ? 84 : left;
  const creatureSize = 28;
  const creatureWidth = creatureType ? estimateTextWidth(creatureType.toUpperCase(), creatureSize, true) : 0;
  const title = headerLayout(String(name ?? "").toUpperCase(), Math.max(130, topRight - titleLeft - creatureWidth - 46));
  if (header) content.push(textNode({ x: titleLeft, y: 25, text: header, size: 15, weight: "700" }));
  title.lines.forEach((line, index) => content.push(`<text id="${index ? "stat-card-title-continuation" : "stat-card-title"}" x="${titleLeft}" y="${55 + index * 25}" font-family="Arial, Helvetica, sans-serif" font-size="${title.size}" font-weight="700" fill="${INK}">${escapeXml(line)}</text>`));
  if (creatureType) content.push(`<text id="stat-card-creature" x="${topRight}" y="55" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${creatureSize}" font-weight="700" fill="${INK}">${escapeXml(creatureType.toUpperCase())}</text>`);
  const headerBottom = 62 + Math.max(0, title.lines.length - 1) * 25;
  content.push(lineNode(left, headerBottom, topRight, 2));

  let y = headerBottom + 38;
  if (traits.length) {
    content.push("<g id=\"stat-card-traits\">");
    let x = left;
    for (const [index, raw] of traits.entries()) {
      const label = raw.toUpperCase();
      const chipWidth = Math.max(44, label.length * 16 * 0.68 + 18);
      content.push("<rect x=\"" + x + "\" y=\"" + (y - 20) + "\" width=\"" + chipWidth + "\" height=\"25\" fill=\"" + CHIP_COLORS[index % CHIP_COLORS.length] + "\" />");
      content.push(textNode({ x: x + 8, y, text: label, size: 16, weight: "700", fill: "#fffdf7" }));
      x += chipWidth + 4;
    }
    content.push("</g>");
    y += 25;
  }

  for (const row of bodyRows) {
    const rowRight = artBounds && y < artBounds.y + artBounds.height + 8 ? topRight : right;
    if (["abilities", "ac", "speed"].includes(row.kind)) {
      content.push(lineNode(left, y - 8, rowRight));
      y += 11;
    }
    const hangingIndent = row.kind === "ability" ? 30 : 0;
    const lines = wrapUnits(styledUnits(rowFragments(row)), rowRight - left - hangingIndent, BODY_SIZE);
    for (let index = 0; index < lines.length; index += 1) {
      renderUnits(content, lines[index], left + (index > 0 ? 30 : hangingIndent), y, BODY_SIZE);
      y += BODY_LINE_HEIGHT;
    }
    if (row.kind === "speed") {
      content.push(lineNode(left, y - 7, right));
      y += 10;
    }
  }

  const minimumHeight = artBounds ? artBounds.y + artBounds.height + 12 : 170;
  const height = Math.max(minimumHeight, Math.ceil(y + 2));
  content.push("<line id=\"stat-card-final-rule\" x1=\"" + left + "\" y1=\"" + (height - 8) + "\" x2=\"" + right + "\" y2=\"" + (height - 8) + "\" stroke=\"" + RULE + "\" stroke-width=\"1.5\" />");
  const parts = [
    "<svg id=\"stat-card\" xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"0 0 " + width + " " + height + "\">",
    "<rect x=\"0\" y=\"0\" width=\"" + width + "\" height=\"" + height + "\" fill=\"" + PAPER + "\" />",
    ...content,
    "</svg>",
  ];
  const file = new File([parts.join("\n")], "stat-card.svg", { type: "image/svg+xml" });
  file.statCardWidth = width;
  file.statCardHeight = height;
  return file;
}

export const rasterizeStatCardPng = renderStatCardSvgFile;
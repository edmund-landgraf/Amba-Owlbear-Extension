import { dataUrlFromFile } from "./imageUtils.js";
import { actionIconGroup, iconLayoutSize, tokenizeStatValue } from "./pf2eActionIcons.js";

const INK = "#171412";
const PAPER = "#f6f2e9";
const RULE = "#615a52";
const CHIP_COLORS = ["#77716b", "#8a847e", "#514b46", "#6f6963", "#5e5852"];
const BODY_SIZE = 16;
const BODY_LINE_HEIGHT = 21;
const ABILITY_BODY_INDENT = 22;

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function estimateTextWidth(text, size, bold = false) {
  return String(text ?? "").length * size * (bold ? 0.6 : 0.57);
}

function textNode({ x, y, text, size = BODY_SIZE, weight = "400", anchor = "start", fill = INK }) {
  return "<text x=\"" + x + "\" y=\"" + y + "\" text-anchor=\"" + anchor + "\" font-family=\"Arial, Helvetica, sans-serif\" font-size=\"" + size + "\" font-weight=\"" + weight + "\" fill=\"" + fill + "\">" + escapeXml(text) + "</text>";
}

function lineNode(x1, y, x2, width = 1.1) {
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
  return String(value ?? "").replace(/^Creature\s+[-+]?\d+\s*,?\s*/i, "").split(/,\s*/).map((part) => part.trim()).filter((part) => part && !/^Recall$/i.test(part) && !/^Knowledge$/i.test(part) && !/^Recall Knowledge/i.test(part));
}

function styledUnits(fragments) {
  const units = [];
  for (const fragment of fragments) {
    if (fragment.break) {
      units.push({ break: true });
      continue;
    }
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
  if (unit.break) return 0;
  return unit.icon ? iconLayoutSize(size) + size * 0.12 : estimateTextWidth(unit.text, size, unit.bold);
}

function wrapUnits(units, maxWidth, size) {
  const lines = [];
  let current = [];
  let width = 0;
  for (const unit of units) {
    if (unit.break) {
      if (current.length) lines.push(current);
      current = [];
      width = 0;
      continue;
    }
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
    parts.push(actionIconGroup(unit.icon, cursor, y - iconSize + 3, iconSize));
    cursor += iconSize + size * 0.12;
  }
  flushText();
}

function headerLayout(name, maxWidth) {
  for (let size = 25; size >= 18; size -= 1) {
    if (estimateTextWidth(name, size, true) <= maxWidth) return { lines: [name], size };
  }
  const words = String(name ?? "").split(/\s+/).filter(Boolean);
  const lines = ["", ""];
  for (const word of words) {
    const candidate = [lines[0], word].filter(Boolean).join(" ");
    if (estimateTextWidth(candidate, 18, true) <= maxWidth || !lines[0]) lines[0] = candidate;
    else lines[1] = [lines[1], word].filter(Boolean).join(" ");
  }
  return { lines: lines.filter(Boolean), size: 18 };
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

function proseFragments(value) {
  const pieces = [];
  const marker = /\b(Critical Success|Critical Failure|Success|Failure|Frequency|Effect)\b/g;
  let cursor = 0;
  for (const match of value.matchAll(marker)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push({ text: value.slice(cursor, index) });
    pieces.push({ break: true }, { text: match[0] + " ", bold: true });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) pieces.push({ text: value.slice(cursor) });
  return pieces;
}

function rowFragments(row) {
  if (row.fragments) return row.fragments;
  const fragments = [];
  if (row.label) fragments.push({ text: row.label + " ", bold: true });
  if (!row.label) {
    const actionMatch = row.value.match(/^(.{1,72}?)\s+((?:>{1,3}|◆{1,3}|◇|↻|↺|[123]|Single Action|Two Actions|Three Actions|Free Action|Reaction))(\s*\([^)]*\))?\s*(.*)$/);
    if (actionMatch) {
      fragments.push(
        { text: actionMatch[1], bold: true },
        { text: " " + actionMatch[2] + (actionMatch[3] ?? "") }
      );
      if (actionMatch[4]) fragments.push({ break: true }, ...proseFragments(actionMatch[4]));
      return fragments;
    }
    const match = row.value.match(/^(.{1,64}?)(?=\s+(?:>{1,3}|◆{1,3}|◇|↻|↺|[123]|Single Action|Two Actions|Three Actions|Free Action|Reaction))/);
    if (match) {
      fragments.push({ text: match[1], bold: true }, { text: row.value.slice(match[1].length) });
      return fragments;
    }
  }
  fragments.push({ text: row.value });
  return fragments;
}

export async function renderStatCardSvgFile({ header, name, rows, tokenFile, artFile, width = 1400 }) {
  const tokenData = await embeddedImage(tokenFile);
  const artData = await embeddedImage(artFile);
  const left = 18;
  const right = width - 18;
  const artBounds = artData ? { x: width - 314, y: 18, width: 296, height: 202 } : null;
  const topRight = artBounds ? artBounds.x - 16 : right;
  const typeRow = rows.find((row) => row.label === "Type");
  const creatureType = String(typeRow?.value ?? "").match(/\bCreature\s+[-+]?\d+\b/i)?.[0] ?? "";
  const traits = chipText(typeRow?.value);
  const bodyRows = displayRows(rows);
  const content = [];

  if (artData) {
    content.push("<rect id=\"stat-card-art-frame\" x=\"" + artBounds.x + "\" y=\"" + artBounds.y + "\" width=\"" + artBounds.width + "\" height=\"" + artBounds.height + "\" fill=\"#faf8f2\" stroke=\"" + RULE + "\" stroke-width=\"1.5\" />");
    content.push(imageNode(artData, artBounds.x + 6, artBounds.y + 6, artBounds.width - 12, artBounds.height - 12).replace("<image ", "<image id=\"stat-card-art\" "));
  }
  if (tokenData) content.push(imageNode(tokenData, 18, 17, 44, 44).replace("<image ", "<image id=\"stat-card-badge\" "));

  const titleLeft = tokenData ? 72 : left;
  const creatureSize = 20;
  const creatureWidth = creatureType ? estimateTextWidth(creatureType.toUpperCase(), creatureSize, true) : 0;
  const title = headerLayout(String(name ?? "").toUpperCase(), Math.max(130, topRight - titleLeft - creatureWidth - 46));
  if (header) content.push(textNode({ x: titleLeft, y: 20, text: header, size: 12, weight: "700" }));
  title.lines.forEach((line, index) => content.push(`<text id="${index ? "stat-card-title-continuation" : "stat-card-title"}" x="${titleLeft}" y="${45 + index * 22}" font-family="Arial, Helvetica, sans-serif" font-size="${title.size}" font-weight="700" fill="${INK}">${escapeXml(line)}</text>`));
  if (creatureType) content.push(`<text id="stat-card-creature" x="${topRight}" y="45" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${creatureSize}" font-weight="700" fill="${INK}">${escapeXml(creatureType.toUpperCase())}</text>`);

  let y = 72 + Math.max(0, title.lines.length - 1) * 22;
  if (traits.length) {
    content.push("<g id=\"stat-card-traits\">");
    let x = left;
    for (const [index, raw] of traits.entries()) {
      const label = raw.toUpperCase();
      const chipWidth = Math.max(31, label.length * 11 * 0.68 + 13);
      content.push("<rect x=\"" + x + "\" y=\"" + (y - 16) + "\" width=\"" + chipWidth + "\" height=\"19\" fill=\"" + CHIP_COLORS[index % CHIP_COLORS.length] + "\" />");
      content.push(textNode({ x: x + 6, y, text: label, size: 11, weight: "700", fill: "#fffdf7" }));
      x += chipWidth + 4;
    }
    content.push("</g>");
    y += 18;
  }
  content.push(lineNode(left, y - 3, topRight, 1.8));
  y += 25;

  for (const row of bodyRows) {
    const rowRight = artBounds && y < artBounds.y + artBounds.height + 8 ? topRight : right;
    if (["abilities", "ac", "speed"].includes(row.kind)) {
      content.push(lineNode(left, y - 8, rowRight));
      y += 12;
    }
    const firstIndent = 0;
    const continuationIndent = row.kind === "ability" ? ABILITY_BODY_INDENT : 26;
    const lineWidth = rowRight - left - Math.max(firstIndent, continuationIndent);
    const lines = wrapUnits(styledUnits(rowFragments(row)), lineWidth, BODY_SIZE);
    for (let index = 0; index < lines.length; index += 1) {
      renderUnits(content, lines[index], left + (index > 0 ? continuationIndent : firstIndent), y, BODY_SIZE);
      y += BODY_LINE_HEIGHT;
    }
    if (row.kind === "ability") y += 2;
    if (row.kind === "speed") {
      content.push(lineNode(left, y - 7, right));
      y += 10;
    }
  }

  const minimumHeight = artBounds ? artBounds.y + artBounds.height + 18 : 170;
  const height = Math.max(minimumHeight, Math.ceil(y + 10));
  content.push("<line id=\"stat-card-final-rule\" x1=\"" + left + "\" y1=\"" + (height - 15) + "\" x2=\"" + right + "\" y2=\"" + (height - 15) + "\" stroke=\"" + RULE + "\" stroke-width=\"1.1\" />");
  const parts = [
    "<svg id=\"stat-card\" xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"0 0 " + width + " " + height + "\">",
    "<rect x=\"0\" y=\"0\" width=\"" + width + "\" height=\"" + height + "\" fill=\"" + PAPER + "\" />",
    "<rect x=\"1.5\" y=\"1.5\" width=\"" + (width - 3) + "\" height=\"" + (height - 3) + "\" rx=\"4\" fill=\"none\" stroke=\"" + RULE + "\" stroke-width=\"2\" />",
    ...content,
    "</svg>",
  ];
  const file = new File([parts.join("\n")], "stat-card.svg", { type: "image/svg+xml" });
  file.statCardWidth = width;
  file.statCardHeight = height;
  return file;
}

export const rasterizeStatCardPng = renderStatCardSvgFile;
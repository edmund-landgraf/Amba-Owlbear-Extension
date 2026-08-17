import { dataUrlFromFile } from "./imageUtils.js";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estimateTextWidth(text, fontSize, bold = false) {
  return String(text ?? "").length * fontSize * (bold ? 0.66 : 0.61);
}

function wrapLine(text, maxWidth, fontSize, bold = false) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (estimateTextWidth(next, fontSize, bold) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function textNode({ x, y, text, size = 17, weight = "400", fill = "#251f1a", family = "Consolas, ui-monospace, monospace" }) {
  return `<text x="${x}" y="${y}" font-family="${escapeXml(family)}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(text)}</text>`;
}

async function embeddedImage(file) {
  if (!file) return null;
  try {
    return await dataUrlFromFile(file);
  } catch {
    return null;
  }
}

function imageNode({ href, x, y, width, height }) {
  if (!href) return "";
  return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
}

export async function renderStatCardSvgFile({
  header,
  name,
  meta,
  rows,
  tokenFile,
  artFile,
  width = 1040,
  height = 760,
}) {
  const left = 40;
  const maxWidth = width - 80;
  const tokenData = await embeddedImage(tokenFile);
  const artData = await embeddedImage(artFile);
  const artBounds = artData ? { x: width - 320, y: 28, width: 280, height: 210 } : null;
  const textMaxWidth = artBounds ? artBounds.x - left - 24 : maxWidth;
  const parts = [];
  let y = tokenData ? 120 : 48;

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#f7f2e8"/>`);
  parts.push(`<rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="none" stroke="#4a4036" stroke-width="6"/>`);

  if (artData) {
    parts.push(`<rect x="${artBounds.x}" y="${artBounds.y}" width="${artBounds.width}" height="${artBounds.height}" fill="#fffaf0" stroke="#4a4036" stroke-width="2"/>`);
    parts.push(imageNode({ href: artData, x: artBounds.x + 8, y: artBounds.y + 8, width: artBounds.width - 16, height: artBounds.height - 16 }));
  }

  if (tokenData) {
    parts.push(imageNode({ href: tokenData, x: left - 16, y: 18, width: 80, height: 80 }));
  }

  parts.push(textNode({ x: left, y, text: header, size: 22, weight: "700" }));
  y += 34;

  for (const line of wrapLine(name, textMaxWidth, 28, true)) {
    parts.push(textNode({ x: left, y, text: line, size: 28, weight: "700" }));
    y += 36;
  }

  if (meta) {
    for (const line of wrapLine(meta, textMaxWidth, 16)) {
      parts.push(textNode({ x: left, y, text: line, size: 16 }));
      y += 23;
    }
    y += 8;
  }

  const lineHeight = 22;
  const labelSize = 17;
  const labelWidth = estimateTextWidth("Perception  ", labelSize, true);
  for (const { label, value } of rows) {
    if (y > height - 36) break;
    const labelText = `${String(label).padEnd(11, " ")} `;
    const wrapped = wrapLine(value, maxWidth - labelWidth, labelSize);
    for (let index = 0; index < wrapped.length; index += 1) {
      if (y > height - 36) break;
      if (index === 0) {
        parts.push(textNode({ x: left, y, text: labelText, size: labelSize, weight: "700" }));
      }
      parts.push(textNode({ x: left + labelWidth, y, text: wrapped[index], size: labelSize }));
      y += lineHeight;
    }
  }

  parts.push("</svg>");
  return new File([parts.join("\n")], "stat-card.svg", { type: "image/svg+xml" });
}

export const rasterizeStatCardPng = renderStatCardSvgFile;

import { TOKEN_COLORS } from "./encounterData.js";

const DARK_GLYPH = "#1f160f";
const LIGHT_GLYPH = "#ffffff";
const LIGHT_STROKE = "#f7efe2";
const GOLDEN_ANGLE = 137.508;

function parseHex(hex) {
  const value = String(hex ?? "").replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channelLuminance(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastingGlyphColors(hex) {
  const fillLum = relativeLuminance(hex);
  const whiteLum = relativeLuminance(LIGHT_GLYPH);
  const darkLum = relativeLuminance(DARK_GLYPH);
  if (contrastRatio(fillLum, darkLum) >= contrastRatio(fillLum, whiteLum)) {
    return { fill: DARK_GLYPH, stroke: LIGHT_STROKE };
  }
  return { fill: LIGHT_GLYPH, stroke: DARK_GLYPH };
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function extraFill(index, hueOffset) {
  const hue = (hueOffset + index * GOLDEN_ANGLE) % 360;
  const saturation = 62 + (index % 4) * 7;
  const lightness = 42 + (index % 3) * 8;
  return hslToHex(hue, saturation, lightness);
}

export function buildTokenFills(groupCount, { randomize = false } = {}) {
  const count = Math.max(0, Number(groupCount) || 0);
  if (!randomize) {
    return Array.from({ length: count }, (_, index) => TOKEN_COLORS[index % TOKEN_COLORS.length]);
  }

  const fills = shuffle(TOKEN_COLORS);
  const hueOffset = Math.random() * 360;
  let extraIndex = 0;
  while (fills.length < count) {
    fills.push(extraFill(extraIndex, hueOffset));
    extraIndex += 1;
  }
  return fills.slice(0, count);
}

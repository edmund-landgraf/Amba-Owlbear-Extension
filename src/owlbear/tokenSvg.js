function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const TOKEN_FONT_URL = "/fonts/CinzelDecorative-Bold.ttf";
const TOKEN_FONT_FAMILY = "CinzelDecorative, serif";

function tokenFontStyle(src = TOKEN_FONT_URL) {
  return `@font-face{font-family:"CinzelDecorative";src:url("${src}") format("truetype");font-weight:700;}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

let embeddedFontSrc;

async function embeddedTokenFontSrc() {
  if (embeddedFontSrc) return embeddedFontSrc;
  const response = await fetch(TOKEN_FONT_URL);
  if (!response.ok) throw new Error(`Unable to load token font: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  embeddedFontSrc = `data:font/ttf;base64,${bytesToBase64(bytes)}`;
  return embeddedFontSrc;
}

export async function svgFileWithEmbeddedTokenFont(svgFile) {
  const text = await svgFile.text();
  if (!text.includes(TOKEN_FONT_URL)) return svgFile;
  const src = await embeddedTokenFontSrc();
  return new File([text.replaceAll(TOKEN_FONT_URL, src)], svgFile.name, { type: "image/svg+xml" });
}

function tokenGlyphs(text, size) {
  const glyphs = Array.from(text || "?");
  if (glyphs.length <= 1) {
    return `<text x="256" y="282" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${size}"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="12"
        paint-order="stroke fill">${escapeXml(glyphs[0] || "?")}</text>`;
  }

  const hasSubscript = glyphs.length >= 4;
  const mainGlyphs = glyphs.slice(0, hasSubscript ? 3 : glyphs.length);
  const subscriptGlyph = hasSubscript ? glyphs[3] : null;
  if (hasSubscript && mainGlyphs.length === 3) {
    return [
      `<text x="212" y="282" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="250"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="12"
        paint-order="stroke fill">${escapeXml(mainGlyphs[0])}</text>`,
      `<text x="323" y="226" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="96"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="8"
        paint-order="stroke fill">${escapeXml(mainGlyphs[1])}</text>`,
      `<text x="323" y="310" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="96"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="8"
        paint-order="stroke fill">${escapeXml(mainGlyphs[2])}</text>`,
      `<text x="374" y="326" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="148"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="6"
        paint-order="stroke fill">${escapeXml(subscriptGlyph)}</text>`,
    ].join("\n  ");
  }

  const primarySize = Math.max(250, size);
  const secondarySize = mainGlyphs.length === 2 ? 142 : 120;
  const primaryWidth = primarySize * 0.62;
  const secondaryWidth = secondarySize * 0.62;
  const totalWidth = primaryWidth + secondaryWidth * (mainGlyphs.length - 1);
  const groupOffset = mainGlyphs.length >= 3 ? 26 : 0;
  let x = 256 - totalWidth / 2 + groupOffset;
  const parts = [];

  parts.push(`<text x="${x + primaryWidth / 2}" y="282" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${primarySize}"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="12"
        paint-order="stroke fill">${escapeXml(mainGlyphs[0])}</text>`);
  x += primaryWidth;

  for (const glyph of mainGlyphs.slice(1)) {
    parts.push(`<text x="${x + secondaryWidth / 2}" y="286" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${secondarySize}"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="8"
        paint-order="stroke fill">${escapeXml(glyph)}</text>`);
    x += secondaryWidth;
  }

  return parts.join("\n  ");
}
function letterMarkup({ label, name, color, fontSize, fallbackName }) {
  const title = escapeXml(name || label || fallbackName);
  const text = escapeXml(label || "?");
  const size = Number(fontSize) || 280;
  return { title, text, size, color: escapeXml(color) };
}

export function monsterTokenSvg({ label, name, color = "#7c3aed", fontSize = 170 }) {
  const { title, text, size, color: fill } = letterMarkup({
    label,
    name,
    color,
    fontSize,
    fallbackName: "Monster",
  });
  const fillId = `fill-${Math.random().toString(36).slice(2, 10)}`;
  const shadowId = `shadow-${Math.random().toString(36).slice(2, 10)}`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="${fillId}" cx="35%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="42%" stop-color="${fill}" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#1f160f" stop-opacity="0.98"/>
    </radialGradient>
    <filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <title>${title}</title>
  <circle cx="256" cy="256" r="222" fill="url(#${fillId})" stroke="#21170f" stroke-width="24" filter="url(#${shadowId})"/>
  <circle cx="256" cy="256" r="184" fill="none" stroke="#f7efe2" stroke-opacity="0.62" stroke-width="8"/>
  ${tokenGlyphs(text, size)}
</svg>`.trim();
}

export function letterTokenSvg({ label, name, color = "#7c3aed", fontSize = 300 }) {
  const { title, text, size, color: fill } = letterMarkup({
    label,
    name,
    color,
    fontSize,
    fallbackName: "PC",
  });
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <style><![CDATA[${tokenFontStyle()}]]></style>
  </defs>
  <title>${title}</title>
  <circle cx="256" cy="256" r="230" fill="${fill}" stroke="#ffffff" stroke-width="14"/>
  <text x="256" y="278" text-anchor="middle" dominant-baseline="middle"
        font-family="${TOKEN_FONT_FAMILY}" font-size="${size}"
        font-weight="700" fill="#ffffff">${text}</text>
</svg>`.trim();
}

export function monsterTokenSvgUrl(options) {
  return svgDataUrl(monsterTokenSvg(options));
}

export function letterTokenSvgUrl(options) {
  return svgDataUrl(letterTokenSvg(options));
}

export function firstLetterLabel(name) {
  const match = String(name ?? "").trim().match(/[a-z]/i);
  return match ? match[0].toUpperCase() : "?";
}

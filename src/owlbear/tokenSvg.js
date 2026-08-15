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

export function monsterTokenSvgUrl({ label, name, color = "#7c3aed", fontSize = 170 }) {
  const title = escapeXml(name || label || "Monster");
  const text = escapeXml(label || "?");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="fill" cx="35%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="42%" stop-color="${escapeXml(color)}" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#1f160f" stop-opacity="0.98"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <title>${title}</title>
  <circle cx="256" cy="256" r="222" fill="url(#fill)" stroke="#21170f" stroke-width="24" filter="url(#shadow)"/>
  <circle cx="256" cy="256" r="184" fill="none" stroke="#f7efe2" stroke-opacity="0.62" stroke-width="8"/>
  <text x="256" y="282" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${Number(fontSize) || 170}"
        font-weight="800" fill="#ffffff" stroke="#1f160f" stroke-width="12"
        paint-order="stroke fill">${text}</text>
</svg>`.trim();
  return svgDataUrl(svg);
}

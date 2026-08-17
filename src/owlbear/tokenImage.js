import { fetchImageBlob, imageSizeFromBlob, rasterizeSvgFile, sceneImageFromFile } from "./imageUtils.js";
import { labelFontSize } from "./monsterLabels.js";
import { monsterTokenSvg } from "./tokenSvg.js";

export async function rasterizedMonsterTokenFile({ label, name, color }) {
  const svg = monsterTokenSvg({ label, name, color, fontSize: labelFontSize(label) });
  const svgFile = new File([svg], `${label || "monster"}-token.svg`, { type: "image/svg+xml" });
  return rasterizeSvgFile(svgFile, `${label || "monster"}-token.png`, 512, 512);
}

export async function rasterizedMonsterArtTokenFile({ artUrl, name }) {
  let file = await fetchImageBlob(artUrl, `${name || "monster"}-art`);
  if (/svg/i.test(file.type) || /\.svg($|\?)/i.test(String(artUrl))) {
    file = await rasterizeSvgFile(file, `${name || "monster"}-art.png`, 512, 512);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const scale = Math.min(512 / bitmap.width, 512 / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    context.drawImage(bitmap, (512 - drawWidth) / 2, (512 - drawHeight) / 2, drawWidth, drawHeight);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(`Unable to render ${name || "monster"} art token`));
          return;
        }
        resolve(new File([blob], `${name || "monster"}-art-token.png`, { type: "image/png" }));
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

function fileFromDataUrl(url, filename) {
  const match = String(url).match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;(?:base64,)?/i);
  if (!match) return null;
  if (url.includes(";base64,")) {
    const binary = atob(url.slice(url.indexOf(",") + 1));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new File([bytes], filename, { type: match[1] || "image/svg+xml" });
  }
  const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
  return new File([svg], filename, { type: match[1] || "image/svg+xml" });
}

export async function rasterizedTokenInfo(url, filename) {
  const svgFile = fileFromDataUrl(url, `${filename}.svg`) ?? (await fetchImageBlob(url, `${filename}.svg`));
  if (!/svg/i.test(svgFile.type) && !/\.svg($|\?)/i.test(url)) {
    return sceneImageFromFile(svgFile);
  }

  const pngFile = await rasterizeSvgFile(svgFile, `${filename}.png`, 512, 512);
  return sceneImageFromFile(pngFile, { width: 512, height: 512, dpi: 512, mime: "image/png" });
}

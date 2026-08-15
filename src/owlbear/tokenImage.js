import { fetchImageBlob, imageSizeFromBlob, rasterizeSvgFile } from "./imageUtils.js";

export async function rasterizedTokenInfo(url, filename) {
  const svgFile = await fetchImageBlob(url, `${filename}.svg`);
  if (!/svg/i.test(svgFile.type) && !/\.svg($|\?)/i.test(url)) {
    const size = await imageSizeFromBlob(svgFile, filename);
    return {
      image: { ...size, url, mime: svgFile.type || "image/png" },
      grid: { dpi: Math.max(size.width, size.height), offset: { x: size.width / 2, y: size.height / 2 } },
    };
  }

  const pngFile = await rasterizeSvgFile(svgFile, `${filename}.png`, 512, 512);
  const objectUrl = URL.createObjectURL(pngFile);
  return {
    image: { width: 512, height: 512, url: objectUrl, mime: "image/png" },
    grid: { dpi: 512, offset: { x: 256, y: 256 } },
  };
}

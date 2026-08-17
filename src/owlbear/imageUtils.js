// Shared image helpers for Owlbear item and asset construction.
import { authFetchOptionsForUrl } from "../amba/ambaApi.js";
import { publishTokenPng } from "./tokenHost.js";
import { svgFileWithEmbeddedTokenFont } from "./tokenSvg.js";

export function safeName(value, fallback = "asset") {
  return String(value ?? fallback)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || fallback;
}

export async function fetchImageBlob(url, filename) {
  const response = await fetch(url, authFetchOptionsForUrl(url));
  if (!response.ok) throw new Error(`Unable to load ${filename}: ${response.status}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`${filename} was empty.`);
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export async function imageSizeFromBlob(blob, name) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`Unable to decode ${name} (${blob.type || "unknown type"}, ${blob.size ?? 0} bytes).`);
  }
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function mediumTokenFromFile(file, filename = file.name) {
  const size = await imageSizeFromBlob(file, filename);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(512 / size.width, 512 / size.height);
    const drawWidth = size.width * scale;
    const drawHeight = size.height * scale;
    context.drawImage(bitmap, (512 - drawWidth) / 2, (512 - drawHeight) / 2, drawWidth, drawHeight);
  } finally {
    bitmap.close();
  }
  const png = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`Unable to render ${filename}`));
        return;
      }
      resolve(new File([blob], filename.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" }));
    }, "image/png");
  });
  return sceneImageFromFile(png, { width: 512, height: 512, dpi: 512, mime: "image/png" });
}

export async function sceneImageFromFile(file, { width, height, dpi, mime } = {}) {
  const size =
    Number.isFinite(width) && Number.isFinite(height)
      ? { width, height }
      : await imageSizeFromBlob(file, file.name);
  const url = await publishTokenPng(file);
  const gridDpi = dpi ?? Math.max(size.width, size.height);
  return {
    file,
    image: { ...size, url, mime: mime || file.type || "image/png" },
    grid: { dpi: gridDpi, offset: { x: size.width / 2, y: size.height / 2 } },
  };
}

export async function imageInfoFromUrl(url, filename, fallbackType = "image/png", dpi) {
  let file = await fetchImageBlob(url, filename);
  if (/svg/i.test(file.type) || /\.svg($|\?)/i.test(String(url))) {
    const pngName = String(filename).replace(/\.svg$/i, "").replace(/\.png$/i, "") + ".png";
    file = await rasterizeSvgFile(file, pngName, 512, 512);
  }
  return sceneImageFromFile(file, { dpi, mime: file.type || fallbackType });
}

export function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Unable to encode ${file.name || "image"}`));
    reader.readAsDataURL(file);
  });
}

export async function overlayTokenOnImage(
  baseFile,
  tokenFile,
  { size, sizeRatio = 0.08, maxSize, margin, marginX, marginY, anchor = "top-right" } = {}
) {
  const base = await createImageBitmap(baseFile);
  const token = await createImageBitmap(tokenFile);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext("2d");
    context.drawImage(base, 0, 0);
    const tokenSize = Math.min(
      size ?? Math.round(Math.min(base.width, base.height) * sizeRatio),
      maxSize ?? Number.POSITIVE_INFINITY
    );
    const padX = marginX ?? margin ?? Math.round(Math.max(12, tokenSize * 0.35));
    const padY = marginY ?? margin ?? Math.round(Math.max(12, tokenSize * 0.35));
    const x = anchor === "top-left" ? padX : base.width - padX - tokenSize;
    const y = padY;
    context.drawImage(token, x, y, tokenSize, tokenSize);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(`Unable to overlay token on ${baseFile.name || "image"}`));
          return;
        }
        resolve(new File([blob], baseFile.name || "image.png", { type: "image/png" }));
      }, "image/png");
    });
  } finally {
    base.close();
    token.close();
  }
}

export async function rasterizeSvgFile(svgFile, filename, width, height) {
  const file = await svgFileWithEmbeddedTokenFont(svgFile);
  const svgText = await file.text();
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error(`Unable to render ${filename}`));
            return;
          }
          resolve(new File([blob], filename, { type: "image/png" }));
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode ${filename}`));
    };

    image.src = objectUrl;
  });
}

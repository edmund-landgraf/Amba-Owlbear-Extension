// Shared image helpers for Owlbear item and asset construction.
import { authFetchOptionsForUrl } from "../amba/ambaApi.js";

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

export async function imageInfoFromUrl(url, filename, fallbackType = "image/png", dpi) {
  const file = await fetchImageBlob(url, filename);
  const size = await imageSizeFromBlob(file, filename);
  const objectUrl = URL.createObjectURL(file);
  const gridDpi = dpi ?? Math.max(size.width, size.height);
  return {
    file,
    image: { ...size, url: objectUrl, mime: file.type || fallbackType },
    grid: { dpi: gridDpi, offset: { x: size.width / 2, y: size.height / 2 } },
  };
}

export function rasterizeSvgFile(svgFile, filename, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(svgFile);

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

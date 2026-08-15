import OBR from "@owlbear-rodeo/sdk";

export const NS = "com.adventuremakerbyact.owlbear";

export function boundsFromImageInfo(imageInfo, position) {
  const width = imageInfo.image.width;
  const height = imageInfo.image.height;
  return {
    min: { x: position.x - width / 2, y: position.y - height / 2 },
    max: { x: position.x + width / 2, y: position.y + height / 2 },
    width,
    height,
  };
}

export function boundsFromItems(items) {
  if (!items.length) return null;
  const points = items.map((item) => item.position);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function combineBounds(...boundsList) {
  const bounds = boundsList.filter(Boolean);
  if (!bounds.length) return null;

  const minX = Math.min(...bounds.map((entry) => entry.min.x));
  const minY = Math.min(...bounds.map((entry) => entry.min.y));
  const maxX = Math.max(...bounds.map((entry) => entry.max.x));
  const maxY = Math.max(...bounds.map((entry) => entry.max.y));
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY,
  };
}

export async function getSceneBoundsForLayers(layers) {
  const items = await OBR.scene.items.getItems((item) => layers.includes(item.layer));
  if (!items.length) return null;

  try {
    const bounds = await OBR.scene.items.getItemBounds(items.map((item) => item.id));
    if (bounds) return bounds;
  } catch {
    // Some item types or transient scene states can fail bounds lookup. A
    // position-only fallback is still enough to keep imports out of the way.
  }

  return boundsFromItems(items);
}

export function gridPosition(index, { startX, startY, columns, gapX, gapY }) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: startX + column * gapX,
    y: startY + row * gapY,
  };
}

export function rightOfBounds(bounds, margin = 800) {
  if (!bounds) return { x: 3600, y: 200 };
  return {
    x: bounds.max.x + margin,
    y: bounds.min.y,
  };
}

export function belowBounds(bounds, margin = 500) {
  if (!bounds) return { x: 200, y: 900 };
  return {
    x: bounds.min.x,
    y: bounds.max.y + margin,
  };
}

export function imagePositionRightOfBounds(bounds, imageInfo, margin = 800) {
  if (!bounds) return { x: 600, y: 600 };
  return {
    x: bounds.max.x + margin + imageInfo.image.width / 2,
    y: bounds.min.y + imageInfo.image.height / 2,
  };
}

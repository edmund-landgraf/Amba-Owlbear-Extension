function numeric(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

export function mapGridOffset(grid, imageSize) {
  const raw = grid?.offset ?? grid?.gridOffset;
  const x = finiteNumber(raw?.x ?? grid?.offsetX ?? grid?.originX);
  const y = finiteNumber(raw?.y ?? grid?.offsetY ?? grid?.originY);
  if (x != null && y != null) return { x, y };
  return {
    x: (imageSize?.width ?? 0) / 2,
    y: (imageSize?.height ?? 0) / 2,
  };
}

function dpiAxisWarnings(imageSize, columns, rows, cellSize) {
  const warnings = [];
  if (!imageSize?.width || !imageSize?.height || !columns || !rows) return warnings;

  const dpiX = imageSize.width / columns;
  const dpiY = imageSize.height / rows;
  const average = (dpiX + dpiY) / 2;
  if (average > 0 && Math.abs(dpiX - dpiY) / average > 0.05) {
    warnings.push(
      `Map dpiX (${dpiX.toFixed(1)}) and dpiY (${dpiY.toFixed(1)}) differ; export metadata or raster size may be inconsistent.`
    );
  }
  if (cellSize && Math.abs(dpiX - cellSize) / cellSize > 0.05) {
    warnings.push(
      `AMBA cellSize ${Math.round(cellSize)} does not match width/columns (${dpiX.toFixed(1)}px).`
    );
  }
  return warnings;
}

function withGridAlignment(gridResult, explicitGrid, imageSize) {
  const warnings = [...(gridResult.warnings ?? []), ...dpiAxisWarnings(imageSize, gridResult.columns, gridResult.rows, gridResult.cellSize)];
  return {
    ...gridResult,
    offset: mapGridOffset(explicitGrid, imageSize),
    warnings,
  };
}

export function explicitMapGrid(grid, imageSize) {
  if (!grid) return null;
  const cellSize = numeric(grid.cellSize ?? grid.dpi);
  const columns = numeric(grid.columns);
  const rows = numeric(grid.rows);
  const scale = grid.scale ?? grid.gridScale ?? "5 ft";

  if (cellSize) {
    return withGridAlignment(
      {
        cellSize,
        columns: columns ?? (imageSize?.width ? Math.round(imageSize.width / cellSize) : null),
        rows: rows ?? (imageSize?.height ? Math.round(imageSize.height / cellSize) : null),
        scale,
        source: "metadata",
      },
      grid,
      imageSize
    );
  }

  if (columns && rows && imageSize?.width && imageSize?.height) {
    return withGridAlignment(
      {
        cellSize: (imageSize.width / columns + imageSize.height / rows) / 2,
        columns,
        rows,
        scale,
        source: "metadata",
      },
      grid,
      imageSize
    );
  }

  return null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * pct)))];
}

function smooth(values) {
  return values.map((value, index) => {
    const prev = values[index - 1] ?? value;
    const next = values[index + 1] ?? value;
    return (prev + value + next) / 3;
  });
}

function peakCenters(values) {
  const smoothed = smooth(values);
  const threshold = percentile(smoothed, 0.86);
  const centers = [];
  let start = null;

  for (let index = 0; index < smoothed.length; index += 1) {
    if (smoothed[index] >= threshold) {
      if (start == null) start = index;
      continue;
    }

    if (start != null) {
      if (index - start <= 6) centers.push((start + index - 1) / 2);
      start = null;
    }
  }

  if (start != null && smoothed.length - start <= 6) {
    centers.push((start + smoothed.length - 1) / 2);
  }

  return centers;
}

function likelyPeriod(centers, min, max) {
  const spacings = [];
  for (let index = 1; index < centers.length; index += 1) {
    const spacing = centers[index] - centers[index - 1];
    if (spacing >= min && spacing <= max) spacings.push(spacing);
  }

  return median(spacings);
}

function axisBrightness(imageData, width, height, axis) {
  const values = [];
  const start = Math.floor((axis === "x" ? height : width) * 0.22);
  const end = Math.floor((axis === "x" ? height : width) * 0.82);

  const outer = axis === "x" ? width : height;
  for (let major = 0; major < outer; major += 1) {
    let total = 0;
    let count = 0;

    for (let minor = start; minor < end; minor += 1) {
      const x = axis === "x" ? major : minor;
      const y = axis === "x" ? minor : major;
      const offset = (y * width + x) * 4;
      total += imageData[offset] * 0.299 + imageData[offset + 1] * 0.587 + imageData[offset + 2] * 0.114;
      count += 1;
    }

    values.push(total / Math.max(1, count));
  }

  return values;
}

async function inferPeriodFromImage(file) {
  if (!file) return null;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height).data;
    const min = Math.max(18, Math.min(width, height) / 40);
    const max = Math.max(45, Math.min(width, height) / 8);
    const xPeriod = likelyPeriod(peakCenters(axisBrightness(imageData, width, height, "x")), min, max);
    const yPeriod = likelyPeriod(peakCenters(axisBrightness(imageData, width, height, "y")), min, max);
    const period = xPeriod && yPeriod ? (xPeriod + yPeriod) / 2 : xPeriod ?? yPeriod;
    return period ? period / scale : null;
  } finally {
    bitmap.close();
  }
}

export async function inferMapGrid(imageInfo, explicitGrid) {
  const imageSize = imageInfo?.image;
  const explicit = explicitMapGrid(explicitGrid, imageSize);
  if (explicit) return explicit;

  const inferredCellSize = await inferPeriodFromImage(imageInfo?.file).catch(() => null);
  if (inferredCellSize && imageSize?.width && imageSize?.height) {
    return withGridAlignment(
      {
        cellSize: inferredCellSize,
        columns: Math.round(imageSize.width / inferredCellSize),
        rows: Math.round(imageSize.height / inferredCellSize),
        scale: explicitGrid?.scale ?? explicitGrid?.gridScale ?? "5 ft",
        source: "inferred",
        warnings: ["Grid cell size was inferred from the map image."],
      },
      explicitGrid,
      imageSize
    );
  }

  if (imageSize?.width && imageSize?.height) {
    const cellSize = Math.max(imageSize.width, imageSize.height);
    return withGridAlignment(
      {
        cellSize,
        columns: Math.max(1, Math.round(imageSize.width / cellSize)),
        rows: Math.max(1, Math.round(imageSize.height / cellSize)),
        scale: explicitGrid?.scale ?? explicitGrid?.gridScale ?? "5 ft",
        source: "fallback",
        warnings: [
          "No AMBA grid metadata and image inference failed. Map was sized as one square (max edge). Align manually in Owlbear.",
        ],
      },
      explicitGrid,
      imageSize
    );
  }

  return null;
}


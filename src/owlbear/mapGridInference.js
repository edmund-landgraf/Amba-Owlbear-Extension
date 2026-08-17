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
  if (columns === 1 && rows === 1) return warnings;

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

function withGridAlignment(gridResult, explicitGrid, imageSize, options = {}) {
  const warnings = [
    ...(gridResult.warnings ?? []),
    ...(options.dpiWarnings === false
      ? []
      : dpiAxisWarnings(imageSize, gridResult.columns, gridResult.rows, gridResult.cellSize)),
  ];
  return {
    ...gridResult,
    offset: gridResult.offset ?? mapGridOffset(explicitGrid, imageSize),
    warnings,
  };
}

export function explicitMapGrid(grid, imageSize) {
  if (!grid) return null;
  let cellSize = numeric(
    grid.cellSize ?? grid.dpi ?? grid.gridSize ?? grid.pixelsPerSquare ?? grid.squareSize
  );
  let columns = numeric(grid.columns ?? grid.cols ?? grid.squaresWide ?? grid.gridWidth);
  let rows = numeric(grid.rows ?? grid.squaresHigh ?? grid.gridHeight);
  const pixelWidth = numeric(grid.width) ?? numeric(imageSize?.width);
  const pixelHeight = numeric(grid.height) ?? numeric(imageSize?.height);
  const scale = grid.scale ?? grid.gridScale ?? "5 ft";

  if (!columns && !rows && pixelWidth && pixelHeight) {
    const maybeColumns = numeric(grid.width);
    const maybeRows = numeric(grid.height);
    if (maybeColumns && maybeRows && maybeColumns <= 256 && maybeRows <= 256 && (!imageSize?.width || maybeColumns !== imageSize.width)) {
      columns = maybeColumns;
      rows = maybeRows;
    }
  }

  const width = imageSize?.width ?? pixelWidth;
  const height = imageSize?.height ?? pixelHeight;

  if (cellSize && imageSize?.width && Math.abs(cellSize - Math.max(imageSize.width, imageSize.height ?? 0)) / cellSize < 0.05) {
    cellSize = null;
  }

  if (cellSize) {
    const nextColumns = columns ?? (width ? Math.round(width / cellSize) : null);
    const nextRows = rows ?? (height ? Math.round(height / cellSize) : null);
    const dpi =
      nextColumns && nextRows && width && height
        ? (width / nextColumns + height / nextRows) / 2
        : cellSize;
    return withGridAlignment(
      {
        cellSize: dpi,
        columns: nextColumns,
        rows: nextRows,
        scale,
        source: "metadata",
      },
      grid,
      imageSize ?? { width, height }
    );
  }

  if (columns && rows && width && height) {
    return withGridAlignment(
      {
        cellSize: (width / columns + height / rows) / 2,
        columns,
        rows,
        offset: mapGridOffset(grid, imageSize ?? { width, height }),
        scale,
        source: "metadata",
      },
      grid,
      imageSize ?? { width, height }
    );
  }

  return null;
}

function movingAverage(values, windowSize) {
  const radius = Math.max(1, Math.floor(windowSize / 2));
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (value == null) continue;
      total += value;
      count += 1;
    }
    return total / Math.max(1, count);
  });
}

function detrend(values) {
  const trend = movingAverage(values, Math.max(21, Math.round(values.length / 24)));
  return values.map((value, index) => value - trend[index]);
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function bestLag(values, min, max) {
  const centered = detrend(values);
  const energy = variance(centered);
  if (energy < 1) return null;

  let best = null;
  for (let lag = min; lag <= max; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let index = 0; index + lag < centered.length; index += 1) {
      sum += centered[index] * centered[index + lag];
      count += 1;
    }
    const score = count ? sum / count / energy : 0;
    if (!best || score > best.score) best = { lag, score };
  }

  return best?.score > 0.12 ? best : null;
}

function linePhase(values, period) {
  const width = Math.max(1, Math.round(period));
  const folded = Array.from({ length: width }, () => 0);
  const counts = Array.from({ length: width }, () => 0);
  for (let index = 0; index < values.length; index += 1) {
    const phase = index % width;
    folded[phase] += values[index];
    counts[phase] += 1;
  }
  const means = folded.map((total, index) => total / Math.max(1, counts[index]));
  const average = means.reduce((sum, value) => sum + value, 0) / means.length;
  let minIndex = 0;
  let maxIndex = 0;
  for (let index = 1; index < means.length; index += 1) {
    if (means[index] < means[minIndex]) minIndex = index;
    if (means[index] > means[maxIndex]) maxIndex = index;
  }
  return average - means[minIndex] >= means[maxIndex] - average ? minIndex : maxIndex;
}

function owlbearMapGrid(imageSize, originX, originY, period) {
  const columns = Math.max(1, Math.round(imageSize.width / period));
  const rows = Math.max(1, Math.round(imageSize.height / period));
  const dpiX = imageSize.width / columns;
  const dpiY = imageSize.height / rows;
  return {
    cellSize: (dpiX + dpiY) / 2,
    columns,
    rows,
    offset: { x: originX, y: originY },
  };
}

function axisBrightness(imageData, width, height, axis) {
  const values = [];
  const start = Math.floor((axis === "x" ? height : width) * 0.08);
  const end = Math.floor((axis === "x" ? height : width) * 0.92);
  const step = Math.max(1, Math.round((end - start) / 220));

  const outer = axis === "x" ? width : height;
  for (let major = 0; major < outer; major += 1) {
    let total = 0;
    let count = 0;

    for (let minor = start; minor < end; minor += step) {
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

async function inferGridFromImage(file, imageSize) {
  if (!file || !imageSize?.width || !imageSize?.height) return null;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height).data;
    const minDim = Math.min(width, height);
    const min = Math.max(8, Math.round(minDim / 80));
    const max = Math.max(min + 4, Math.round(minDim / 4));
    const xProfile = axisBrightness(imageData, width, height, "x");
    const yProfile = axisBrightness(imageData, width, height, "y");
    const xLag = bestLag(xProfile, min, max);
    const yLag = bestLag(yProfile, min, max);
    const period = xLag && yLag ? (xLag.lag + yLag.lag) / 2 : xLag?.lag ?? yLag?.lag;
    if (!period) return null;
    if (xLag && yLag && Math.abs(xLag.lag - yLag.lag) / period > 0.2) return null;

    const cellPeriod = period / scale;
    const originX = (xLag ? linePhase(xProfile, xLag.lag) : 0) / scale;
    const originY = (yLag ? linePhase(yProfile, yLag.lag) : 0) / scale;
    const grid = owlbearMapGrid(imageSize, originX, originY, cellPeriod);
    if (grid.columns < 4 || grid.rows < 4) return null;
    return grid;
  } finally {
    bitmap.close();
  }
}

export async function inferMapGrid(imageInfo, explicitGrid) {
  const imageSize = imageInfo?.image;
  const explicit = explicitMapGrid(explicitGrid, imageSize);
  const fromImage = await inferGridFromImage(imageInfo?.file, imageSize).catch(() => null);

  if (fromImage) {
    const warnings = ["Map grid was measured from printed grid lines."];
    if (explicit?.cellSize && Math.abs(explicit.cellSize - fromImage.cellSize) / fromImage.cellSize > 0.1) {
      warnings.push(
        `AMBA cellSize ${Math.round(explicit.cellSize)}px was replaced with measured ${Math.round(fromImage.cellSize)}px.`
      );
    }
    return withGridAlignment(
      {
        ...fromImage,
        scale: explicit?.scale ?? explicitGrid?.scale ?? explicitGrid?.gridScale ?? "5 ft",
        source: "inferred",
        warnings,
      },
      explicitGrid,
      imageSize
    );
  }

  if (explicit) return explicit;

  if (imageSize?.width && imageSize?.height) {
    const defaultCellSize = 140;
    const columns = Math.max(1, Math.round(imageSize.width / defaultCellSize));
    const rows = Math.max(1, Math.round(imageSize.height / defaultCellSize));
    return withGridAlignment(
      {
        cellSize: (imageSize.width / columns + imageSize.height / rows) / 2,
        columns,
        rows,
        offset: { x: 0, y: 0 },
        scale: explicitGrid?.scale ?? explicitGrid?.gridScale ?? "5 ft",
        source: "fallback",
        warnings: [
          "AMBA sent no grid metadata; sized at 140px per square. Align manually in Owlbear.",
        ],
      },
      explicitGrid,
      imageSize,
      { dpiWarnings: false }
    );
  }

  return null;
}


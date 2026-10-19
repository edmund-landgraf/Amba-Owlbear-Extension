import assert from "node:assert/strict";
import test from "node:test";
import { explicitMapGrid, inferMapGrid } from "./mapGridInference.js";

function currentMapCenter(visualCenter, imageSize, grid, sceneDpi) {
  const cellSize = grid?.cellSize;
  const offset = grid?.offset ?? { x: imageSize.width / 2, y: imageSize.height / 2 };
  if (!cellSize) return visualCenter;
  const worldPerPixel = sceneDpi / cellSize;
  return {
    x: visualCenter.x + (offset.x - imageSize.width / 2) * worldPerPixel,
    y: visualCenter.y + (offset.y - imageSize.height / 2) * worldPerPixel,
  };
}

test("columns and rows become Owlbear dpi in image pixels per square", () => {
  const grid = explicitMapGrid(
    { cellSize: 256, columns: 20, rows: 10, scale: "5 ft" },
    { width: 2000, height: 1000 }
  );
  assert.equal(grid.cellSize, 100);
  assert.equal(grid.columns, 20);
  assert.equal(grid.rows, 10);
  assert.equal(grid.scale, "5 ft");
});

test("staged map center uses image pixels instead of scene squares", () => {
  const image = { width: 2000, height: 1000 };
  const grid = explicitMapGrid({ columns: 20, rows: 10 }, image);
  const sceneDpi = 150;
  const start = { x: 200, y: 200 };
  const stagedCenter = { x: start.x + image.width / 2, y: start.y + image.height / 2 };
  const sent = currentMapCenter(stagedCenter, image, grid, sceneDpi);

  const squareCountX = image.width / grid.cellSize;
  const alignedCenter = {
    x: start.x + (squareCountX * sceneDpi) / 2,
    y: start.y + (image.height / grid.cellSize * sceneDpi) / 2,
  };

  assert.deepEqual(sent, { x: 1200, y: 700 });
  assert.deepEqual(alignedCenter, { x: 1700, y: 950 });
  assert.equal((alignedCenter.x - sent.x) / sceneDpi, 500 / 150);
});

test("a second import applies the offset shift again", () => {
  const image = { width: 2000, height: 1000 };
  const grid = { cellSize: 100, offset: { x: 0, y: 0 } };
  const first = currentMapCenter({ x: 1200, y: 700 }, image, grid, 150);
  const second = currentMapCenter(first, image, grid, 150);
  assert.deepEqual(first, { x: -300, y: -50 });
  assert.deepEqual(second, { x: -1800, y: -800 });
});

test("missing grid metadata falls back to 140px squares", async () => {
  const grid = await inferMapGrid({ image: { width: 1400, height: 700 } }, null);
  assert.equal(grid.source, "fallback");
  assert.equal(grid.columns, 10);
  assert.equal(grid.rows, 5);
  assert.ok(Math.abs(grid.cellSize - 140) < 0.01);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLUSTER_COLUMN_GAP,
  CLUSTER_OFFSET_GAP,
  CLUSTER_START,
  clusterOriginForMap,
  combineBounds,
  monsterColumnOrigin,
  rightOfBounds,
} from "./layout.js";

const mapInfo = { image: { width: 1000, height: 800 } };

test("clusterOriginForMap centers the map on the cluster top-left", () => {
  assert.deepEqual(clusterOriginForMap(CLUSTER_START, mapInfo), { x: 700, y: 600 });
});

test("monster column sits immediately to the right of the map", () => {
  const origin = CLUSTER_START;
  const mapPosition = clusterOriginForMap(origin, mapInfo);
  const mapBounds = {
    min: { x: origin.x, y: origin.y },
    max: { x: origin.x + mapInfo.image.width, y: origin.y + mapInfo.image.height },
    width: mapInfo.image.width,
    height: mapInfo.image.height,
  };
  const column = monsterColumnOrigin(origin, mapBounds);
  assert.equal(column.x, mapBounds.max.x + CLUSTER_COLUMN_GAP);
  assert.equal(column.y, origin.y);
  assert.ok(column.x - mapPosition.x < mapInfo.image.width / 2 + CLUSTER_COLUMN_GAP + 1);
});

test("monster column uses the cluster origin when there is no map", () => {
  assert.deepEqual(monsterColumnOrigin(CLUSTER_START, null), CLUSTER_START);
});

test("map plus column pack into a tight AABB and the next origin is to the right", () => {
  const origin = CLUSTER_START;
  const mapBounds = {
    min: { x: origin.x, y: origin.y },
    max: { x: origin.x + 1000, y: origin.y + 800 },
    width: 1000,
    height: 800,
  };
  const columnOrigin = monsterColumnOrigin(origin, mapBounds);
  const cardBounds = {
    min: { x: columnOrigin.x, y: columnOrigin.y },
    max: { x: columnOrigin.x + 1040, y: columnOrigin.y + 760 },
    width: 1040,
    height: 760,
  };
  const cluster = combineBounds(mapBounds, cardBounds);
  assert.equal(cluster.min.x, origin.x);
  assert.equal(cluster.min.y, origin.y);
  assert.equal(cluster.max.x, cardBounds.max.x);
  const next = rightOfBounds(cluster, CLUSTER_OFFSET_GAP);
  assert.equal(next.x, cluster.max.x + CLUSTER_OFFSET_GAP);
  assert.equal(next.y, cluster.min.y);
  assert.ok(next.x > cluster.max.x);
});

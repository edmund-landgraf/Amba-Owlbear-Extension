import assert from "node:assert/strict";
import { test } from "node:test";
import { CLUSTER_OFFSET_GAP, CLUSTER_START } from "./layout.js";
import {
  nextClusterOrigin,
  placementTableEntries,
  recordCluster,
  resetPlacementTable,
  seedClusterFromBounds,
} from "./placementTable.js";

test("empty table uses the blank-scene start origin", () => {
  resetPlacementTable("scene-a");
  assert.deepEqual(nextClusterOrigin("scene-a"), CLUSTER_START);
});

test("recording a cluster offsets the next origin to the right", () => {
  resetPlacementTable("scene-a");
  const origin = nextClusterOrigin("scene-a");
  const bounds = {
    min: { x: 200, y: 200 },
    max: { x: 1400, y: 1000 },
    width: 1200,
    height: 800,
  };
  recordCluster("scene-a", { encounterId: "enc-1", origin, bounds });
  const next = nextClusterOrigin("scene-a");
  assert.equal(next.x, bounds.max.x + CLUSTER_OFFSET_GAP);
  assert.equal(next.y, bounds.min.y);
  assert.equal(placementTableEntries().length, 1);
});

test("changing scene id resets the table", () => {
  resetPlacementTable("scene-a");
  recordCluster("scene-a", {
    encounterId: "enc-1",
    origin: CLUSTER_START,
    bounds: { min: { x: 0, y: 0 }, max: { x: 500, y: 500 }, width: 500, height: 500 },
  });
  assert.deepEqual(nextClusterOrigin("scene-b"), CLUSTER_START);
  assert.equal(placementTableEntries().length, 0);
});

test("seed from existing bounds only applies when the table is empty", () => {
  resetPlacementTable("scene-a");
  const existing = {
    min: { x: 10, y: 20 },
    max: { x: 410, y: 220 },
    width: 400,
    height: 200,
  };
  assert.equal(seedClusterFromBounds("scene-a", existing, "prior"), true);
  assert.equal(seedClusterFromBounds("scene-a", existing, "again"), false);
  const next = nextClusterOrigin("scene-a");
  assert.equal(next.x, existing.max.x + CLUSTER_OFFSET_GAP);
  assert.equal(next.y, existing.min.y);
});

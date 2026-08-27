import { CLUSTER_OFFSET_GAP, CLUSTER_START, rightOfBounds } from "./layout.js";

let sceneId = null;
let clusters = [];

export function resetPlacementTable(nextSceneId = null) {
  sceneId = nextSceneId;
  clusters = [];
}

function ensureScene(nextSceneId) {
  if (sceneId !== nextSceneId) resetPlacementTable(nextSceneId);
}

export function nextClusterOrigin(nextSceneId) {
  ensureScene(nextSceneId);
  if (!clusters.length) return { ...CLUSTER_START };
  return rightOfBounds(clusters[clusters.length - 1].bounds, CLUSTER_OFFSET_GAP);
}

export function recordCluster(nextSceneId, entry) {
  ensureScene(nextSceneId);
  if (!entry?.bounds) return;
  clusters.push({
    encounterId: entry.encounterId ?? "",
    origin: entry.origin ? { ...entry.origin } : { ...CLUSTER_START },
    bounds: entry.bounds,
  });
}

export function seedClusterFromBounds(nextSceneId, bounds, encounterId = "") {
  ensureScene(nextSceneId);
  if (clusters.length || !bounds) return false;
  recordCluster(nextSceneId, {
    encounterId,
    origin: { x: bounds.min.x, y: bounds.min.y },
    bounds,
  });
  return true;
}

export function placementTableEntries() {
  return clusters.map((entry) => ({ ...entry, origin: { ...entry.origin } }));
}

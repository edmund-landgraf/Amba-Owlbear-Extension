import OBR from "@owlbear-rodeo/sdk";
import { NS } from "./layout.js";

export const META = {
  scene: `${NS}/scene`,
  moduleId: `${NS}/moduleId`,
  encounterId: `${NS}/encounterId`,
  kind: `${NS}/kind`,
  sourceId: `${NS}/sourceId`,
  monsterId: `${NS}/monsterId`,
  tokenInstanceId: `${NS}/tokenInstanceId`,
};

export function encounterItemMetadata({
  moduleId,
  encounterId,
  kind,
  sourceId,
  monsterId,
  tokenInstanceId,
}) {
  return {
    [META.moduleId]: moduleId,
    [META.encounterId]: encounterId,
    [META.kind]: kind,
    ...(sourceId ? { [META.sourceId]: sourceId } : {}),
    ...(monsterId ? { [META.monsterId]: monsterId } : {}),
    ...(tokenInstanceId ? { [META.tokenInstanceId]: tokenInstanceId } : {}),
  };
}

export function hasEncounterIdentity(item, moduleId, encounterId) {
  return item.metadata?.[META.moduleId] === moduleId && item.metadata?.[META.encounterId] === encounterId;
}

export function findImportedItem(items, { kind, sourceId, tokenInstanceId }) {
  return items.find((item) => {
    const metadata = item.metadata ?? {};
    if (metadata[META.kind] !== kind) return false;
    if (sourceId && metadata[META.sourceId] !== sourceId) return false;
    if (tokenInstanceId && metadata[META.tokenInstanceId] !== tokenInstanceId) return false;
    return true;
  });
}

export async function getImportedEncounterItems(moduleId, encounterId) {
  return OBR.scene.items.getItems((item) => hasEncounterIdentity(item, moduleId, encounterId));
}

export function isMonsterStagingKind(kind) {
  return kind === "monster-token" || kind === "monster-stat-card" || kind === "monster-stat-card-text";
}

export async function getEncounterSceneMetadata() {
  const metadata = await OBR.scene.getMetadata();
  return metadata?.[META.scene] ?? null;
}

export async function saveEncounterSceneMetadata({ moduleId, encounterId, title, lastPlacement }) {
  const metadata = await OBR.scene.getMetadata();
  const previous = metadata?.[META.scene] ?? {};
  await OBR.scene.setMetadata({
    ...metadata,
    [META.scene]: {
      ...previous,
      moduleId,
      encounterId,
      title,
      updatedAt: new Date().toISOString(),
      ...(lastPlacement ? { lastPlacement } : {}),
    },
  });
}

import { saveOwlbearPlacements } from "../amba/ambaApi.js";
import { EXPORT_SCHEMA_VERSION, validateExportDocument } from "./exportSchema.js";
import { encounterId } from "./encounterData.js";
import { getImportedEncounterItems, META } from "./encounterMetadata.js";

function sourceUrlFromItem(item) {
  const description = String(item.description ?? "");
  const match = description.match(/https?:\/\/\S+/i);
  return match?.[0] ?? null;
}

function placementFromItem(item) {
  const metadata = item.metadata ?? {};
  return {
    tokenKey: metadata[META.tokenKey],
    owlbearItemId: item.id,
    kind: metadata[META.kind],
    sourceId: metadata[META.sourceId],
    monsterId: metadata[META.monsterId],
    tokenInstanceId: metadata[META.tokenInstanceId],
    name: item.name,
    description: item.description,
    sourceUrl: sourceUrlFromItem(item),
    layer: item.layer,
    position: item.position,
    rotation: item.rotation ?? 0,
    scale: item.scale,
  };
}

export async function saveEncounterPlacementsToAmba({ moduleId, encounter }) {
  const id = encounterId(encounter);
  const items = await getImportedEncounterItems(moduleId, id);
  const placements = items
    .filter((item) => {
      const kind = item.metadata?.[META.kind];
      return kind === "monster-token" || kind === "monster-stat-card" || kind === "encounter-map";
    })
    .map(placementFromItem);

  if (!placements.length) {
    throw new Error("No imported AMBA map or monster tokens were found in the current Owlbear scene.");
  }

  const document = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    idempotencyKey: `${moduleId}:${id}:placements`,
    moduleId,
    encounterId: id,
    scene: {
      encounterId: id,
      title: encounter.title ?? encounter.name,
    },
    placements: placements.map((placement) => ({
      tokenKey: placement.tokenKey,
      owlbearItemId: placement.owlbearItemId,
      kind: placement.kind,
      sourceId: placement.sourceId,
      monsterId: placement.monsterId,
      tokenInstanceId: placement.tokenInstanceId,
      name: placement.name,
      layer: placement.layer,
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale,
    })),
  };
  const validation = validateExportDocument(document);
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  await saveOwlbearPlacements(moduleId, id, document);

  return placements.length;
}

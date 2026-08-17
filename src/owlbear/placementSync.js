import { saveOwlbearPlacements } from "../amba/ambaApi.js";
import { encounterId } from "./encounterData.js";
import { getImportedEncounterItems, META } from "./encounterMetadata.js";

function placementFromItem(item) {
  const metadata = item.metadata ?? {};
  return {
    owlbearItemId: item.id,
    kind: metadata[META.kind],
    sourceId: metadata[META.sourceId],
    monsterId: metadata[META.monsterId],
    tokenInstanceId: metadata[META.tokenInstanceId],
    name: item.name,
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
      return kind === "monster-token" || kind === "encounter-map";
    })
    .map(placementFromItem);

  if (!placements.length) {
    throw new Error("No imported AMBA map or monster tokens were found in the current Owlbear scene.");
  }

  await saveOwlbearPlacements(moduleId, id, {
    scene: {
      encounterId: id,
      title: encounter.title ?? encounter.name,
    },
    placements,
  });

  return placements.length;
}

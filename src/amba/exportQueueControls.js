import {
  completeOwlbearExport,
  failOwlbearExport,
  getEncounter,
  getOwlbearExportQueue,
} from "./ambaApi.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { encounterTitle } from "../owlbear/encounterData.js";
import { errorMessage } from "./uiHelpers.js";

function queueItemId(item, index) {
  return item.id ?? item.queueId ?? item.exportId ?? String(index);
}

function queueModuleId(item) {
  return item.moduleId ?? item.ambaModuleId ?? item.module?.id ?? item.encounter?.moduleId;
}

function queueEncounterId(item) {
  return item.encounterId ?? item.ambaEncounterId ?? item.encounter?.id ?? item.encounter?.encounterId;
}

async function resolveEncounter(item) {
  if (item.encounter?.map || item.encounter?.monsterBlocks || item.encounter?.monsters) {
    return item.encounter;
  }

  const moduleId = queueModuleId(item);
  const encounterId = queueEncounterId(item);
  if (!moduleId || !encounterId) {
    throw new Error("Queued export is missing moduleId or encounterId.");
  }

  return getEncounter(moduleId, encounterId);
}

function missingQueueEndpoint(error) {
  return error instanceof Error && /AMBA request failed:\s*404|Cannot GET/i.test(error.message);
}

function selectedEncounterQueue(modulePicker, encounterPicker) {
  const moduleId = modulePicker?.value;
  const encounterId = encounterPicker?.value;
  if (!moduleId || !encounterId || encounterPicker?.disabled) return [];

  return [
    {
      id: `dev-selected-${moduleId}-${encounterId}`,
      moduleId,
      encounterId,
      devFallback: true,
    },
  ];
}

async function loadQueue({ modulePicker, encounterPicker }) {
  try {
    return await getOwlbearExportQueue();
  } catch (error) {
    if (!missingQueueEndpoint(error)) throw error;
    return selectedEncounterQueue(modulePicker, encounterPicker);
  }
}

export function wireExportQueueControls({ importQueuedExports, modulePicker, encounterPicker, encounterStatus }) {
  importQueuedExports.addEventListener("click", async () => {
    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "Loading queued AMBA exports...";

    try {
      importQueuedExports.disabled = true;
      const queue = await loadQueue({ modulePicker, encounterPicker });
      const items = Array.isArray(queue) ? queue : queue?.items ?? [];

      if (!items.length) {
        encounterStatus.textContent = "No queued AMBA exports.";
        return;
      }

      let imported = 0;
      let failed = 0;
      let tokenCount = 0;
      let mapCount = 0;

      for (const [index, item] of items.entries()) {
        const id = queueItemId(item, index);
        try {
          const moduleId = queueModuleId(item);
          const encounter = await resolveEncounter(item);
          const result = await addEncounterToCurrentScene({ moduleId, encounter });
          imported += 1;
          tokenCount += result.monsterTokensImported;
          if (result.mapImported) mapCount += 1;
          if (!item.devFallback) {
            await completeOwlbearExport(id, {
              encounter: encounterTitle(encounter),
              mapImported: result.mapImported,
              monsterTokensImported: result.monsterTokensImported,
            });
          }
        } catch (error) {
          failed += 1;
          if (!item.devFallback) await failOwlbearExport(id, error).catch(() => null);
        }
      }

      encounterStatus.textContent = `Imported ${imported} queued export${imported === 1 ? "" : "s"}: ${mapCount} map${mapCount === 1 ? "" : "s"}, ${tokenCount} monster token${tokenCount === 1 ? "" : "s"}${failed ? `; ${failed} failed.` : "."}`;
      if (failed) encounterStatus.classList.add("error");
    } catch (error) {
      encounterStatus.textContent = errorMessage(error, "Unable to import queued exports.");
      encounterStatus.classList.add("error");
    } finally {
      importQueuedExports.disabled = false;
    }
  });
}

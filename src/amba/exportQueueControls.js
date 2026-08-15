import {
  completeOwlbearExport,
  failOwlbearExport,
  getEncounter,
  getOwlbearExportQueue,
} from "./ambaApi.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { encounterTitle } from "../owlbear/encounterData.js";
import { clearCurrentScene } from "../owlbear/sceneItems.js";
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

export function wireExportQueueControls({
  importQueuedExports,
  clearAndImportQueuedExports,
  modulePicker,
  encounterPicker,
  encounterStatus,
  encounterDiagnostics,
}) {
  async function importQueue({ clearScene = false } = {}) {
    encounterStatus.classList.remove("error");
    encounterStatus.textContent = clearScene
      ? "Clearing current Owlbear scene..."
      : "Loading queued AMBA exports...";
    if (encounterDiagnostics) encounterDiagnostics.textContent = "";

    try {
      importQueuedExports.disabled = true;
      if (clearAndImportQueuedExports) clearAndImportQueuedExports.disabled = true;

      let cleared = 0;
      if (clearScene) {
        cleared = await clearCurrentScene();
        encounterStatus.textContent = `Cleared ${cleared} item${cleared === 1 ? "" : "s"}. Loading queued AMBA exports...`;
      }

      const queue = await loadQueue({ modulePicker, encounterPicker });
      const items = Array.isArray(queue) ? queue : queue?.items ?? [];

      if (!items.length) {
        encounterStatus.textContent = clearScene
          ? `Cleared ${cleared} item${cleared === 1 ? "" : "s"}; no queued AMBA exports.`
          : "No queued AMBA exports.";
        return;
      }

      let imported = 0;
      let failed = 0;
      let tokenCount = 0;
      let mapCount = 0;
      let statCardCount = 0;
      let preservedCount = 0;

      for (const [index, item] of items.entries()) {
        const id = queueItemId(item, index);
        try {
          const moduleId = queueModuleId(item);
          const encounter = await resolveEncounter(item);
          const result = await addEncounterToCurrentScene({ moduleId, encounter });
          imported += 1;
          tokenCount += result.monsterTokensImported;
          statCardCount += result.statCardsImported ?? 0;
          preservedCount += (result.mapSkipped ? 1 : 0) + (result.monsterTokensSkipped ?? 0);
          if (result.mapImported) mapCount += 1;
          if (!item.devFallback) {
            await completeOwlbearExport(id, {
              encounter: encounterTitle(encounter),
              mapImported: result.mapImported,
              monsterTokensImported: result.monsterTokensImported,
              statCardsImported: result.statCardsImported,
            });
          }
        } catch (error) {
          failed += 1;
          if (!item.devFallback) await failOwlbearExport(id, error).catch(() => null);
        }
      }

      const clearSummary = clearScene ? `Cleared ${cleared} item${cleared === 1 ? "" : "s"}. ` : "";
      encounterStatus.textContent = `${clearSummary}Imported ${imported} queued export${imported === 1 ? "" : "s"}: ${mapCount} map${mapCount === 1 ? "" : "s"}, ${tokenCount} monster token${tokenCount === 1 ? "" : "s"}, ${statCardCount} stat card item${statCardCount === 1 ? "" : "s"}${preservedCount ? `; preserved ${preservedCount} existing item${preservedCount === 1 ? "" : "s"}` : ""}${failed ? `; ${failed} failed.` : "."}`;
      if (encounterDiagnostics) {
        encounterDiagnostics.textContent = "Queue import uses AMBA metadata as an upsert key; existing imported tokens are left where the user dragged them.";
      }
      if (failed) encounterStatus.classList.add("error");
    } catch (error) {
      encounterStatus.textContent = errorMessage(error, "Unable to import queued exports.");
      encounterStatus.classList.add("error");
    } finally {
      importQueuedExports.disabled = false;
      if (clearAndImportQueuedExports) clearAndImportQueuedExports.disabled = false;
    }
  }

  importQueuedExports.addEventListener("click", () => void importQueue());
  clearAndImportQueuedExports?.addEventListener("click", () => void importQueue({ clearScene: true }));
}

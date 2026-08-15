import { getEncounter, getEncounters, getPcs } from "./ambaApi.js";
import { analyzeEncounterForExport, renderEncounterAnalysis } from "./encounterAnalysis.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { saveEncounterPlacementsToAmba } from "../owlbear/placementSync.js";
import { addPcTokensAndNotesToCurrentScene } from "../owlbear/pcImporter.js";
import { encounterImportSummary, encounterKey, encounterLabel, errorMessage } from "./uiHelpers.js";

export function wireEncounterControls({
  modulePicker,
  encounterPicker,
  importEncounter,
  saveEncounterPlacements,
  optionImportMap,
  optionImportMonsterTokens,
  optionImportStatCards,
  optionIncludePcTokens,
  encounterStatus,
  encounterDiagnostics,
}) {
  let encounters = [];
  let loadedEncounter = null;
  let analysisRequestId = 0;

  function exportOptions() {
    return {
      importMap: optionImportMap?.checked ?? true,
      importMonsterTokens: optionImportMonsterTokens?.checked ?? true,
      importStatCards: optionImportStatCards?.checked ?? true,
      includePcTokens: optionIncludePcTokens?.checked ?? false,
    };
  }

  async function selectedEncounter() {
    const moduleId = modulePicker.value;
    const selectedEncounterId = encounterPicker.value;
    if (!moduleId || !selectedEncounterId) return null;

    const selectedSummary = encounters.find(
      (encounter, index) => encounterKey(encounter, index) === selectedEncounterId
    );
    const fullEncounterId = selectedSummary?.id ?? selectedSummary?.encounterId ?? selectedSummary?.slug;
    return fullEncounterId ? getEncounter(moduleId, fullEncounterId) : selectedSummary;
  }

  async function analyzeSelectedEncounter() {
    const requestId = ++analysisRequestId;
    loadedEncounter = null;
    if (!encounterPicker.value || encounterPicker.disabled) return;

    if (encounterDiagnostics) {
      encounterDiagnostics.textContent = "Loading encounter export details...";
    }

    try {
      const encounter = await selectedEncounter();
      if (!encounter || requestId !== analysisRequestId) return;
      loadedEncounter = encounter;
      const analysis = await analyzeEncounterForExport(encounter);
      if (requestId !== analysisRequestId) return;
      renderEncounterAnalysis(encounterDiagnostics, analysis, exportOptions());
    } catch (error) {
      if (requestId !== analysisRequestId) return;
      if (encounterDiagnostics) {
        encounterDiagnostics.textContent = errorMessage(error, "Unable to analyze encounter.");
      }
    }
  }

  async function loadEncountersForSelectedModule() {
    const moduleId = modulePicker.value;
    encounterPicker.disabled = true;
    importEncounter.disabled = true;
    if (saveEncounterPlacements) saveEncounterPlacements.disabled = true;
    encounterPicker.replaceChildren();

    const loading = document.createElement("option");
    loading.textContent = moduleId ? "Loading encounters..." : "Select a module first";
    encounterPicker.append(loading);
    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "";
    if (encounterDiagnostics) encounterDiagnostics.textContent = "";

    if (!moduleId) return;

    try {
      encounters = await getEncounters(moduleId);
      encounterPicker.replaceChildren();

      if (!encounters.length) {
        const empty = document.createElement("option");
        empty.textContent = "No encounters found";
        encounterPicker.append(empty);
        return;
      }

      for (const [index, encounter] of encounters.entries()) {
        const option = document.createElement("option");
        option.value = encounterKey(encounter, index);
        option.textContent = encounterLabel(encounter);
        encounterPicker.append(option);
      }

      encounterPicker.disabled = false;
      importEncounter.disabled = false;
      if (saveEncounterPlacements) saveEncounterPlacements.disabled = false;
      await analyzeSelectedEncounter();
    } catch (error) {
      encounterPicker.replaceChildren();
      const failed = document.createElement("option");
      failed.textContent = "Unable to load encounters";
      encounterPicker.append(failed);
      encounterStatus.textContent = errorMessage(error, "Unable to load encounters.");
      encounterStatus.classList.add("error");
    }
  }

  importEncounter.addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    const selectedEncounterId = encounterPicker.value;
    if (!moduleId || !selectedEncounterId) return;

    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "Importing encounter...";

    try {
      importEncounter.disabled = true;
      const encounter = loadedEncounter ?? (await selectedEncounter());
      if (!encounter) throw new Error("Select an encounter to import.");

      const options = exportOptions();
      const result = await addEncounterToCurrentScene({ moduleId, encounter, options });
      let pcCount = 0;
      if (options.includePcTokens) {
        const pcs = await getPcs(moduleId);
        if (pcs.length) pcCount = await addPcTokensAndNotesToCurrentScene({ moduleId, pcs });
      }
      encounterStatus.textContent = encounterImportSummary(result);
      if (pcCount) {
        encounterStatus.textContent += ` Added ${pcCount} PC token${pcCount === 1 ? "" : "s"}.`;
      }
      if (encounterDiagnostics) {
        encounterDiagnostics.textContent = `Scene metadata updated for AMBA encounter ${encounter.id ?? encounter.encounterId ?? encounterPicker.value}. Re-import preserves existing AMBA token positions.`;
      }
    } catch (error) {
      encounterStatus.textContent = errorMessage(error, "Unable to import encounter.");
      encounterStatus.classList.add("error");
    } finally {
      importEncounter.disabled = encounterPicker.disabled || !encounterPicker.value;
    }
  });

  saveEncounterPlacements?.addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    if (!moduleId) return;

    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "Saving token placements to AMBA...";

    try {
      saveEncounterPlacements.disabled = true;
      const encounter = loadedEncounter ?? (await selectedEncounter());
      if (!encounter) throw new Error("Select an encounter before saving placements.");

      const count = await saveEncounterPlacementsToAmba({ moduleId, encounter });
      encounterStatus.textContent = `Saved ${count} monster token placement${count === 1 ? "" : "s"} to AMBA.`;
      if (encounterDiagnostics) {
        encounterDiagnostics.textContent = "Placement payload included Owlbear item IDs, token instance IDs, layers, positions, rotation, and scale.";
      }
    } catch (error) {
      encounterStatus.textContent = errorMessage(error, "Unable to save token placements.");
      encounterStatus.classList.add("error");
    } finally {
      saveEncounterPlacements.disabled = encounterPicker.disabled || !encounterPicker.value;
    }
  });

  modulePicker.addEventListener("change", () => {
    loadEncountersForSelectedModule();
  });

  encounterPicker.addEventListener("change", () => {
    void analyzeSelectedEncounter();
  });

  for (const option of [optionImportMap, optionImportMonsterTokens, optionImportStatCards, optionIncludePcTokens]) {
    option?.addEventListener("change", () => {
      if (loadedEncounter) {
        void analyzeSelectedEncounter();
      }
    });
  }

  return { loadEncountersForSelectedModule };
}

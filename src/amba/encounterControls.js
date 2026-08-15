import { getEncounter, getEncounters } from "./ambaApi.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { saveEncounterPlacementsToAmba } from "../owlbear/placementSync.js";
import { encounterImportSummary, encounterKey, encounterLabel, errorMessage } from "./uiHelpers.js";

export function wireEncounterControls({
  modulePicker,
  encounterPicker,
  importEncounter,
  saveEncounterPlacements,
  encounterStatus,
  encounterDiagnostics,
}) {
  let encounters = [];

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
      const encounter = await selectedEncounter();
      if (!encounter) throw new Error("Select an encounter to import.");

      const result = await addEncounterToCurrentScene({ moduleId, encounter });
      encounterStatus.textContent = encounterImportSummary(result);
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
      const encounter = await selectedEncounter();
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

  return { loadEncountersForSelectedModule };
}

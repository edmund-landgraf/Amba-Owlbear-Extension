import { getEncounter, getEncounters } from "./ambaApi.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { encounterKey, encounterLabel, errorMessage } from "./uiHelpers.js";

export function wireEncounterControls({ modulePicker, encounterPicker, importEncounter, encounterStatus }) {
  let encounters = [];

  async function loadEncountersForSelectedModule() {
    const moduleId = modulePicker.value;
    encounterPicker.disabled = true;
    importEncounter.disabled = true;
    encounterPicker.replaceChildren();

    const loading = document.createElement("option");
    loading.textContent = moduleId ? "Loading encounters..." : "Select a module first";
    encounterPicker.append(loading);
    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "";

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
      const selectedSummary = encounters.find(
        (encounter, index) => encounterKey(encounter, index) === selectedEncounterId
      );
      const fullEncounterId = selectedSummary?.id ?? selectedSummary?.encounterId ?? selectedSummary?.slug;
      const encounter = fullEncounterId ? await getEncounter(moduleId, fullEncounterId) : selectedSummary;
      if (!encounter) throw new Error("Select an encounter to import.");

      const result = await addEncounterToCurrentScene({ moduleId, encounter });
      encounterStatus.textContent = `Imported ${result.mapImported ? "1 map and " : ""}${result.monsterTokensImported} monster token${result.monsterTokensImported === 1 ? "" : "s"}.`;
    } catch (error) {
      encounterStatus.textContent = errorMessage(error, "Unable to import encounter.");
      encounterStatus.classList.add("error");
    } finally {
      importEncounter.disabled = encounterPicker.disabled || !encounterPicker.value;
    }
  });

  modulePicker.addEventListener("change", () => {
    loadEncountersForSelectedModule();
  });

  return { loadEncountersForSelectedModule };
}

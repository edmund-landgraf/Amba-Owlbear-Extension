import { getEncounter, getEncounters, getPcs, getTestUserModules } from "./ambaApi.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { addPcSheetImagesToCurrentScene, addPcTokensAndNotesToCurrentScene } from "../owlbear/pcImporter.js";

// Convert unknown thrown values into a user-visible string.
//
// Browser/SDK errors can be real Error objects, strings, validation payloads,
// or empty objects. We also log the full value so the visible extension UI stays
// friendly while the console still keeps the useful debugging details.
function errorMessage(error, fallback) {
  console.error(fallback, error);
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : fallback;
  } catch {
    return fallback;
  }
}

// Render a simple read-only list of the PCs that were loaded.
//
// Earlier prototypes made each PC name a button. The current flow is module
// oriented: "Load all PCs" drops token+note pairs for the whole module, and the
// sheet-image button imports all available sheet snapshots. The list is just
// confirmation of what was fetched.
function renderPcButtons(container, pcs) {
  // Replace the old list/status children so repeated imports do not keep
  // appending stale names.
  container.replaceChildren();

  if (!pcs.length) {
    // Empty modules are valid; give the user a quiet explanation instead of
    // leaving an empty panel.
    const empty = document.createElement("p");
    empty.textContent = "No PCs found.";
    container.append(empty);
    return;
  }

  // Keep the display intentionally plain. The actual Owlbear work happens in
  // pcImporter.js, not from individual name buttons.
  for (const pc of pcs) {
    const item = document.createElement("p");
    item.textContent = pc.name;
    container.append(item);
  }
}

function encounterLabel(encounter) {
  const title = encounter.title ?? encounter.name ?? "Untitled encounter";
  const monsters = encounter._count?.monsters ?? encounter.monsterCount ?? encounter.monsters?.length;
  return monsters ? `${title} (${monsters} monsters)` : title;
}

function encounterKey(encounter, index) {
  return encounter.id ?? encounter.encounterId ?? encounter.slug ?? String(index);
}

// Wire the AMBA PC panel after Owlbear has loaded the app shell.
//
// This function owns browser UI state: loading modules, enabling buttons,
// showing progress messages, and delegating Owlbear item creation to
// pcImporter.js.
export async function wirePcLoader() {
  // Cache DOM references once. If any of these IDs change in renderAppShell.js,
  // the failure will happen early and visibly.
  const modulePicker = document.getElementById("modulePicker");
  const loadPcs = document.getElementById("loadPcs");
  const importSheetImages = document.getElementById("importSheetImages");
  const encounterPicker = document.getElementById("encounterPicker");
  const importEncounter = document.getElementById("importEncounter");
  const pcList = document.getElementById("pcList");
  const importStatus = document.getElementById("importStatus");
  const encounterStatus = document.getElementById("encounterStatus");

  // The module list is loaded once on startup and reused by the controls.
  // The selected module ID lives in the <select>; this array preserves the
  // rest of the module metadata if we need it later.
  let modules = [];
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

  // Main import button: fetch PCs, list their names, then drop token+note pairs
  // directly into the currently open Owlbear scene.
  document.getElementById("loadPcs").addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    if (!moduleId) return;

    // Reset previous visual state before starting a new import attempt.
    pcList.textContent = "Loading PCs...";
    importStatus.classList.remove("error");
    importStatus.textContent = "";

    try {
      // Disable only the clicked action while work is running. This prevents
      // double-click duplicates, but leaves the rest of the panel easy to
      // recover from after the promise settles.
      loadPcs.disabled = true;

      // Always fetch fresh PCs; the module content may have changed in AMBA
      // since the extension was opened.
      const pcs = await getPcs(moduleId);
      renderPcButtons(pcList, pcs);

      // The importer handles Owlbear scene readiness, item construction, and
      // the color rotation. This UI layer only reports progress.
      importStatus.textContent = `Dropping ${pcs.length} PC tokens and notes at scene root...`;
      const count = await addPcTokensAndNotesToCurrentScene({ moduleId, pcs });
      importStatus.textContent = `${count} PC tokens and notes were added to the current scene.`;
    } catch (error) {
      // Show the meaningful message in the extension panel and mark it as an
      // error for styling.
      importStatus.textContent = errorMessage(error, "Unable to import PCs.");
      importStatus.classList.add("error");
    } finally {
      // Always restore the button, even after Owlbear validation or network
      // failures, so the user can retry after fixing the scene/server state.
      loadPcs.disabled = false;
    }
  });

  // Secondary import button: add rendered character sheet PNGs to the scene.
  //
  // Some PCs do not have sheets yet. The importer intentionally skips those and
  // returns imported/skipped counts rather than failing the whole module.
  importSheetImages.addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    if (!moduleId) return;

    // This flow is independent of the token+note import, so it has its own
    // progress text and error reset.
    importStatus.classList.remove("error");
    importStatus.textContent = "Importing character sheet images...";

    try {
      importSheetImages.disabled = true;

      // Fetch fresh PC data so the sheet availability reflects the current AMBA
      // API state.
      const pcs = await getPcs(moduleId);
      renderPcButtons(pcList, pcs);

      // Adds only successful sheet images and reports missing sheets as skipped.
      const result = await addPcSheetImagesToCurrentScene({ moduleId, pcs });
      importStatus.textContent = `Imported ${result.imported} character sheet images${result.skipped ? `; skipped ${result.skipped} without sheets.` : "."}`;
    } catch (error) {
      importStatus.textContent = errorMessage(error, "Unable to import character sheet images.");
      importStatus.classList.add("error");
    } finally {
      importSheetImages.disabled = false;
    }
  });

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
      const encounter = fullEncounterId
        ? await getEncounter(moduleId, fullEncounterId)
        : selectedSummary;
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

  try {
    // Populate the module picker from the dev test-user endpoint. This keeps
    // the extension usable inside Owlbear without doing AMBA OAuth inside the
    // embedded iframe.
    modules = await getTestUserModules();
    modulePicker.replaceChildren();

    // Include PC/NPC counts in the option label so the picker gives enough
    // context without needing summaries.
    for (const module of modules) {
      const option = document.createElement("option");
      option.value = module.id;
      option.textContent = `${module.title} (${module._count.pcs} PCs, ${module._count.npcs} NPCs)`;
      modulePicker.append(option);
    }

    if (!modules.length) {
      // Disable the workflow politely if the dev API has no test-user modules.
      const option = document.createElement("option");
      option.textContent = "No test-user modules found";
      modulePicker.append(option);
      return;
    }

    // Default to the first module that actually has PCs, because that is the
    // most useful starting point when testing the importer.
    const firstModuleWithPcs = modules.find((module) => module._count.pcs > 0);
    if (firstModuleWithPcs) {
      modulePicker.value = firstModuleWithPcs.id;
    }

    // Only enable actions after modules are loaded; before this, the selected
    // module ID is not trustworthy.
    modulePicker.disabled = false;
    loadPcs.disabled = false;
    importSheetImages.disabled = false;
    await loadEncountersForSelectedModule();
  } catch (error) {
    // Module loading is the one startup failure that blocks all PC imports.
    // Put the explanation in the PC list area where the user is already looking.
    modulePicker.replaceChildren();
    const option = document.createElement("option");
    option.textContent = "Unable to load modules";
    modulePicker.append(option);
    pcList.textContent = errorMessage(error, "Unable to load modules.");
    pcList.classList.add("error");
  }
}

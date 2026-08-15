import { getPcs, getTestUserModules } from "./ambaApi.js";
import { wireEncounterControls } from "./encounterControls.js";
import { wireExportQueueControls } from "./exportQueueControls.js";
import { errorMessage, renderPcButtons } from "./uiHelpers.js";
import { addPcSheetImagesToCurrentScene, addPcTokensAndNotesToCurrentScene } from "../owlbear/pcImporter.js";

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
  const importQueuedExports = document.getElementById("importQueuedExports");
  const clearAndImportQueuedExports = document.getElementById("clearAndImportQueuedExports");
  const saveEncounterPlacements = document.getElementById("saveEncounterPlacements");
  const optionImportMap = document.getElementById("optionImportMap");
  const optionImportMonsterTokens = document.getElementById("optionImportMonsterTokens");
  const optionImportStatCards = document.getElementById("optionImportStatCards");
  const optionIncludePcTokens = document.getElementById("optionIncludePcTokens");
  const pcList = document.getElementById("pcList");
  const importStatus = document.getElementById("importStatus");
  const encounterStatus = document.getElementById("encounterStatus");
  const encounterDiagnostics = document.getElementById("encounterDiagnostics");

  // The module list is loaded once on startup and reused by the controls.
  // The selected module ID lives in the <select>; this array preserves the
  // rest of the module metadata if we need it later.
  const encounterControls = wireEncounterControls({
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
  });
  wireExportQueueControls({
    importQueuedExports,
    clearAndImportQueuedExports,
    modulePicker,
    encounterPicker,
    optionImportMap,
    optionImportMonsterTokens,
    optionImportStatCards,
    optionIncludePcTokens,
    encounterStatus,
    encounterDiagnostics,
  });

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

  try {
    // Populate the module picker from the dev test-user endpoint. This keeps
    // the extension usable inside Owlbear without doing AMBA OAuth inside the
    // embedded iframe.
    const modules = await getTestUserModules();
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

    // Prefer the purpose-built no-PC Owlbear smoke module when present, then
    // fall back to the first module with PCs for the older importer flow.
    const smokeModule = modules.find((module) => /owlbear smoke/i.test(module.title));
    const firstModuleWithPcs = modules.find((module) => module._count.pcs > 0);
    if (smokeModule || firstModuleWithPcs) {
      modulePicker.value = (smokeModule ?? firstModuleWithPcs).id;
    }

    // Only enable actions after modules are loaded; before this, the selected
    // module ID is not trustworthy.
    modulePicker.disabled = false;
    loadPcs.disabled = false;
    importSheetImages.disabled = false;
    await encounterControls.loadEncountersForSelectedModule();
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

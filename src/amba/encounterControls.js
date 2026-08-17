import { getContainers, getEncounter, getPcs } from "./ambaApi.js";
import { analyzeEncounterForExport, renderEncounterAnalysis } from "./encounterAnalysis.js";
import { addEncounterToCurrentScene } from "../owlbear/encounterImporter.js";
import { saveEncounterPlacementsToAmba } from "../owlbear/placementSync.js";
import { addPcTokensAndNotesToCurrentScene } from "../owlbear/pcImporter.js";
import { encounterImportSummary, encounterKey, encounterLabel, errorMessage } from "./uiHelpers.js";

export function wireEncounterControls({
  modulePicker,
  actPicker,
  scenePicker,
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
  let containers = [];
  let encounterTargets = [];
  let loadedEncounter = null;
  let analysisRequestId = 0;

  function containerType(container) {
    return container?.containerType?.key ?? container?.containerTypeKey ?? container?.type ?? "";
  }

  function parentId(container) {
    return container?.parentId ?? container?.parent?.id ?? null;
  }

  function childrenOf(containerId) {
    return containers.filter((container) => parentId(container) === containerId);
  }

  function descendantsOf(containerId) {
    const descendants = [];
    const queue = childrenOf(containerId);
    while (queue.length) {
      const current = queue.shift();
      descendants.push(current);
      queue.push(...childrenOf(current.id));
    }
    return descendants;
  }

  function titleFor(container, fallback = "Untitled") {
    return container?.title ?? container?.name ?? fallback;
  }

  function actSortValue(container) {
    const text = `${container?.slug ?? ""} ${titleFor(container, "")}`;
    const match = text.match(/\bact\D*(\d+)/i);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function preferActOne(acts) {
    return acts.find((act) => actSortValue(act) === 1) ?? acts[0] ?? null;
  }

  function resetPicker(picker, text) {
    picker.disabled = true;
    picker.replaceChildren();
    const option = document.createElement("option");
    option.textContent = text;
    picker.append(option);
  }

  function enablePicker(picker, items, valueFor, labelFor) {
    picker.replaceChildren();
    for (const item of items) {
      const option = document.createElement("option");
      option.value = valueFor(item);
      option.textContent = labelFor(item);
      picker.append(option);
    }
    picker.disabled = !items.length;
  }

  function syntheticActRootScene(actId) {
    return { id: `act-root:${actId}`, title: "Act Root", syntheticActRoot: true, actId };
  }

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

    const selectedSummary = encounterTargets.find(
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
    loadedEncounter = null;
    encounterTargets = [];
    resetPicker(actPicker, moduleId ? "Loading acts..." : "Select an act first");
    resetPicker(scenePicker, "Select an act first");
    resetPicker(encounterPicker, "Select an act first");
    encounterPicker.disabled = true;
    importEncounter.disabled = true;
    if (saveEncounterPlacements) saveEncounterPlacements.disabled = true;
    encounterStatus.classList.remove("error");
    encounterStatus.textContent = "";
    if (encounterDiagnostics) encounterDiagnostics.textContent = "";

    if (!moduleId) return;

    try {
      containers = await getContainers(moduleId);
      const acts = containers.filter((container) => containerType(container) === "act");

      if (!acts.length) {
        resetPicker(actPicker, "No acts found");
        resetPicker(scenePicker, "No scenes found");
        resetPicker(encounterPicker, "No encounters found");
        return;
      }

      enablePicker(actPicker, acts, (act) => act.id, (act) => titleFor(act, "Untitled act"));
      const selectedAct = preferActOne(acts);
      if (selectedAct) actPicker.value = selectedAct.id;
      await loadScenesForSelectedAct();
    } catch (error) {
      resetPicker(actPicker, "Unable to load acts");
      resetPicker(scenePicker, "Unable to load scenes");
      encounterPicker.replaceChildren();
      const failed = document.createElement("option");
      failed.textContent = "Unable to load encounters";
      encounterPicker.append(failed);
      encounterStatus.textContent = errorMessage(error, "Unable to load encounters.");
      encounterStatus.classList.add("error");
    }
  }

  async function loadScenesForSelectedAct() {
    const selectedActId = actPicker.value;
    loadedEncounter = null;
    resetPicker(scenePicker, selectedActId ? "Loading scenes..." : "Select an act first");
    resetPicker(encounterPicker, "Select a scene first");
    importEncounter.disabled = true;
    if (saveEncounterPlacements) saveEncounterPlacements.disabled = true;
    if (encounterDiagnostics) encounterDiagnostics.textContent = "";

    if (!selectedActId) return;

    resetPicker(encounterPicker, "Select a scene first");
    const directEncounters = childrenOf(selectedActId).filter((container) => containerType(container) === "encounter");
    const scenes = childrenOf(selectedActId).filter((container) => containerType(container) === "scene");
    const sceneChoices = directEncounters.length ? [syntheticActRootScene(selectedActId), ...scenes] : scenes;
    if (!sceneChoices.length) {
      resetPicker(scenePicker, "No scenes found");
      resetPicker(encounterPicker, "No encounters found");
      return;
    }

    enablePicker(scenePicker, sceneChoices, (scene) => scene.id, (scene) => titleFor(scene, "Untitled scene"));
    await loadEncounterTargetsForSelectedScene();
  }

  async function loadEncounterTargetsForSelectedScene() {
    const selectedSceneId = scenePicker.value;
    loadedEncounter = null;
    encounterTargets = [];
    resetPicker(encounterPicker, selectedSceneId ? "Loading encounters..." : "Select a scene first");
    importEncounter.disabled = true;
    if (saveEncounterPlacements) saveEncounterPlacements.disabled = true;
    if (encounterDiagnostics) encounterDiagnostics.textContent = "";

    if (!selectedSceneId) return;

    if (selectedSceneId.startsWith("act-root:")) {
      const selectedActId = selectedSceneId.slice("act-root:".length);
      encounterTargets = childrenOf(selectedActId).filter((container) => containerType(container) === "encounter");
    } else {
      encounterTargets = descendantsOf(selectedSceneId).filter((container) =>
        ["subscene", "encounter"].includes(containerType(container))
      );
    }

    if (!encounterTargets.length) {
      resetPicker(encounterPicker, "No encounters found");
      return;
    }

    enablePicker(
      encounterPicker,
      encounterTargets,
      (encounter, index) => encounterKey(encounter, index),
      (encounter) => encounterLabel(encounter, { omitSceneName: true, includeTypePrefix: true })
    );
    importEncounter.disabled = false;
    if (saveEncounterPlacements) saveEncounterPlacements.disabled = false;
    await analyzeSelectedEncounter();
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
    encounterStatus.textContent = "Saving map and token placements to AMBA...";

    try {
      saveEncounterPlacements.disabled = true;
      const encounter = loadedEncounter ?? (await selectedEncounter());
      if (!encounter) throw new Error("Select an encounter before saving placements.");

      const count = await saveEncounterPlacementsToAmba({ moduleId, encounter });
      encounterStatus.textContent = `Saved ${count} map/token placement${count === 1 ? "" : "s"} to AMBA.`;
      if (encounterDiagnostics) {
        encounterDiagnostics.textContent = "Placement payload included Owlbear item IDs, map and token instance IDs, layers, positions, rotation, and scale.";
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

  actPicker.addEventListener("change", () => {
    void loadScenesForSelectedAct();
  });

  scenePicker.addEventListener("change", () => {
    void loadEncounterTargetsForSelectedScene();
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

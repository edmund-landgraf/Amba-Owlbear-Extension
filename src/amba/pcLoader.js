import { getPcs, getTestUserModules } from "./ambaApi.js";
import { addPcSheetImagesToCurrentScene, addPcTokensAndNotesToCurrentScene } from "../owlbear/pcImporter.js";

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

function renderPcButtons(container, pcs) {
  container.replaceChildren();

  if (!pcs.length) {
    const empty = document.createElement("p");
    empty.textContent = "No PCs found.";
    container.append(empty);
    return;
  }

  for (const pc of pcs) {
    const item = document.createElement("p");
    item.textContent = pc.name;
    container.append(item);
  }
}

export async function wirePcLoader() {
  const modulePicker = document.getElementById("modulePicker");
  const loadPcs = document.getElementById("loadPcs");
  const importSheetImages = document.getElementById("importSheetImages");
  const pcList = document.getElementById("pcList");
  const importStatus = document.getElementById("importStatus");
  let modules = [];

  document.getElementById("loadPcs").addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    if (!moduleId) return;

    pcList.textContent = "Loading PCs...";
    importStatus.classList.remove("error");
    importStatus.textContent = "";

    try {
      loadPcs.disabled = true;
      const pcs = await getPcs(moduleId);
      renderPcButtons(pcList, pcs);
      importStatus.textContent = `Dropping ${pcs.length} PC tokens and notes at scene root...`;
      const count = await addPcTokensAndNotesToCurrentScene({ moduleId, pcs });
      importStatus.textContent = `${count} PC tokens and notes were added to the current scene.`;
    } catch (error) {
      importStatus.textContent = errorMessage(error, "Unable to import PCs.");
      importStatus.classList.add("error");
    } finally {
      loadPcs.disabled = false;
    }
  });

  importSheetImages.addEventListener("click", async () => {
    const moduleId = modulePicker.value;
    if (!moduleId) return;

    importStatus.classList.remove("error");
    importStatus.textContent = "Importing character sheet images...";

    try {
      importSheetImages.disabled = true;
      const pcs = await getPcs(moduleId);
      renderPcButtons(pcList, pcs);
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
    modules = await getTestUserModules();
    modulePicker.replaceChildren();

    for (const module of modules) {
      const option = document.createElement("option");
      option.value = module.id;
      option.textContent = `${module.title} (${module._count.pcs} PCs, ${module._count.npcs} NPCs)`;
      modulePicker.append(option);
    }

    if (!modules.length) {
      const option = document.createElement("option");
      option.textContent = "No test-user modules found";
      modulePicker.append(option);
      return;
    }

    const firstModuleWithPcs = modules.find((module) => module._count.pcs > 0);
    if (firstModuleWithPcs) {
      modulePicker.value = firstModuleWithPcs.id;
    }

    modulePicker.disabled = false;
    loadPcs.disabled = false;
    importSheetImages.disabled = false;
  } catch (error) {
    modulePicker.replaceChildren();
    const option = document.createElement("option");
    option.textContent = "Unable to load modules";
    modulePicker.append(option);
    pcList.textContent = errorMessage(error, "Unable to load modules.");
    pcList.classList.add("error");
  }
}

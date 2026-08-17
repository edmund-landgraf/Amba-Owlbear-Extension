import { isMissingSceneError, NO_SCENE_MESSAGE, obrErrorMessage } from "../owlbear/sceneService.js";

export function errorMessage(error, fallback) {
  console.error(fallback, error);
  if (isMissingSceneError(error)) return NO_SCENE_MESSAGE;
  const message = obrErrorMessage(error);
  if (/Not authenticated/i.test(message)) {
    return "Not authenticated. Click Connect AMBA, approve the popup, then the extension will reload.";
  }
  if (message) return message;
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : fallback;
  } catch {
    return fallback;
  }
}

export function renderPcButtons(container, pcs) {
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

export function encounterLabel(encounter, options = {}) {
  const title = encounter.title ?? encounter.name ?? "Untitled encounter";
  const sceneName = encounterSceneName(encounter);
  const typePrefix = options.includeTypePrefix ? encounterTypePrefix(encounter) : "";
  const titledWithScene =
    !options.omitSceneName &&
    sceneName &&
    !title.toLocaleLowerCase().endsWith(`(${sceneName.toLocaleLowerCase()})`)
      ? `${title} (${sceneName})`
      : title;
  const titledWithType = typePrefix ? `${typePrefix} ${titledWithScene}` : titledWithScene;
  const monsters = encounter._count?.monsters ?? encounter.monsterCount ?? encounter.monsters?.length;
  return monsters ? `${titledWithType} (${monsters} monsters)` : titledWithType;
}

export function encounterKey(encounter, index) {
  return encounter.id ?? encounter.encounterId ?? encounter.slug ?? String(index);
}

function encounterSceneName(encounter) {
  const metadata = encounter.metadata ?? {};
  const parent = encounter.parent;
  const parentType = parent?.containerType?.key ?? parent?.containerTypeKey ?? parent?.type;
  return (
    encounter.sceneName ??
    encounter.sceneTitle ??
    encounter.sourceSceneName ??
    encounter.sourceSceneTitle ??
    metadata.sceneName ??
    metadata.sceneTitle ??
    metadata.sourceSceneName ??
    metadata.sourceSceneTitle ??
    (parentType === "scene" || parentType === "subscene" ? parent?.title : undefined)
  );
}

function encounterTypePrefix(encounter) {
  const metadata = encounter.metadata ?? {};
  const rawType =
    encounter.encounterType ??
    encounter.encounterTypeKey ??
    encounter.typeKey ??
    metadata.encounterType ??
    metadata.encounterTypeKey ??
    metadata.type ??
    (Array.isArray(metadata.tags) ? metadata.tags[0] : undefined);
  if (typeof rawType !== "string" || !rawType.trim()) return "";

  const type = rawType.trim().replace(/[_-]+/g, " ").toLocaleLowerCase();
  const title = encounter.title ?? encounter.name ?? "";
  if (title.toLocaleLowerCase().startsWith(`${type} `) || title.toLocaleLowerCase().startsWith(`${type} -`)) {
    return "";
  }
  return `(${type})`;
}

export function encounterImportSummary(result) {
  const pieces = [];
  pieces.push(`${result.mapImported ? 1 : 0} map${result.mapImported ? "" : "s"}`);
  pieces.push(`${result.monsterTokensImported} monster token${result.monsterTokensImported === 1 ? "" : "s"}`);
  if (result.statCardsImported) {
    pieces.push(`${result.statCardsImported} stat card item${result.statCardsImported === 1 ? "" : "s"}`);
  }

  const skipped = (result.mapSkipped ? 1 : 0) + (result.monsterTokensSkipped ?? 0);
  const warningText = result.mapWarnings?.length ? ` Map warning: ${result.mapWarnings.join(" ")}` : "";
  return `Imported ${pieces.join(", ")}${skipped ? `; preserved ${skipped} existing item${skipped === 1 ? "" : "s"}.` : "."}${warningText}`;
}

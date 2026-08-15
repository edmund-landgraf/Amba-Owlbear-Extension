export function errorMessage(error, fallback) {
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

export function encounterLabel(encounter) {
  const title = encounter.title ?? encounter.name ?? "Untitled encounter";
  const monsters = encounter._count?.monsters ?? encounter.monsterCount ?? encounter.monsters?.length;
  return monsters ? `${title} (${monsters} monsters)` : title;
}

export function encounterKey(encounter, index) {
  return encounter.id ?? encounter.encounterId ?? encounter.slug ?? String(index);
}

export function encounterImportSummary(result) {
  const pieces = [];
  pieces.push(`${result.mapImported ? 1 : 0} map${result.mapImported ? "" : "s"}`);
  pieces.push(`${result.monsterTokensImported} monster token${result.monsterTokensImported === 1 ? "" : "s"}`);
  if (result.statCardsImported) {
    pieces.push(`${result.statCardsImported} stat card item${result.statCardsImported === 1 ? "" : "s"}`);
  }

  const skipped = (result.mapSkipped ? 1 : 0) + (result.monsterTokensSkipped ?? 0);
  return `Imported ${pieces.join(", ")}${skipped ? `; preserved ${skipped} existing item${skipped === 1 ? "" : "s"}.` : "."}`;
}

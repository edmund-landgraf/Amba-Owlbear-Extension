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

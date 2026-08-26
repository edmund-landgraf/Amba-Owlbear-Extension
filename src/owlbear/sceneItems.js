import OBR from "@owlbear-rodeo/sdk";
import { NS } from "./layout.js";
import { requireOpenScene } from "./sceneService.js";

export async function addItemsToCurrentScene(items) {
  await requireOpenScene();
  await OBR.scene.items.addItems(items);
}

export async function deleteItemsFromCurrentScene(ids) {
  if (!ids?.length) return;
  await requireOpenScene();
  await OBR.scene.items.deleteItems(ids);
}

export async function unlockItemsInCurrentScene(ids) {
  if (!ids?.length) return;
  await requireOpenScene();
  await OBR.scene.items.updateItems(ids, (items) => {
    for (const item of items) item.locked = false;
  });
}

export async function unlockAmbaStatCardsInCurrentScene() {
  try {
    await requireOpenScene();
    const cards = await OBR.scene.items.getItems(
      (item) => item.metadata?.[`${NS}/kind`] === "monster-stat-card" && item.locked
    );
    await unlockItemsInCurrentScene(cards.map((item) => item.id));
  } catch {
    // Scene may not be open yet.
  }
}

export async function moveItemsInCurrentScene(moves) {
  if (!moves?.length) return;
  await requireOpenScene();
  const byId = new Map(moves.map((move) => [move.id, move]));
  await OBR.scene.items.updateItems([...byId.keys()], (items) => {
    for (const item of items) {
      const move = byId.get(item.id);
      if (!move) continue;
      if (move.position) item.position = move.position;
      if (move.description) item.description = move.description;
    }
  });
}

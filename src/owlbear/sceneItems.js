import OBR from "@owlbear-rodeo/sdk";

export async function clearCurrentScene() {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("No Owlbear scene is currently open. Open a scene, then clear again.");
  }

  const items = await OBR.scene.items.getItems(() => true);
  if (!items.length) return 0;

  await OBR.scene.items.deleteItems(items.map((item) => item.id));
  return items.length;
}

export async function addItemsToCurrentScene(items) {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("No Owlbear scene is currently open. Open or create a blank scene, then import again.");
  }
  await OBR.scene.items.addItems(items);
}

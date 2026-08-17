import OBR from "@owlbear-rodeo/sdk";

export const NO_SCENE_MESSAGE =
  "No Owlbear scene is open. Open or create a scene in this room, then import again.";

export function obrErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return error?.error?.message ?? error?.message ?? "";
}

export function isMissingSceneError(error) {
  const name = error?.error?.name ?? error?.name ?? "";
  const message = obrErrorMessage(error);
  return name === "MissingDataError" || /no scene found/i.test(message);
}

export async function isSceneReady() {
  try {
    return await OBR.scene.isReady();
  } catch (error) {
    if (isMissingSceneError(error)) return false;
    throw error;
  }
}

async function canAccessSceneItems() {
  try {
    await OBR.scene.items.getItems(() => false);
    return true;
  } catch {
    return false;
  }
}

function waitForSceneReady(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      unsubscribe = OBR.scene.onReadyChange((ready) => {
        if (ready) finish(true);
      });
    } catch {
      finish(false);
    }
  });
}

export async function requireOpenScene() {
  if (await isSceneReady()) return;
  if (await canAccessSceneItems()) return;
  if (await waitForSceneReady(8000)) return;
  if (await canAccessSceneItems()) return;
  throw new Error(NO_SCENE_MESSAGE);
}

export async function show(message) {
  await OBR.notification.show(message);
}
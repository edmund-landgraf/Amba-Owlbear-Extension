import OBR from "@owlbear-rodeo/sdk";
import { renderAppShell } from "../ui/renderAppShell.js";
import { wireRoomTest } from "../owlbear/roomTest.js";
import { wireOwlbearAuthBridge } from "../amba/authBridge.js";
import { wireAmbaAuthTest } from "../amba/authTest.js";
import { wirePcLoader } from "../amba/pcLoader.js";
import { unlockAmbaStatCardsInCurrentScene } from "../owlbear/sceneItems.js";

export async function startApp() {
  renderAppShell();

  await OBR.onReady();

  document.getElementById("status").textContent = "Connected to Owlbear!";
  await unlockAmbaStatCardsInCurrentScene();
  wireOwlbearAuthBridge();
  wireRoomTest();
  wireAmbaAuthTest();
  await wirePcLoader();
}

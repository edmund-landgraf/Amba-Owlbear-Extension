import OBR from "@owlbear-rodeo/sdk";
import { renderAppShell } from "../ui/renderAppShell.js";
import { wireRoomTest } from "../owlbear/roomTest.js";
import { wirePcLoader } from "../amba/pcLoader.js";

export async function startApp() {
  renderAppShell();

  await OBR.onReady();

  document.getElementById("status").textContent = "Connected to Owlbear!";
  wireRoomTest();
  await wirePcLoader();
}

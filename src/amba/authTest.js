import { getCurrentUser, startOwlbearAuth } from "./ambaApi.js";
import { errorMessage } from "./uiHelpers.js";

export function wireAmbaAuthTest() {
  const button = document.getElementById("testAmbaAuth");
  const connectButton = document.getElementById("connectAmba");
  const status = document.getElementById("ambaAuthStatus");
  if (!button || !status) return;

  connectButton?.addEventListener("click", () => {
    status.classList.remove("error");
    status.textContent = "Opening AMBA connection window...";
    startOwlbearAuth();
  });

  button.addEventListener("click", async () => {
    status.classList.remove("error");
    status.textContent = "Checking AMBA auth...";
    button.disabled = true;

    try {
      const user = await getCurrentUser();
      status.textContent = `AMBA auth OK: ${user.name ?? user.email ?? user.id}`;
    } catch (error) {
      status.textContent = errorMessage(error, "Unable to authenticate with AMBA.");
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
  });
}

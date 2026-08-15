import { isTrustedOwlbearAuthOrigin, storeOwlbearAuthToken } from "./ambaApi.js";

export function wireOwlbearAuthBridge() {
  window.addEventListener("message", (event) => {
    if (!isTrustedOwlbearAuthOrigin(event.origin)) return;
    if (event.data?.type !== "amba-owlbear-auth" || typeof event.data.token !== "string") return;

    storeOwlbearAuthToken(event.data.token);
    window.location.reload();
  });
}

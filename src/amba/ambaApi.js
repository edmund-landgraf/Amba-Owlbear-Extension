const AMBA_BASE_URL = "http://localhost:5190";

async function getJson(path) {
  const response = await fetch(`${AMBA_BASE_URL}${path}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `AMBA request failed: ${response.status}`);
  }

  return response.json();
}

export function getTestUserModules() {
  return getJson("/api/dev/test-user/modules");
}

export function getPcs(moduleId) {
  return getJson(`/api/modules/${encodeURIComponent(moduleId)}/pcs`);
}

export function getPcSheetImageUrl(moduleId, pcId, color) {
  const url = new URL(
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/sheet.png`,
    AMBA_BASE_URL
  );
  if (color) url.searchParams.set("color", color);
  return url.href;
}

export function getPcTokenImageUrl(moduleId, pcId, color) {
  const url = new URL(
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/token.svg`,
    AMBA_BASE_URL
  );
  if (color) url.searchParams.set("color", color);
  return url.href;
}

export function getPcNoteImageUrl(moduleId, pcId, color) {
  const url = new URL(
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/note.svg`,
    AMBA_BASE_URL
  );
  if (color) url.searchParams.set("color", color);
  return url.href;
}

export function toAmbaUrl(path) {
  return new URL(path, AMBA_BASE_URL).href;
}

export function getModuleUrl(moduleId) {
  return `${AMBA_BASE_URL}/m/${encodeURIComponent(moduleId)}`;
}

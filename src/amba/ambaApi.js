import { devSmokeEncounter, devSmokeEncounters } from "./devSmokeEncounter.js";

// All AMBA API calls in the Owlbear extension are routed through this file.
// Keeping the base URL centralized makes it obvious where the local dev API
// lives, and gives us one future place to swap localhost for production.
const AMBA_BASE_URL = import.meta.env.VITE_AMBA_BASE_URL ?? "";
const AMBA_AUTH_BASE_URL = import.meta.env.VITE_AMBA_BASE_URL || "http://localhost:5190";
const OWLBEAR_AUTH_TOKEN_KEY = "amba.owlbear.authToken";

function toApiUrl(path) {
  return `${AMBA_BASE_URL}${toExtensionApiPath(path)}`;
}

function toAssetUrl(path) {
  return new URL(path, AMBA_BASE_URL || window.location.origin).href;
}

function toAuthenticatedAssetUrl(path) {
  return toAssetUrl(toExtensionApiPath(path));
}

// Small shared JSON helper for AMBA endpoints.
//
// The extension is running inside Owlbear, so failed requests otherwise tend to
// surface as vague browser errors. This helper tries to extract AMBA's `{error}`
// payload first, then falls back to the HTTP status.
async function getJson(path) {
  const headers = authHeaders();
  const response = await fetch(toApiUrl(path), {
    credentials: "include",
    ...(headers ? { headers } : {}),
  });

  if (!response.ok) {
    // Some AMBA errors are JSON, but CORS/network/server errors may not be.
    // The `.catch(() => null)` keeps the original failure path readable.
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `AMBA request failed: ${response.status}`);
  }

  return response.json();
}

function isMissingEndpoint(error) {
  return error instanceof Error && /AMBA request failed:\s*404|Cannot GET/i.test(error.message);
}

function isDevReadableFallback(error) {
  return error instanceof Error && /AMBA request failed:\s*401|Not authenticated/i.test(error.message);
}

async function fallbackToDevSmoke(moduleId, error) {
  const smoke = devSmokeEncounters(moduleId);
  if (smoke && (isMissingEndpoint(error) || isDevReadableFallback(error))) return smoke;
  throw error;
}

function flattenContainers(containers = [], parent = null) {
  const flattened = [];
  for (const container of containers) {
    const containerWithParent = parent && !container.parent ? { ...container, parent } : container;
    flattened.push(containerWithParent);
    flattened.push(...flattenContainers(container.children, containerWithParent));
  }
  return flattened;
}

function artifactTypeKey(artifact) {
  return artifact?.artifactType?.key ?? artifact?.artifactTypeKey ?? artifact?.type;
}

function firstArtifactOfType(container, type) {
  return (container.artifacts ?? []).find((artifact) => artifactTypeKey(artifact) === type);
}

function artifactsOfType(container, type) {
  return (container.artifacts ?? []).filter((artifact) => artifactTypeKey(artifact) === type);
}

function monsterBlockFromArtifact(artifact) {
  const payload = artifact.payload ?? {};
  return {
    id: artifact.id,
    artifactId: artifact.id,
    name: artifact.title ?? payload.name,
    title: artifact.title,
    quantity: payload.quantity ?? payload.count ?? 1,
    level: payload.level,
    source: payload.source,
    statBlock: payload.content ?? payload.statBlock,
  };
}

function normalizeEncounterContainer(container) {
  const metadata = container.metadata ?? {};
  const parent = container.parent;
  const parentType = parent?.containerType?.key ?? parent?.containerTypeKey ?? parent?.type;
  const sceneName =
    metadata.sceneName ??
    metadata.sceneTitle ??
    container.sceneName ??
    container.sceneTitle ??
    (parentType === "scene" || parentType === "subscene" ? parent?.title : undefined);
  const mapArtifact = firstArtifactOfType(container, "map");
  const mapPayload = mapArtifact?.payload ?? {};
  const monsterArtifacts = artifactsOfType(container, "monster_block");
  return {
    ...container,
    sceneName,
    map: metadata.map ??
      container.map ??
      (mapArtifact
        ? {
            id: mapArtifact.id,
            title: mapArtifact.title,
            url: mapPayload.url,
            imageUrl: mapPayload.imageUrl,
            payload: mapPayload,
            grid: mapPayload.grid,
          }
        : undefined),
    mapUrl: metadata.mapUrl ?? container.mapUrl,
    monsterBlocks:
      metadata.monsterBlocks ??
      metadata.monsters ??
      container.monsterBlocks ??
      container.monsters ??
      (monsterArtifacts.length ? monsterArtifacts.map(monsterBlockFromArtifact) : null) ??
      [],
  };
}

async function postJson(path, body = {}) {
  const headers = authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(toApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `AMBA request failed: ${response.status}`);
  }

  return response.status === 204 ? null : response.json().catch(() => null);
}

// Authenticated module picker source.
//
// The Owlbear extension should read AMBA as `{current-user}`,
// not as the old dev-only user shortcut.
export function getModules() {
  return getJson("/api/modules");
}

export function getCurrentUser() {
  return getJson("/api/auth/me");
}

export function startOwlbearAuth() {
  const url = new URL("/api/owlbear/extension/auth/start", AMBA_AUTH_BASE_URL);
  url.searchParams.set("targetOrigin", window.location.origin);
  window.open(url.href, "amba-owlbear-auth", "popup,width=520,height=420");
}

export function storeOwlbearAuthToken(token) {
  localStorage.setItem(OWLBEAR_AUTH_TOKEN_KEY, token);
}

export function isTrustedOwlbearAuthOrigin(origin) {
  return origin === new URL(AMBA_AUTH_BASE_URL).origin;
}

function authHeaders(base = {}) {
  const token = localStorage.getItem(OWLBEAR_AUTH_TOKEN_KEY);
  return token ? { ...base, Authorization: `Bearer ${token}` } : Object.keys(base).length ? base : null;
}

export function authFetchOptions(base = {}) {
  const headers = authHeaders(base.headers ?? {});
  return {
    ...base,
    credentials: base.credentials ?? "include",
    ...(headers ? { headers } : {}),
  };
}

export function authFetchOptionsForUrl(url, base = {}) {
  const parsedUrl = new URL(url, window.location.origin);
  const ambaOrigin = new URL(AMBA_BASE_URL || window.location.origin).origin;
  if (parsedUrl.origin !== ambaOrigin || !parsedUrl.pathname.startsWith("/api/")) {
    return base;
  }

  return authFetchOptions(base);
}

function toExtensionApiPath(path) {
  if (!localStorage.getItem(OWLBEAR_AUTH_TOKEN_KEY)) return path;

  if (path === "/api/auth/me") return "/api/owlbear/extension/auth/me";
  if (path === "/api/modules") return "/api/owlbear/extension/modules";

  const pcMatch = path.match(/^\/api\/modules\/([^/]+)\/pcs$/);
  if (pcMatch) return `/api/owlbear/extension/modules/${pcMatch[1]}/pcs`;

  const pcAssetMatch = path.match(/^\/api\/modules\/([^/]+)\/pcs\/([^/]+)\/(token\.svg|note\.svg|sheet\.png)$/);
  if (pcAssetMatch) {
    const [, moduleId, pcId, assetName] = pcAssetMatch;
    return `/api/owlbear/extension/modules/${moduleId}/pcs/${pcId}/${assetName}`;
  }

  const npcTokenMatch = path.match(/^\/api\/modules\/([^/]+)\/npcs\/([^/]+)\/token\.svg$/);
  if (npcTokenMatch) {
    const [, moduleId, npcId] = npcTokenMatch;
    return `/api/owlbear/extension/modules/${moduleId}/npcs/${npcId}/token.svg`;
  }

  const containersMatch = path.match(/^\/api\/modules\/([^/]+)\/containers(?:\/([^/]+))?$/);
  if (containersMatch) {
    const [, moduleId, containerId] = containersMatch;
    return `/api/owlbear/extension/modules/${moduleId}/containers${containerId ? `/${containerId}` : ""}`;
  }

  return path;
}

// Fetch all PCs for the selected module. The API includes narratives and
// artifacts because the importer may need character sheets or portrait metadata.
export function getPcs(moduleId) {
  return getJson(`/api/modules/${encodeURIComponent(moduleId)}/pcs`);
}

// Fetch encounter summaries for the selected module. The extension keeps the
// payload flexible because AMBA encounter data is still evolving.
export function getEncounters(moduleId) {
  return getJson(`/api/modules/${encodeURIComponent(moduleId)}/encounters`).catch(async (error) => {
    if (!isMissingEndpoint(error) && !isDevReadableFallback(error)) throw error;

    try {
      const containers = await getJson(`/api/modules/${encodeURIComponent(moduleId)}/containers`);
      return flattenContainers(containers)
        .filter((container) => container.containerType?.key === "encounter")
        .map(normalizeEncounterContainer);
    } catch (fallbackError) {
      return fallbackToDevSmoke(moduleId, fallbackError);
    }
  });
}

export function getContainers(moduleId) {
  return getJson(`/api/modules/${encodeURIComponent(moduleId)}/containers`);
}

// Fetch one full encounter, including map and monster block details when AMBA
// has them available.
export function getEncounter(moduleId, encounterId) {
  return getJson(
    `/api/modules/${encodeURIComponent(moduleId)}/encounters/${encodeURIComponent(encounterId)}`
  ).catch(async (error) => {
    if (!isMissingEndpoint(error) && !isDevReadableFallback(error)) throw error;

    const container = await getJson(
      `/api/modules/${encodeURIComponent(moduleId)}/containers/${encodeURIComponent(encounterId)}`
    ).catch((fallbackError) => {
      const smoke = devSmokeEncounter(moduleId, encounterId);
      if (smoke && (isMissingEndpoint(fallbackError) || isDevReadableFallback(fallbackError))) {
        return smoke;
      }
      throw fallbackError;
    });
    return normalizeEncounterContainer(container);
  });
}

export function saveOwlbearPlacements(moduleId, encounterId, payload) {
  return postJson(
    `/api/modules/${encodeURIComponent(moduleId)}/owlbear/encounters/${encodeURIComponent(encounterId)}/placements`,
    payload
  );
}

// Short URL for the rendered character sheet PNG.
//
// This intentionally returns a URL instead of base64 image data. Owlbear scene
// item validation rejects image URLs over 2048 characters, so data URLs are a
// trap here. AMBA-hosted URLs stay short and valid.
export function getPcSheetImageUrl(moduleId, pcId, color) {
  const url = new URL(
    toExtensionApiPath(`/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/sheet.png`),
    AMBA_BASE_URL || window.location.origin
  );
  // The API uses this color as an accent when rendering the sheet image.
  if (color) url.searchParams.set("color", color);
  return url.href;
}

// Short URL for the generated 512x512 PC token SVG.
//
// The server draws the colored circle and first-letter label. The extension can
// either reference this URL directly on scene items or rasterize it for Owlbear
// asset uploads.
export function getPcTokenImageUrl(moduleId, pcId, color) {
  const url = new URL(
    toExtensionApiPath(`/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/token.svg`),
    AMBA_BASE_URL || window.location.origin
  );
  // The color query parameter lets the importer rotate token colors per PC.
  if (color) url.searchParams.set("color", color);
  return url.href;
}

// Best-effort conventional URL for generated NPC/monster SVG tokens. If AMBA
// returns an explicit token URL in the encounter payload, the importer uses
// that instead.
export function getMonsterTokenImageUrl(moduleId, monsterId, color, options = {}) {
  const url = new URL(
    toExtensionApiPath(`/api/modules/${encodeURIComponent(moduleId)}/npcs/${encodeURIComponent(monsterId)}/token.svg`),
    AMBA_BASE_URL || window.location.origin
  );
  if (color) url.searchParams.set("color", color);
  if (options.label) url.searchParams.set("label", options.label);
  if (options.fontSize) url.searchParams.set("fontSize", String(options.fontSize));
  return url.href;
}

// Short URL for a generated note backing image.
//
// This is currently less important now that note cards are shape+text items,
// but it remains useful for experiments or image-backed note imports.
export function getPcNoteImageUrl(moduleId, pcId, color) {
  const url = new URL(
    toExtensionApiPath(`/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/note.svg`),
    AMBA_BASE_URL || window.location.origin
  );
  // The color query parameter matches the generated token color.
  if (color) url.searchParams.set("color", color);
  return url.href;
}

// Convert a relative AMBA asset path into an absolute URL that Owlbear can load.
// Portrait metadata may come back as a relative path, while Owlbear item images
// require absolute URLs.
export function toAmbaUrl(path) {
  return toAuthenticatedAssetUrl(path);
}

// Convenience URL for opening the selected AMBA module in the normal AMBA UI.
// Not part of the current import flow, but useful for debugging/navigation.
export function getModuleUrl(moduleId) {
  return toAssetUrl(`/m/${encodeURIComponent(moduleId)}`);
}

// All AMBA API calls in the Owlbear extension are routed through this file.
// Keeping the base URL centralized makes it obvious where the local dev API
// lives, and gives us one future place to swap localhost for production.
const AMBA_BASE_URL = import.meta.env.VITE_AMBA_BASE_URL ?? "";

function toApiUrl(path) {
  return `${AMBA_BASE_URL}${path}`;
}

function toAssetUrl(path) {
  return new URL(path, AMBA_BASE_URL || window.location.origin).href;
}

// Small shared JSON helper for AMBA endpoints.
//
// The extension is running inside Owlbear, so failed requests otherwise tend to
// surface as vague browser errors. This helper tries to extract AMBA's `{error}`
// payload first, then falls back to the HTTP status.
async function getJson(path) {
  const response = await fetch(toApiUrl(path));

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

function flattenContainers(containers = []) {
  const flattened = [];
  for (const container of containers) {
    flattened.push(container);
    flattened.push(...flattenContainers(container.children));
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
  const mapArtifact = firstArtifactOfType(container, "map");
  const mapPayload = mapArtifact?.payload ?? {};
  const monsterArtifacts = artifactsOfType(container, "monster_block");
  return {
    ...container,
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
  const response = await fetch(toApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `AMBA request failed: ${response.status}`);
  }

  return response.status === 204 ? null : response.json().catch(() => null);
}

// Dev-only module picker source.
//
// Owlbear does not know which AMBA module the user is looking at, so the
// extension asks the local dev API for modules owned by `test-user@localhost`.
export function getTestUserModules() {
  return getJson("/api/dev/test-user/modules");
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
    if (!isMissingEndpoint(error)) throw error;

    const module = await getJson(`/api/modules/${encodeURIComponent(moduleId)}`);
    return flattenContainers(module.containers)
      .filter((container) => container.containerType?.key === "encounter")
      .map(normalizeEncounterContainer);
  });
}

// Fetch one full encounter, including map and monster block details when AMBA
// has them available.
export function getEncounter(moduleId, encounterId) {
  return getJson(
    `/api/modules/${encodeURIComponent(moduleId)}/encounters/${encodeURIComponent(encounterId)}`
  ).catch(async (error) => {
    if (!isMissingEndpoint(error)) throw error;

    const container = await getJson(
      `/api/modules/${encodeURIComponent(moduleId)}/containers/${encodeURIComponent(encounterId)}`
    );
    return normalizeEncounterContainer(container);
  });
}

// Queue consumed by the Owlbear extension. AMBA pushes into this queue when the
// user right-clicks an encounter and chooses "Export to Owlbear".
export function getOwlbearExportQueue() {
  return getJson("/api/owlbear/export-queue");
}

export function completeOwlbearExport(queueItemId, result) {
  return postJson(`/api/owlbear/export-queue/${encodeURIComponent(queueItemId)}/complete`, result);
}

export function failOwlbearExport(queueItemId, error) {
  return postJson(`/api/owlbear/export-queue/${encodeURIComponent(queueItemId)}/fail`, {
    error: error instanceof Error ? error.message : String(error),
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
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/sheet.png`,
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
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/token.svg`,
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
    `/api/modules/${encodeURIComponent(moduleId)}/npcs/${encodeURIComponent(monsterId)}/token.svg`,
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
    `/api/modules/${encodeURIComponent(moduleId)}/pcs/${encodeURIComponent(pcId)}/note.svg`,
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
  return toAssetUrl(path);
}

// Convenience URL for opening the selected AMBA module in the normal AMBA UI.
// Not part of the current import flow, but useful for debugging/navigation.
export function getModuleUrl(moduleId) {
  return toAssetUrl(`/m/${encodeURIComponent(moduleId)}`);
}

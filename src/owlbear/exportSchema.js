export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_EXPORT_BYTES = 512 * 1024;

const PLACEMENT_KINDS = new Set(["encounter-map", "monster-token", "monster-stat-card"]);

const DOCUMENT_FIELDS = new Set(["schemaVersion", "idempotencyKey", "moduleId", "encounterId", "scene", "placements"]);
const SCENE_FIELDS = new Set(["encounterId", "title"]);
const PLACEMENT_FIELDS = new Set([
  "tokenKey",
  "owlbearItemId",
  "kind",
  "sourceId",
  "monsterId",
  "tokenInstanceId",
  "name",
  "layer",
  "position",
  "rotation",
  "scale",
]);

function unknownFields(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function assertUrl(value, label, errors) {
  if (value == null || value === "") return;
  if (typeof value !== "string") {
    errors.push(`${label} must be a string.`);
    return;
  }
  if (value.startsWith("/") && !value.startsWith("//")) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") errors.push(`${label} must be http(s).`);
  } catch {
    errors.push(`${label} is not a URL.`);
  }
}

export function stableTokenKey({ moduleId, encounterId, kind, sourceId, copy = 1 }) {
  const parts = [moduleId, encounterId, kind, sourceId, String(copy)].map((part) => String(part ?? "").trim());
  if (parts.some((part) => !part)) throw new Error("A stable token key needs module, encounter, kind, source, and copy.");
  return `amba:${parts.join(":")}`;
}

export function validateExportDocument(document) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { ok: false, errors: ["Export document must be an object."] };
  }

  const unexpected = unknownFields(document, DOCUMENT_FIELDS);
  if (unexpected.length) errors.push(`Unknown export fields: ${unexpected.join(", ")}.`);
  if (document.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EXPORT_SCHEMA_VERSION}.`);
  }
  for (const field of ["idempotencyKey", "moduleId", "encounterId"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) errors.push(`${field} is required.`);
  }
  if (!document.scene || typeof document.scene !== "object" || Array.isArray(document.scene)) {
    errors.push("scene is required.");
  } else {
    const sceneUnknown = unknownFields(document.scene, SCENE_FIELDS);
    if (sceneUnknown.length) errors.push(`Unknown scene fields: ${sceneUnknown.join(", ")}.`);
    if (document.scene.encounterId !== document.encounterId) errors.push("scene.encounterId must match encounterId.");
  }
  if (!Array.isArray(document.placements) || !document.placements.length) {
    errors.push("placements must be a non-empty array.");
  } else {
    const keys = new Set();
    for (const [index, placement] of document.placements.entries()) {
      if (!placement || typeof placement !== "object" || Array.isArray(placement)) {
        errors.push(`placements[${index}] must be an object.`);
        continue;
      }
      const placementUnknown = unknownFields(placement, PLACEMENT_FIELDS);
      if (placementUnknown.length) errors.push(`placements[${index}] unknown fields: ${placementUnknown.join(", ")}.`);
      if (!PLACEMENT_KINDS.has(placement.kind)) errors.push(`placements[${index}].kind is not allowed.`);
      if (typeof placement.tokenKey !== "string" || !placement.tokenKey.startsWith("amba:")) {
        errors.push(`placements[${index}].tokenKey must be an amba: key.`);
      } else if (keys.has(placement.tokenKey)) {
        errors.push(`Duplicate tokenKey ${placement.tokenKey}.`);
      } else {
        keys.add(placement.tokenKey);
      }
      if (!placement.position || !Number.isFinite(placement.position.x) || !Number.isFinite(placement.position.y)) {
        errors.push(`placements[${index}].position must be numeric.`);
      }
      assertUrl(placement.imageUrl, `placements[${index}].imageUrl`, errors);
    }
  }

  const bytes = new TextEncoder().encode(JSON.stringify(document)).length;
  if (bytes > MAX_EXPORT_BYTES) errors.push(`Export payload is ${bytes} bytes; limit is ${MAX_EXPORT_BYTES}.`);
  return { ok: errors.length === 0, errors };
}

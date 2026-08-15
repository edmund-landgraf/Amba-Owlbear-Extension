# AMBA Owlbear Settings Page Implementation

This document describes an AMBA-side Owlbear page dedicated to configuring and monitoring the Owlbear Rodeo integration.

The Owlbear extension itself should stay small. It runs inside Owlbear Rodeo and should focus on importing queued AMBA content into the current room. AMBA should own the durable configuration: which server hosts the extension, which module is active, which encounters are queued, and which options are available in the current deployment.

## Goal

Add a dedicated AMBA page:

```text
/settings/owlbear
```

Working title:

```text
Owlbear Rodeo Integration
```

The page should give the GM one place to:

- See whether the Owlbear extension server is available.
- Copy the extension manifest URL used in Owlbear Rodeo.
- Understand whether the extension is running in local dev or production mode.
- See or change the active AMBA module used by Owlbear.
- View and manage the Owlbear encounter export queue.
- Configure import behavior that is safe to change per user/module.
- View read-only server-level settings that require deployment or environment changes.

## Page Shape

Use a normal authenticated AMBA settings page. Do not put this inside the Owlbear extension iframe.

Suggested route:

```text
GET /settings/owlbear
```

Suggested navigation placement:

```text
Settings -> Integrations -> Owlbear Rodeo
```

This should be GM/admin-visible. Players do not need this page for v0.

## Primary Panels

### Extension Server

This is the top panel. It should answer: "Can Owlbear load our extension right now?"

Fields:

| Field | Editable | Source | Notes |
|---|---:|---|---|
| Extension enabled | Yes | DB config | Allows AMBA to disable queue actions without removing code. |
| Environment | No | server/env | `development`, `staging`, or `production`. |
| Extension manifest URL | No or server-admin only | server/env | Example: `https://amba.example.com/owlbear/manifest.json`. |
| Extension app URL | No | server/env | Usually the app URL from the manifest action. |
| AMBA API base URL | No | server/env | Must be reachable from the browser running Owlbear. |
| Server health | No | health probe | Shows whether the manifest and app root respond. |
| Last checked | No | health probe | Timestamp from AMBA server. |

Actions:

- `Check extension server`
- `Copy manifest URL`
- `Open manifest`
- `Open Owlbear extension loading instructions`

Health checks:

```text
GET {manifestUrl}
GET {extensionAppUrl}
GET {ambaApiBaseUrl}/api/owlbear/config
```

The health check should be run by AMBA server code if possible, then displayed to the user. Client-side checks are useful too, but browser CORS can make them look broken even when the server can reach the resource.

Read-only warning text:

```text
Some values are controlled by server environment variables and cannot be changed here.
Update the production server configuration and redeploy to change them.
```

### Active Module

This panel controls which AMBA module the Owlbear extension should use by default.

Fields:

| Field | Editable | Source | Notes |
|---|---:|---|---|
| Current Owlbear module | Yes | user/module config | Defaults to the last module opened by the GM in AMBA. |
| Auto-follow last opened module | Yes | user config | If enabled, changing modules in AMBA updates Owlbear config. |
| Debug module access | No | server/env or role | Development can expose all modules; production should not. |

Behavior:

1. In production, the extension should not present a broad module browser.
2. AMBA should expose the current module through `GET /api/owlbear/config`.
3. When the GM changes modules in AMBA, AMBA can update the current Owlbear module automatically if `autoFollowLastOpenedModule` is enabled.
4. In debug mode, AMBA may allow a wider module picker, but the page should make that obvious.

Recommended config response:

```json
{
  "enabled": true,
  "environment": "production",
  "debug": false,
  "currentModule": {
    "id": "module-id",
    "title": "The Quiet Trout"
  },
  "extension": {
    "manifestUrl": "https://amba.example.com/owlbear/manifest.json",
    "appUrl": "https://amba.example.com/owlbear/"
  },
  "features": {
    "queue": true,
    "placementSave": true,
    "sceneUpload": false,
    "assetLibraryUpload": false
  }
}
```

### Encounter Queue

This panel shows the AMBA-side queue consumed by the Owlbear extension.

Fields:

| Field | Editable | Source | Notes |
|---|---:|---|---|
| Queue scope | No or admin | server policy | v0 should be current user + current module. |
| Queued encounters | Yes | DB queue | List pending encounter exports. |
| Last export result | No | DB queue/result | Result from extension completion callback. |
| Last error | No | DB queue/result | Error from extension failure callback. |

Actions:

- `Clear queue`
- `Remove from queue`
- `Open encounter`
- `Copy queue API debug info`

Queue item minimum shape:

```json
{
  "id": "queue-item-id",
  "moduleId": "module-id",
  "encounterId": "encounter-id",
  "title": "Guard Post",
  "status": "pending",
  "createdAt": "2026-08-15T15:00:00.000Z",
  "requestedByUserId": "user-id"
}
```

Queue items should include export options when the user adds an encounter from AMBA:

```json
{
  "id": "queue-item-id",
  "moduleId": "module-id",
  "encounterId": "encounter-id",
  "exportOptions": {
    "importMap": true,
    "importMonsterTokens": true,
    "importMonsterStatCards": true,
    "includePcTokens": false,
    "clearSceneBeforeImport": false,
    "saveTokenPlacements": "manual"
  }
}
```

The extension can still expose local overrides, but AMBA should be the durable owner of defaults and queued intent.

Required endpoints:

```text
GET    /api/owlbear/export-queue
POST   /api/owlbear/export-queue
POST   /api/owlbear/export-queue/:queueItemId/complete
POST   /api/owlbear/export-queue/:queueItemId/fail
DELETE /api/owlbear/export-queue/:queueItemId
DELETE /api/owlbear/export-queue
```

The existing extension already attempts to call `GET /api/owlbear/export-queue` and completion/failure endpoints. Until these exist, the extension falls back to the selected dev module/encounter.

### Import Defaults

These are user/module-level options that can be safely changed from the AMBA UI.

| Setting | Editable | Default | Notes |
|---|---:|---|---|
| Import mode | Yes | `upsert-current-scene` | v0 should use current scene upsert. |
| Clear scene before import | Yes | `false` | Dangerous enough to require an explicit button in Owlbear too. |
| Import map | Yes | `true` | Disable for theater-of-mind encounters. |
| Import monster tokens | Yes | `true` | Core v0 behavior. |
| Import monster stat cards | Yes | `true` | Current extension supports this. |
| Import PC tokens | Yes | `false` | Avoid repeated PC token dumping by default. |
| Save token placements | Yes | `manual` | Manual button first; automatic sync later if proven safe. |
| Token label style | Yes | `compact` | Example labels: `Gb1`, `Gb2`, `Gi1`. |
| Token staging columns | Yes | `8` | Controls dump layout before GM drags tokens. |

### Encounter Export Analysis

When AMBA loads an encounter in its own UI, the Owlbear panel should show whether the encounter is ready for export.

Recommended fields:

| Field | Source | Notes |
|---|---|---|
| Has map | Encounter map artifact | Boolean. |
| Map URL | Map artifact payload | Must be reachable from Owlbear browser context. |
| Map dimensions | Server image probe | Width/height in pixels. |
| Grid cell size | Map metadata | AMBA maps use 1 square = 5 ft. |
| Grid dimensions | Map metadata or derived | Example: `24 x 18 squares`. |
| Monster block count | Encounter artifacts | Count of `monster_block` artifacts. |
| Planned monster tokens | Sum quantities | Example: two goblins + one rat = 3 tokens. |
| Export warnings | Validation | Missing map URL, missing CORS, missing monster blocks, unknown grid size. |

Suggested endpoint:

```text
GET /api/modules/:moduleId/owlbear/encounters/:encounterId/export-analysis
```

Suggested response:

```json
{
  "encounterId": "encounter-id",
  "title": "Guard Post",
  "map": {
    "present": true,
    "ready": true,
    "artifactId": "map-artifact-id",
    "url": "/uploads/module-id/map.png",
    "width": 2048,
    "height": 1536,
    "grid": {
      "cellSize": 128,
      "columns": 16,
      "rows": 12,
      "scale": "5 ft"
    }
  },
  "monsterBlocks": {
    "count": 2,
    "plannedTokens": 5
  },
  "warnings": []
}
```

The extension now performs a browser-side version of this analysis when an encounter is selected. AMBA should eventually provide the same facts server-side so the AMBA page and Owlbear extension agree before export.

Import mode options:

```text
upsert-current-scene
clear-current-scene-and-import
create-owlbear-scene-upload
```

For v0, only `upsert-current-scene` and explicit `clear-current-scene-and-import` are practical. Creating a saved Owlbear scene may trigger Owlbear asset picker flows and should be treated as a later workflow.

### Placement Sync

This panel tracks whether AMBA can remember token positions after the GM drags them in Owlbear.

Fields:

| Field | Editable | Source | Notes |
|---|---:|---|---|
| Placement save enabled | Yes | DB config | Enables the extension's save button. |
| Placement endpoint status | No | health probe | Verifies AMBA route exists. |
| Last placement save | No | DB placement table | Timestamp/count. |
| Stored placements | No | DB placement table | Count for the current module/encounter. |

Required endpoint:

```text
POST /api/modules/:moduleId/owlbear/encounters/:encounterId/placements
```

Expected payload from the extension:

```json
{
  "scene": {
    "encounterId": "encounter-id",
    "title": "Guard Post"
  },
  "placements": [
    {
      "owlbearItemId": "owlbear-scene-item-id",
      "kind": "monster-token",
      "sourceId": "monster-block-artifact-id",
      "monsterId": "monster-id",
      "tokenInstanceId": "goblin-warrior-1",
      "name": "Gb1 Goblin Warrior",
      "layer": "CHARACTER",
      "position": { "x": 1200, "y": 800 },
      "rotation": 0,
      "scale": { "x": 1, "y": 1 }
    }
  ]
}
```

AMBA should upsert placements by:

```text
moduleId + encounterId + tokenInstanceId
```

Do not use the Owlbear item ID as the only stable key. Owlbear item IDs can change if an item is deleted and recreated.

### Server-Level Configuration

Some settings should be displayed but not editable in the AMBA page because they are deployment concerns.

| Setting | Editable | Recommended source |
|---|---:|---|
| `OWLBEAR_EXTENSION_BASE_URL` | No | environment variable |
| `OWLBEAR_MANIFEST_URL` | No | environment variable or derived config |
| `OWLBEAR_AMBA_API_BASE_URL` | No | environment variable |
| `OWLBEAR_EXTENSION_MODE` | No | environment variable |
| `OWLBEAR_ALLOWED_ORIGINS` | No | server CORS config |
| `OWLBEAR_ENABLE_DEBUG_MODULE_PICKER` | No | environment variable |
| `OWLBEAR_ENABLE_SCENE_UPLOAD` | No | environment variable/feature flag |
| `OWLBEAR_ENABLE_ASSET_LIBRARY_UPLOAD` | No | environment variable/feature flag |

Display these in a "Server Configuration" panel with a lock/read-only visual treatment. Include enough detail for the GM/admin to tell whether production is configured correctly, but do not allow accidental browser-side edits that cannot take effect until redeploy.

## Data Model Additions

Suggested tables or equivalent persisted records:

### OwlbearIntegrationSettings

```text
id
userId
currentModuleId
autoFollowLastOpenedModule
enabled
importMode
importMap
importMonsterTokens
importMonsterStatCards
importPcTokens
saveTokenPlacements
tokenLabelStyle
tokenStagingColumns
createdAt
updatedAt
```

Depending on AMBA's ownership model, this may be scoped by user, campaign, module, or organization. For v0, user scope plus current module is enough.

### OwlbearExportQueueItem

```text
id
userId
moduleId
encounterId
status
requestedByUserId
completedAt
failedAt
resultJson
errorMessage
createdAt
updatedAt
```

Statuses:

```text
pending
importing
completed
failed
cancelled
```

For v0, the extension can consume `pending` items and then call complete/fail. If concurrent Owlbear windows become a problem, add a lease:

```text
leasedBy
leasedUntil
```

### OwlbearTokenPlacement

```text
id
userId
moduleId
encounterId
tokenInstanceId
sourceId
monsterId
owlbearItemId
name
layer
x
y
rotation
scaleX
scaleY
savedAt
createdAt
updatedAt
```

Unique key:

```text
userId + moduleId + encounterId + tokenInstanceId
```

If placement should be shared across all GMs for a module, replace `userId` with the relevant campaign/module ownership scope.

## Backend Endpoints

### Config

```text
GET /api/owlbear/config
```

Returns active module, feature flags, import defaults, extension URLs, and read-only server config status.

```text
POST /api/owlbear/config/current-module
```

Updates the current Owlbear module.

```text
PATCH /api/owlbear/config/import-defaults
```

Updates editable import defaults.

### Health

```text
GET /api/owlbear/health
```

Returns server-side checks for manifest URL, extension app URL, config endpoint availability, queue endpoint availability, and placement endpoint availability.

### Queue

```text
GET    /api/owlbear/export-queue
POST   /api/owlbear/export-queue
POST   /api/owlbear/export-queue/:queueItemId/complete
POST   /api/owlbear/export-queue/:queueItemId/fail
DELETE /api/owlbear/export-queue/:queueItemId
DELETE /api/owlbear/export-queue
```

### Placement

```text
GET  /api/modules/:moduleId/owlbear/encounters/:encounterId/placements
POST /api/modules/:moduleId/owlbear/encounters/:encounterId/placements
```

The `GET` endpoint lets the extension reapply stored placements during upsert imports. The `POST` endpoint stores positions after the GM drags tokens in Owlbear.

## AMBA UI Wireframe

```text
Owlbear Rodeo Integration

[Extension Server]
Enabled:                 [x]
Environment:             production                       (read only)
Manifest URL:            https://.../owlbear/manifest.json (read only) [Copy] [Open]
Extension app URL:       https://.../owlbear/              (read only)
AMBA API base URL:       https://...                       (read only)
Health:                  Healthy / Warning / Failed        [Check]

[Active Module]
Current Owlbear module:  [The Quiet Trout v]
Auto-follow last module: [x]
Debug module access:     Off                               (read only)

[Encounter Queue]
Pending exports:         3
------------------------------------------------------------
Guard Post               Pending      [Open] [Remove]
Webbed Lair              Pending      [Open] [Remove]
Barracks                 Failed       [Open] [Retry] [Remove]
------------------------------------------------------------
[Clear Queue]

[Import Defaults]
Import mode:             [Upsert current scene v]
Import map:              [x]
Import monster tokens:   [x]
Import stat cards:       [x]
Import PC tokens:        [ ]
Save placements:         [Manual v]
Token label style:       [Compact v]
Token staging columns:   [8]

[Selected Encounter Export Analysis]
Map:                     Ready, 2048 x 1536 PNG, 128px/square, 1 square = 5 ft
Monster blocks:          2 blocks, 5 planned tokens
Warnings:                None

[Placement Sync]
Endpoint:                Available
Last save:               2026-08-15 14:23, 6 tokens
Stored placements:       6 for selected encounter

[Server Configuration]
OWLBEAR_EXTENSION_BASE_URL       https://...    (read only)
OWLBEAR_ALLOWED_ORIGINS          ...            (read only)
OWLBEAR_ENABLE_DEBUG_MODULE_PICKER false        (read only)
```

## Extension Server Panel Details

The extension server panel should not try to start or stop the extension from the browser. In production, the extension should be hosted as static files behind nginx, Apache, a CDN, or AMBA's static file server. Process ownership belongs to the Linux host, systemd, Docker, or the chosen deployment mechanism.

Good editable controls:

- Enable/disable integration for this AMBA user/module.
- Copy or open URLs.
- Run health checks.
- Show install instructions.

Bad editable controls:

- Change the production manifest URL without changing server config.
- Change CORS origins from the browser.
- Start/stop systemd services from a regular web settings page.
- Edit production filesystem paths.

If AMBA later gets a server-admin area, these controls can move there with proper authorization.

## Security And Auth

The Owlbear extension runs in a browser iframe loaded by Owlbear Rodeo. Any AMBA API used by the extension must be intentionally exposed to that browser context.

Rules:

1. Queue endpoints must be authenticated.
2. Queue results must be scoped to the AMBA user/module/session.
3. Production should not expose the dev test-user module endpoint.
4. CORS should allow Owlbear extension origins, not arbitrary origins.
5. Read-only server config should not leak secrets.
6. Health checks should report booleans/statuses, not private deployment paths.

For local development, test users and permissive localhost behavior are acceptable. For production, the Owlbear settings page should make the active auth mode explicit.

## What Is Read-Only Versus Editable

Editable in AMBA:

- Integration enabled.
- Current Owlbear module.
- Auto-follow last opened module.
- Import defaults.
- Queue contents.
- Placement sync toggle.

Read-only in AMBA:

- Manifest URL, unless the user is a server admin and AMBA supports persistent server config edits.
- Extension base URL.
- API base URL.
- Environment/mode.
- CORS origins.
- Whether dev/debug module picker is enabled.
- Whether the extension static files are currently deployed.

## Implementation Order

1. Add route and blank page shell at `/settings/owlbear`.
2. Add config object and DB persistence for editable user/module settings.
3. Add read-only server config projection from environment variables.
4. Add health endpoint and extension server panel.
5. Add current-module selector and auto-follow behavior.
6. Add queue table and queue endpoints.
7. Add encounter right-click/menu action: `Add to Owlbear queue`.
8. Add placement endpoint and placement status panel.
9. Update the Owlbear extension to consume `GET /api/owlbear/config` before loading queue data.
10. Remove or hide dev-only broad module dropdown in production mode.

## Acceptance Criteria

- A GM can open `/settings/owlbear` in AMBA.
- The page shows the manifest URL needed by Owlbear Rodeo.
- The page can verify whether the extension server is reachable.
- Server-level values are visible but read-only.
- The GM can choose the current Owlbear module.
- The GM can see and clear the Owlbear encounter queue.
- Right-clicking an AMBA encounter can add it to the queue.
- The Owlbear extension can load config and queue data without showing every AMBA module.
- If placement sync is enabled, AMBA can receive saved token positions from the extension.
- Production mode does not expose test-user/debug module access.

## Related Docs

- [AMBA Owlbear Configuration Flow](./amba-owlbear-configuration-flow.md)
- [Owlbear Placement Sync And Upsert Guide](./placement-sync-upsert-guide.md)
- [Linux Production Hosting](./linux-production-hosting.md)
- [Loading The AMBA Extension In Owlbear Rodeo](./loading-extension.md)

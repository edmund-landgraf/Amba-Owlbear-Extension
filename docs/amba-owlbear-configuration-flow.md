# AMBA Owlbear Configuration Flow

This document describes the intended AMBA-side configuration flow for the Owlbear extension.

The goal is to keep the Owlbear extension small and focused in production. AMBA should decide which module is active and which encounters are eligible for Owlbear export. The Owlbear extension should consume that state instead of presenting every module and every encounter to the GM.

## Problem

During development, it is useful for the Owlbear extension to access any test module.

Current debug behavior:

- Extension loads test-user modules.
- Extension shows a module dropdown.
- GM can choose a module.
- GM can browse encounters for that module.

That is useful for testing, but it is too broad for production. In production, the GM is usually running one current AMBA module/campaign/session. The Owlbear extension should default to that context and avoid showing a giant module/encounter browser.

## Production Principle

AMBA owns campaign/module context.

Owlbear owns scene mutation.

That means:

- AMBA knows which module the user is currently running.
- AMBA knows which encounters the user explicitly queued for Owlbear.
- Owlbear extension reads that configured state and imports only those queued encounters.

The extension should not be the primary module browser in production.

## AMBA Configuration Screen

AMBA should have a screen or panel for configuring the Owlbear integration.

Working name:

```text
Owlbear Integration
```

This screen should let the user:

1. See whether Owlbear integration is enabled.
2. See the current Owlbear extension manifest URL.
3. See the current active module for Owlbear export.
4. Change or confirm the active module.
5. See the current Owlbear encounter queue.
6. Clear queued exports.
7. Copy loading/setup instructions if needed.

Possible AMBA route:

```text
/settings/owlbear
```

or module-scoped:

```text
/m/:moduleId/owlbear
```

## Current Module Selection

AMBA should persist a user's current Owlbear module.

Source of truth:

```text
last module the user loaded in AMBA
```

Behavior:

1. User opens an AMBA module.
2. AMBA records that module as the user's current Owlbear module.
3. User changes modules in AMBA.
4. AMBA updates the current Owlbear module.
5. Owlbear extension loads.
6. Extension asks AMBA for Owlbear configuration.
7. AMBA returns the current module.
8. Extension uses that module automatically.

Recommended endpoint:

```text
GET /api/owlbear/config
```

Example response:

```json
{
  "enabled": true,
  "mode": "production",
  "currentModule": {
    "id": "module-id",
    "title": "The Quiet Trout"
  }
}
```

Recommended update endpoint:

```text
POST /api/owlbear/config/current-module
```

Example body:

```json
{
  "moduleId": "module-id"
}
```

AMBA can call this internally whenever the user changes modules. The Owlbear extension does not need to call it during normal production use.

## Debug Mode Vs Production Mode

The extension should support two modes.

### Debug Mode

Debug mode is for local development.

Behavior:

- Show module dropdown.
- Load modules from the dev/test endpoint.
- Allow manual encounter browsing.
- Allow direct test imports.

Current debug endpoint:

```text
GET /api/dev/test-user/modules
```

Debug mode should remain available because it is useful while building and testing the extension.

### Production Mode

Production mode is for real games.

Behavior:

- Do not show the full module dropdown by default.
- Load Owlbear config from AMBA.
- Show the current module as read-only context.
- Load encounter dropdown from the Owlbear queue, not from all module encounters.
- Import only queued encounters.

Production should avoid overwhelming the control surface.

## V0 Queue Behavior

For v0, the production flow should be queue-first.

In AMBA:

1. User right-clicks an encounter.
2. User chooses:

   ```text
   Add to Owlbear encounter queue
   ```

3. AMBA adds the encounter to the Owlbear queue.

In Owlbear:

1. Extension loads.
2. Extension reads Owlbear config.
3. Extension reads Owlbear encounter queue.
4. Encounter dropdown shows only queued encounters.
5. GM selects a queued encounter or imports all queued encounters.
6. Extension pulls full encounter data for each queued item.
7. Extension imports map and monster tokens.
8. Extension marks queue item complete or failed.

This keeps the Owlbear UI simple:

```text
Current Module: The Quiet Trout

Queued Encounters:
[Goblin Ambush v]

[Import queued encounter]
[Import all queued]
```

## Queue API

Current proposed queue endpoints:

```text
GET  /api/owlbear/export-queue
POST /api/owlbear/export-queue/:queueItemId/complete
POST /api/owlbear/export-queue/:queueItemId/fail
```

For production, queue items should be scoped to the current authenticated user and current Owlbear module.

Example queue response:

```json
{
  "currentModule": {
    "id": "module-id",
    "title": "The Quiet Trout"
  },
  "items": [
    {
      "id": "queue-item-id",
      "moduleId": "module-id",
      "encounterId": "encounter-id",
      "title": "Goblin Ambush",
      "createdAt": "2026-08-15T12:00:00Z"
    }
  ]
}
```

The extension should accept either:

- an array of items,
- or an object with `{ currentModule, items }`.

The object form is better for production because it gives the extension enough context to show the current module without a separate request.

## Encounter Dropdown In Production

The production encounter dropdown should not list every encounter in the module.

It should list only queued encounters.

Reason:

- AMBA is the better place to browse/manage module content.
- Owlbear is the better place to apply selected content to a scene.
- The extension panel should stay small.
- Queuing makes the user's intent explicit.

If the queue is empty, show:

```text
No AMBA encounters queued.
```

## Right-Click AMBA Menu

AMBA encounter context menu should include:

```text
Add to Owlbear encounter queue
```

Optional later actions:

```text
Add to Owlbear queue and open instructions
Remove from Owlbear queue
Clear Owlbear queue
```

The right-click action should not require Owlbear to be open. It only pushes intent into AMBA's queue.

## Extension Startup Behavior

Production startup:

1. Render minimal UI.
2. Ask AMBA for Owlbear config.
3. Show current module.
4. Ask AMBA for Owlbear queue.
5. Populate queued encounter dropdown.
6. Disable broad module selection.

Debug startup:

1. Render debug UI.
2. Load test-user modules.
3. Enable module dropdown.
4. Enable manual encounter picker.

Mode detection options:

1. Build-time environment variable:

   ```text
   VITE_AMBA_MODE=debug
   VITE_AMBA_MODE=production
   ```

2. AMBA config response:

   ```json
   { "mode": "production" }
   ```

3. URL query parameter for local testing:

   ```text
   ?debug=1
   ```

Recommended:

- Use build-time mode for broad UI behavior.
- Let AMBA config confirm server-side production/debug behavior.

## Minimal UI Proposal

### Debug UI

```text
AMBA PCs
[Module dropdown]
[Load all PCs]
[Import character sheet images]

AMBA Encounters
[Encounter dropdown]
[Import encounter]
[Import queued exports]
```

### Production UI

```text
AMBA Owlbear
Connected to Owlbear

Current Module
The Quiet Trout

Owlbear Queue
[Queued encounter dropdown]
[Import selected]
[Import all]
[Refresh queue]
```

Optional advanced/debug area can be collapsed:

```text
Advanced
[Show debug module picker]
```

## Authentication And Scope

Production queue access must be scoped.

The extension runs in the user's browser inside Owlbear. AMBA needs to decide how the extension authenticates.

Possible approaches:

1. Existing AMBA session cookie.
   - Works if AMBA and the extension/API are same-site enough for cookies.
   - May require SameSite/CORS credentials work.

2. Short-lived Owlbear integration token.
   - AMBA configuration screen generates/copies a token.
   - Extension stores token in Owlbear metadata/local storage.
   - More explicit but more setup.

3. Room-specific integration code.
   - AMBA displays a code.
   - Extension user enters it once.
   - AMBA links Owlbear room/user to AMBA user/module.

For v0 local/dev, this can remain permissive. For production, it should not expose all modules to anyone who can load the extension URL.

## Implementation Steps

1. Add AMBA config endpoint:

   ```text
   GET /api/owlbear/config
   ```

2. Add AMBA current-module persistence.
3. Update AMBA module-open behavior to record the latest module.
4. Add AMBA right-click action:

   ```text
   Add to Owlbear encounter queue
   ```

5. Ensure queue response includes current module context.
6. Update extension startup to request config first.
7. Add production-mode UI that hides broad module browsing.
8. Change encounter dropdown source in production to queue items.
9. Keep debug dropdowns available in debug mode.
10. Add empty/loading/error states for queue.

## Open Questions

1. How will production extension requests authenticate to AMBA?
2. Should the queue be per AMBA user, per module, per Owlbear room, or a combination?
3. Should completed queue items disappear immediately or remain visible as history?
4. Should AMBA allow multiple queued encounters at once?
5. Should importing one queued encounter clear only that item or all prior items?
6. Should players ever see the Owlbear queue UI, or should it be GM-only?
7. Can/should the extension detect Owlbear role and hide queue import from players?

## Recommendation

For v0:

- AMBA has the current module.
- AMBA has the queue.
- Right-click encounter adds to queue.
- Extension loads current module read-only.
- Extension dropdown shows queued encounters only.
- Extension imports selected/all queued encounters.
- Debug mode keeps the broad module dropdown.

This gives a clean production UX without losing the flexible development tools.

# Owlbear Placement Sync And Upsert Guide

This document describes how AMBA can remember Owlbear token placement and use that remembered placement on future encounter imports.

The core idea:

1. AMBA creates Owlbear scene items with stable AMBA metadata.
2. The GM moves tokens in Owlbear.
3. The AMBA extension reads the moved token positions from Owlbear.
4. The extension posts those positions back to AMBA.
5. Future AMBA encounter imports use upsert behavior instead of delete/insert.
6. Tokens with remembered positions return to their prior Owlbear locations.

## Feasibility

This is feasible with the Owlbear SDK.

Relevant SDK capabilities available locally in `@owlbear-rodeo/sdk`:

```text
OBR.scene.items.getItems(filter)
OBR.scene.items.updateItems(filterOrItems, update)
OBR.scene.items.addItems(items)
OBR.scene.items.deleteItems(ids)
OBR.scene.items.onChange(callback)
OBR.scene.items.getItemBounds(ids)
```

Owlbear scene items include:

```text
id
position
rotation
scale
metadata
layer
name
lastModified
lastModifiedUserId
```

That is enough to:

- identify AMBA-created tokens by metadata,
- read their current Owlbear positions,
- send those positions to AMBA,
- find existing AMBA tokens during reimport,
- update existing items instead of deleting/recreating them,
- create only missing items.

## Important Distinction

Owlbear item IDs are useful, but AMBA should not rely on them as the only stable identity.

Owlbear item IDs identify a specific scene item. If an item is deleted and recreated, the Owlbear ID changes.

AMBA should use its own stable identity as the primary key:

```text
moduleId
encounterId
monsterBlockId
tokenInstanceKey
```

Owlbear item ID should be stored as a secondary reference.

## Current Metadata Foundation

The extension already stores AMBA metadata on imported items under:

```text
com.adventuremakerbyact.owlbear
```

Current examples:

```text
com.adventuremakerbyact.owlbear/moduleId
com.adventuremakerbyact.owlbear/encounterId
com.adventuremakerbyact.owlbear/monsterId
com.adventuremakerbyact.owlbear/pcId
com.adventuremakerbyact.owlbear/kind
```

For placement sync, add:

```text
com.adventuremakerbyact.owlbear/tokenInstanceKey
com.adventuremakerbyact.owlbear/monsterBlockId
```

Recommended `kind` values:

```text
monster-token
pc-token
encounter-map
```

## Token Instance Keys

Repeated monster blocks need stable instance keys.

Example AMBA encounter:

```text
Goblin x3
Goblin Rogue x2
```

Generated token labels:

```text
G1
G2
G3
Gr1
Gr2
```

Recommended token instance key:

```text
encounter:{encounterId}:monster-block:{monsterBlockId}:copy:{copyIndex}
```

Example:

```text
encounter:enc-123:monster-block:goblin:copy:0
encounter:enc-123:monster-block:goblin:copy:1
encounter:enc-123:monster-block:goblin:copy:2
encounter:enc-123:monster-block:goblin-rogue:copy:0
encounter:enc-123:monster-block:goblin-rogue:copy:1
```

This key should not depend on the Owlbear item ID.

## AMBA Placement Record

AMBA should store one placement record per token instance.

Suggested table/model:

```text
OwlbearTokenPlacement
```

Suggested fields:

```text
id
userId
moduleId
encounterId
monsterBlockId
pcId
tokenInstanceKey
owlbearRoomId
owlbearSceneId
owlbearItemId
label
name
kind
layer
positionX
positionY
rotation
scaleX
scaleY
lastSeenAt
lastSyncedAt
deletedAt
```

Notes:

- `monsterBlockId` is for monster tokens.
- `pcId` is for PC tokens.
- `owlbearSceneId` may not be available from the SDK in the way we want; if not, store room/context metadata we can access and keep AMBA's `encounterId` as the main scene context.
- `deletedAt` lets AMBA remember that the GM removed a token, if we choose to support delete sync.

## AMBA API Contract

### Pull Placement For Encounter

The extension needs prior placement when importing.

```text
GET /api/owlbear/placements?moduleId=:moduleId&encounterId=:encounterId
```

Example response:

```json
{
  "items": [
    {
      "tokenInstanceKey": "encounter:enc-123:monster-block:goblin:copy:0",
      "owlbearItemId": "owlbear-item-id",
      "position": { "x": 1200, "y": 900 },
      "rotation": 0,
      "scale": { "x": 1, "y": 1 },
      "label": "G1",
      "kind": "monster-token"
    }
  ]
}
```

### Push Placement Snapshot

The extension should be able to send a batch snapshot.

```text
POST /api/owlbear/placements
```

Example body:

```json
{
  "moduleId": "module-id",
  "encounterId": "encounter-id",
  "items": [
    {
      "tokenInstanceKey": "encounter:enc-123:monster-block:goblin:copy:0",
      "owlbearItemId": "owlbear-item-id",
      "label": "G1",
      "name": "G1 Goblin",
      "kind": "monster-token",
      "layer": "CHARACTER",
      "position": { "x": 1200, "y": 900 },
      "rotation": 0,
      "scale": { "x": 1, "y": 1 }
    }
  ]
}
```

### Mark Missing Or Deleted

Optional later endpoint:

```text
POST /api/owlbear/placements/deleted
```

This would let AMBA remember when an Owlbear token was removed from the scene.

For v0, skip delete sync and only sync positions for tokens that exist.

## Upsert Import Algorithm

Future encounter import should use this algorithm instead of delete/insert.

1. Extension receives queued encounter.
2. Extension fetches full AMBA encounter data.
3. Extension fetches saved placements for `moduleId + encounterId`.
4. Extension reads current Owlbear AMBA-owned items:

   ```js
   OBR.scene.items.getItems((item) =>
     item.metadata?.[`${NS}/moduleId`] === moduleId &&
     item.metadata?.[`${NS}/encounterId`] === encounterId
   )
   ```

5. Build desired item set from AMBA encounter:
   - map item,
   - monster token instances,
   - optional PC token staging items.

6. For each desired item, compute stable AMBA identity:
   - `kind`
   - `tokenInstanceKey`
   - `monsterBlockId` or `pcId`

7. Match desired item to current Owlbear item by metadata:

   ```text
   tokenInstanceKey
   ```

8. If item exists in Owlbear:
   - update image/name/metadata if needed,
   - preserve current position unless AMBA explicitly says to reset,
   - optionally apply saved placement if current item has default/staging position.

9. If item does not exist in Owlbear but AMBA has saved placement:
   - create item at saved position.

10. If item does not exist and AMBA has no saved placement:
   - create item in staging area.

11. Do not delete extra existing items by default.
12. Only delete extra AMBA-owned items in explicit rebuild/cleanup modes.

## Placement Priority

When deciding where a token should go:

1. Existing Owlbear item current position.
   - If the item already exists in the current scene, do not move it during an upsert unless explicitly requested.

2. AMBA saved placement.
   - If the item is missing from the current scene but AMBA remembers a prior position, create it at that position.

3. Import staging layout.
   - If AMBA has no placement, put it in the non-overlapping staging area.

This avoids surprising the GM by moving tokens that they already placed.

## Sync Timing Options

### Manual Sync

Add a GM button:

```text
Save Owlbear token positions to AMBA
```

Pros:

- Simple.
- Clear user intent.
- Lower network traffic.
- Easier to debug.

Cons:

- GM can forget to click it.

Recommended for v0.

### Auto Sync On Change

Use:

```js
OBR.scene.items.onChange(callback)
```

Filter AMBA-owned `CHARACTER` items, debounce, then post placement batch to AMBA.

Pros:

- AMBA stays current automatically.

Cons:

- More API traffic.
- Need debounce/throttle.
- Need to avoid syncing while importer is constructing/updating items.
- More edge cases around deletes and undo/redo.

Recommended after manual sync works.

### Hybrid

Auto-sync every few seconds while changes occur, plus a manual save button.

This is likely the best long-term UX.

## Extension Module Plan

Add modules:

```text
src/owlbear/placementSync.js
src/amba/placementApi.js
```

### `src/amba/placementApi.js`

Responsibilities:

- `getEncounterPlacements(moduleId, encounterId)`
- `saveEncounterPlacements(moduleId, encounterId, items)`
- optional `markPlacementsDeleted(...)`

### `src/owlbear/placementSync.js`

Responsibilities:

- Find AMBA-owned tokens in current scene.
- Convert Owlbear items to AMBA placement DTOs.
- Debounce auto-sync.
- Expose manual sync function.
- Provide helper to apply saved placement to desired items.

Possible exports:

```js
export async function saveCurrentEncounterPlacements({ moduleId, encounterId })
export async function getCurrentAmbaItems({ moduleId, encounterId })
export function placementFromItem(item)
export function applySavedPlacement(builder, placement)
```

## Importer Changes

`encounterImporter.js` should change from "always add" to "upsert".

Current behavior:

```text
build all items
addItems(items)
```

Future behavior:

```text
desired = build desired item definitions
existing = read current AMBA-owned items
placements = fetch AMBA placements

updates = desired that match existing
creates = desired that do not match existing

updateItems(updates)
addItems(creates)
```

The desired item builder should produce plain data before Owlbear builder objects when possible:

```js
{
  key: "encounter:enc-123:monster-block:goblin:copy:0",
  kind: "monster-token",
  name: "G1 Goblin",
  image,
  grid,
  defaultPosition,
  metadata
}
```

Then the upsert layer decides whether to update or create.

## Handling Maps

Maps should also get stable metadata.

Suggested key:

```text
encounter:{encounterId}:map
```

Map upsert rules:

- If the map exists, do not move it by default.
- If AMBA map image changed, update image/grid if possible.
- If map does not exist and AMBA has saved map placement, use it.
- Otherwise place map in the normal map position.

Map placement sync is useful if the GM manually aligns/resizes a map.

## Handling PC Tokens

PC tokens can also use the same system.

Suggested key:

```text
module:{moduleId}:pc:{pcId}
```

Question:

- Are PC token positions encounter-specific or module/global?

Recommended:

- Store PC token placement per encounter if the PC is staged/placed in a specific encounter scene.
- Store PC token asset identity globally if we later support Owlbear Character asset reuse.

## Conflict Cases

### Token Exists In Owlbear And AMBA Has Older Placement

Use Owlbear current position.

Reason:

- The current scene is the latest GM action.

### Token Missing In Owlbear But AMBA Has Placement

Create at AMBA saved placement.

### Token Exists Twice With Same Token Instance Key

Pick the newest modified item or the first item, and mark duplicates for cleanup.

Future UI:

```text
Found duplicate AMBA token instances. Clean up duplicates?
```

### Monster Count Changes

If count increases:

- Existing token instance keys keep positions.
- New copies stage near the map/token area.

If count decreases:

- Do not delete extra placed tokens automatically in v0.
- Mark extras as stale in UI or only remove during explicit rebuild.

This avoids accidentally deleting a GM-customized scene.

## UX Proposal

Production controls:

```text
Owlbear Queue
[Queued Encounter Dropdown]
[Import / Upsert Selected]
[Import / Upsert All]
[Save Token Positions]
[Reimport AMBA-Owned Items]
[Clear Room And Rebuild]
```

Button meanings:

- `Import / Upsert Selected`
  - Pulls selected queued encounter and upserts map/tokens.

- `Save Token Positions`
  - Reads current AMBA-owned token positions and posts them to AMBA.

- `Reimport AMBA-Owned Items`
  - Deletes AMBA-owned items for that encounter and recreates them, using saved placement where available.

- `Clear Room And Rebuild`
  - Deletes all scene items and rebuilds from AMBA.
  - Requires confirmation.

## V0 Recommendation

Implement in this order:

1. Add stable `tokenInstanceKey` metadata to monster tokens.
2. Add AMBA placement endpoints.
3. Add manual `Save Token Positions` button.
4. Save current AMBA-owned token positions to AMBA.
5. On encounter import, fetch saved placements.
6. Create missing tokens at saved placement when available.
7. Preserve existing Owlbear token positions during reimport.
8. Convert importer to true upsert with `updateItems`.
9. Add debounced auto-sync later.

This gives us the important behavior quickly:

- GM places tokens once.
- AMBA remembers positions.
- Future imports do not reset the battlefield.

## What Not To Do

Do not make default reimport delete and recreate everything.

That loses Owlbear item IDs and can destroy GM placement work.

Do not use Owlbear item ID as the only placement key.

It changes when an item is recreated.

Do not auto-delete tokens just because AMBA encounter data changed.

Monster count and encounter data changes need careful handling so the GM's scene is not unexpectedly damaged.

## Open Questions

1. Does the extension need a persistent Owlbear room ID for placement scope?
2. Can the SDK expose the current scene ID/name in a way we should store?
3. Should map alignment/resizing be synced in v0 or only token positions?
4. Should saved placements be per user, per module, per encounter, or per Owlbear room?
5. Should completed queue imports automatically trigger placement sync?
6. Should players moving their owned tokens be allowed to update AMBA placement, or only GM?
7. How should AMBA display/edit remembered Owlbear placement outside Owlbear?

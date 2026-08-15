# Owlbear API Docs Review

Review date: 2026-08-15

This document cross-checks the current Owlbear Rodeo developer/API docs against the AMBA -> Owlbear extension roadmap and current implementation.

Primary docs reviewed:

- https://docs.owlbear.rodeo/extensions/apis/scene/
- https://docs.owlbear.rodeo/extensions/apis/scene/items/
- https://docs.owlbear.rodeo/extensions/apis/scene/grid/
- https://docs.owlbear.rodeo/extensions/apis/scene/local/
- https://docs.owlbear.rodeo/extensions/apis/assets/
- https://docs.owlbear.rodeo/extensions/apis/action/
- https://docs.owlbear.rodeo/extensions/apis/context-menu/
- https://docs.owlbear.rodeo/extensions/apis/popover/
- https://docs.owlbear.rodeo/extensions/apis/modal/
- https://docs.owlbear.rodeo/extensions/apis/broadcast/
- https://docs.owlbear.rodeo/extensions/apis/room/
- https://docs.owlbear.rodeo/extensions/apis/player/
- https://docs.owlbear.rodeo/extensions/apis/party/
- https://docs.owlbear.rodeo/extensions/apis/viewport/
- https://docs.owlbear.rodeo/extensions/apis/notification/
- https://docs.owlbear.rodeo/extensions/reference/manifest/
- https://docs.owlbear.rodeo/extensions/reference/metadata/
- https://docs.owlbear.rodeo/extensions/reference/permission/
- https://docs.owlbear.rodeo/extensions/reference/items/item/
- https://docs.owlbear.rodeo/extensions/reference/items/image/
- https://docs.owlbear.rodeo/extensions/reference/items/shape/
- https://docs.owlbear.rodeo/extensions/reference/items/text/

## High-Level Result

The main architectural assumption still holds: for modern Owlbear Rodeo, AMBA integrates through a hosted extension and the Owlbear SDK. The docs still do not show a public way to self-host or directly modify Owlbear Rodeo v2 core.

The current implementation is aligned with the core APIs:

- `OBR.scene.items.addItems` for maps, tokens, shapes, and text.
- `OBR.scene.items.getItems` for upsert detection.
- `OBR.scene.items.deleteItems` for explicit clear-and-import.
- Item and scene metadata with a reverse-domain namespace.
- `OBR.assets.uploadImages` and `OBR.assets.uploadScenes` only as optional future asset-library flows, because those APIs open Owlbear picker UI.

What we missed is mostly not "core flow is wrong"; it is "there are several SDK affordances that can make the flow cleaner, safer, and more Owlbear-native."

## Important Misses And Additions

| Area | API | What We Missed | Recommended Change | Difficulty |
|---|---|---|---|---|
| Queue visibility | `OBR.action.setBadgeText`, `setBadgeBackgroundColor` | The action icon can show pending queue count without opening the panel. | After loading `GET /api/owlbear/export-queue`, set badge to pending count; clear it after import. | Easy |
| Popover usability | `OBR.action.setWidth`, `setHeight`; `OBR.popover.setWidth`, `setHeight` | The current 400x500 popover is cramped for queue/status panels. | Resize action popover dynamically for the encounter UI, or use modal for larger settings/debug views. | Easy |
| Import success UX | `OBR.notification.show` | We only show status inside the extension panel. If the panel closes, the GM loses feedback. | Show success/error toast after import, clear, and placement-save actions. | Easy |
| Permissions | `OBR.player.getRole`, `OBR.player.hasPermission`, `OBR.room.getPermissions` | We should not show destructive/import controls to players or users without layer create/delete permissions. | Gate clear/import/save controls by role and permissions. Hide or disable with clear text. | Medium |
| Room identity | `OBR.room.id`, `OBR.room.getMetadata`, `setMetadata` | Placement sync currently has no Owlbear room scope. | Include `roomId` in placement payloads and optionally store current AMBA module in room metadata. | Medium |
| Automatic placement capture | `OBR.scene.items.onChange` | We implemented manual save, but the docs support watching item changes. | Add optional debounced auto-save for AMBA-owned monster token movement. Keep manual save as v0 default. | Medium |
| Scene grid setup | `OBR.scene.grid.setScale`, `setType`, `setMeasurement`, `setColor`, `setOpacity` | We map image DPI but do not set the scene grid scale/type. | On encounter import, set scene grid to square/5ft when AMBA map metadata says 1 square = 5 ft. Make it configurable. | Medium |
| Grid snapping | `OBR.scene.grid.snapPosition` | Token dump placement can be grid-aligned by Owlbear itself. | Snap staged map/token/card origins to the current grid. | Easy |
| Viewport focus | `OBR.viewport.animateToBounds`, `reset` | After import, the GM may not see the staged output. | Animate viewport to imported map/token bounds after import. | Easy |
| Contextual controls | `OBR.contextMenu.create` | We only use the action popover. Owlbear can add context menu buttons to selected scene items. | Add context actions for AMBA-created items: save placement, open AMBA source, remove AMBA encounter items, reimport selected encounter. | Medium |
| Large UI | `OBR.modal.open` | We are squeezing admin/debug content into the action popover. | Use modal for logs, detailed diagnostics, mapping options, and danger confirmations. | Easy |
| Multi-window coordination | `OBR.broadcast.sendMessage`, `onMessage` | Multiple GMs/windows could import the same queue or stale config. | Broadcast queue refresh/import-start/import-complete events to other extension instances in the room. | Medium |
| Local previews | `OBR.scene.local` | We are not using temporary local-only items. | Use local items for hover previews, placement ghosts, or staging outlines before committing items to the shared scene. | Medium |
| Asset reuse | `OBR.assets.downloadImages`, `downloadScenes` | We noted upload picker flows, but not download/pick flows. | Let the GM select existing Owlbear assets/scenes and bind them to AMBA maps/PCs where reuse matters. | Medium |
| Attachments | item `attachedTo` and attachment behaviors | Stat-card background and text are separate items; they can drift apart. | Attach stat text to card shape, and maybe attach labels/auras to tokens. | Medium |
| Ownership/players | `OBR.party.getPlayers`, `OBR.player.id`, `getConnectionId` | We documented player testing, but not a concrete assignment UI. | Use party/player APIs to display present players and store AMBA/Owlbear player mapping. Confirm whether item owner assignment is available; docs reviewed do not expose direct owner mutation. | Medium |

## Notable Confirmations

### Current Scene Mutations Are Supported

The scene items API supports reading, updating, adding, deleting, attachment lookup, bounds lookup, and change subscription. This confirms our current item-based import and upsert approach is valid.

Useful methods:

```text
OBR.scene.items.getItems(filter)
OBR.scene.items.updateItems(filterOrItems, update)
OBR.scene.items.addItems(items)
OBR.scene.items.deleteItems(ids)
OBR.scene.items.getItemAttachments(ids)
OBR.scene.items.getItemBounds(ids)
OBR.scene.items.onChange(callback)
```

Current gap: our upsert currently skips existing items but does not update existing map/stat-card content. `updateItems` gives us the API to do that later without deleting and re-adding.

### Metadata Pattern Is Correct

Owlbear recommends custom metadata keys use a reverse-domain namespace to avoid collisions. Our namespace:

```text
com.adventuremakerbyact.owlbear
```

is aligned with that guidance.

Recommended refinement: use fewer top-level keys when storing larger structured objects. For example:

```json
{
  "com.adventuremakerbyact.owlbear/item": {
    "moduleId": "...",
    "encounterId": "...",
    "kind": "monster-token",
    "sourceId": "...",
    "tokenInstanceId": "..."
  }
}
```

Our current separate namespaced keys are valid, but a single object key is easier to version.

### Room Metadata Is Small But Useful

Room metadata is explicitly intended for small extension data and has a documented 16KB total limit. That is too small for encounter state, monster blocks, or placement tables, but useful for:

- current AMBA module id
- current AMBA campaign/session id
- last loaded encounter id
- AMBA API environment hint
- extension install/config marker

Do not store token placement history in room metadata.

### Asset APIs Are Picker-Based

The asset API confirms our earlier concern: `uploadImages` and `uploadScenes` open picker flows. They are appropriate for "save this to Owlbear's asset library" workflows, but not for silent one-click encounter dumping.

Additional missed angle: `downloadImages` and `downloadScenes` let the user pick existing Owlbear assets/scenes and share them with the extension. That could support a future "bind this Owlbear map asset to this AMBA encounter" flow.

### Image URLs Need CORS

The Image item reference explicitly requires image URLs to have CORS enabled. This should be part of AMBA production hosting acceptance criteria:

```text
Access-Control-Allow-Origin: https://www.owlbear.rodeo
```

or the specific current Owlbear origin policy we choose.

### Grid DPI And Scale Are Separate

The image grid DPI controls image-to-grid alignment for an image item. The scene grid API separately exposes scene-level DPI, scale, type, measurement, color, opacity, and line style.

We currently pass AMBA map `grid.cellSize` as image DPI, which is correct for map image alignment. We should also set or validate:

```text
OBR.scene.grid.setType("SQUARE")
OBR.scene.grid.setScale("5ft")
```

for AMBA maps where 1 square = 5 ft.

### Player Permission Checks Are Available

The docs expose:

```text
OBR.player.getRole()
OBR.player.hasPermission(permission)
OBR.room.getPermissions()
```

and the permission reference includes layer-specific create/update/delete permissions plus `CHARACTER_OWNER_ONLY`.

This means the extension should not rely on "GM probably opened this." It can explicitly check:

- role is `GM` for queue import/clear/import settings
- `MAP_CREATE` for map import
- `CHARACTER_CREATE` for monster tokens
- `NOTE_CREATE` or `TEXT_CREATE` for stat cards
- delete permissions before clear scene

### Direct Owner Mutation Is Not Confirmed

The docs reviewed expose player identity, party membership, permissions, and current selection, but do not show an API for assigning scene item ownership to a player.

Practical implication:

- The player-control test still needs manual confirmation in Owlbear UI.
- AMBA can store intended player/token mapping.
- The extension can perhaps label or metadata-tag intended owners.
- Do not plan on fully automated Owlbear token ownership assignment until an API is confirmed.

## Recommended Roadmap Updates

### Add Easy Items

- Action badge for queue count.
- Toast notifications for import/save/clear results.
- Viewport focus after import.
- Grid snapping for staged token dump.
- Wider/dynamic action popover.

### Add Medium Items

- Role and permission gating.
- Room ID and room metadata in AMBA config/placement payloads.
- Scene grid setup from AMBA map metadata.
- Debounced auto-save option using `OBR.scene.items.onChange`.
- Context menu actions on AMBA-owned scene items.
- Modal diagnostics/settings panel.
- Broadcast queue refresh/import status across extension instances.
- Existing Owlbear asset binding via `downloadImages` / `downloadScenes`.
- Attach stat-card text to its backing shape.

### Keep As Deferred/Unconfirmed

- Automated Owlbear player ownership assignment.
- Silent upload to a chosen Owlbear asset folder.
- Direct modern Owlbear v2 server customization or self-hosting.
- Storing large AMBA state inside Owlbear room/scene metadata.

## Concrete Next Code Changes

1. Add `src/owlbear/playerAccess.js`.
   - Reads role and permissions.
   - Exposes `canImportEncounter`, `canClearScene`, `canSavePlacements`.

2. Add `src/owlbear/actionStatus.js`.
   - Sets queue count badge.
   - Resizes action popover for current panel state.

3. Add `src/owlbear/importFeedback.js`.
   - Shows Owlbear notifications.
   - Animates viewport to imported bounds.

4. Extend `src/owlbear/encounterImporter.js`.
   - Snap generated positions through `OBR.scene.grid.snapPosition`.
   - Set scene grid scale/type from AMBA map metadata.
   - Return combined imported bounds for viewport focus.
   - Attach stat text to stat card shapes.

5. Extend placement sync.
   - Include `OBR.room.id`.
   - Include current `OBR.player.id` and `connectionId`.
   - Optional: watch `OBR.scene.items.onChange` and debounce placement saves behind a setting.

6. Extend AMBA settings docs/API.
   - Add room scope.
   - Add permission/role checks to acceptance criteria.
   - Add CORS image-hosting requirement.
   - Add queue badge and notification behavior.

## Bottom Line

We did not miss a hidden "create scene directly and switch to it silently" API in the docs reviewed. The practical choices remain:

1. Mutate the current scene directly.
2. Upload scenes/assets through Owlbear picker-mediated asset APIs.
3. Let the GM save/manage scenes in Owlbear after AMBA stages the encounter.

The best short-term improvements are not architectural rewrites. They are Owlbear-native polish: permission checks, badges, notifications, viewport focus, grid setup, room scoping, and better metadata/versioning.

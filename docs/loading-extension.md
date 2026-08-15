# Loading The AMBA Extension In Owlbear Rodeo

This guide covers the local development path for loading the AMBA Owlbear extension into Owlbear Rodeo.

For the always-on Linux production hosting plan, see [linux-production-hosting.md](./linux-production-hosting.md).

## Prerequisites

- AMBA is running locally at `http://localhost:5190`.
- Node dependencies are installed with `npm install`.
- You can open an Owlbear Rodeo room where you can manage extensions.

## Start The Extension

From the repository root:

```bash
npm.cmd run dev
```

Vite normally starts on:

```text
http://localhost:5173/
```

The Owlbear extension manifest will be available at:

```text
http://localhost:5173/manifest.json
```

If Vite picks a different port, use that port in the manifest URL.

If Owlbear needs to reach the extension from another device or network context, start Vite with an explicit host:

```bash
npm.cmd run dev -- --host 0.0.0.0
```

Then use the machine's LAN URL, for example:

```text
http://192.168.1.25:5173/manifest.json
```

## Add The Extension In Owlbear

1. Open Owlbear Rodeo.
2. Open the user/profile extension management UI.
3. Choose the option to add a custom extension.
4. Paste the manifest URL:

   ```text
   http://localhost:5173/manifest.json
   ```

5. Add/install the extension.
6. Enable the extension for the room/world you are using.
7. Open an Owlbear room.
8. Click the AMBA extension action.

The extension popover should show:

```text
AMBA Owlbear
Connected to Owlbear!
```

## Smoke Test

1. Open or create a scene in the Owlbear room.
2. Click `Test Room Access`.
3. Confirm Owlbear shows:

   ```text
   AMBA can access this scene.
   ```

If no scene is open, the extension should report:

```text
No active scene.
```

For a two-browser GM/player test plan, see [player-join-token-control-test.md](./player-join-token-control-test.md).

## AMBA Export Queue Flow

The intended AMBA-driven flow is:

1. In AMBA, right-click an encounter.
2. Choose `Export to Owlbear`.
3. AMBA pushes the encounter into the Owlbear export queue.
4. In Owlbear, open the AMBA extension.
5. Click `Import queued exports`.
6. The extension pulls queued encounter IDs from AMBA and imports maps and monster-block tokens into the current Owlbear scene.

The extension currently expects these AMBA queue endpoints:

```text
GET  /api/owlbear/export-queue
POST /api/owlbear/export-queue/:queueItemId/complete
POST /api/owlbear/export-queue/:queueItemId/fail
```

## Manual Encounter Import

The extension also supports a manual picker:

1. Select a test-user module.
2. Select an encounter.
3. Click `Import encounter`.

This is useful during development even after the AMBA right-click queue flow is available.

## PC Import

Existing PC controls remain available:

- `Load all PCs`
  - Adds PC tokens and placeholder notes to the current scene.

- `Import character sheet images`
  - Adds rendered character sheet images to the current scene, docked away from map-layer bounds.

## Troubleshooting

### Owlbear cannot load the manifest

Check:

- Vite is running.
- The manifest URL opens in your browser.
- The URL uses the correct Vite port.
- If not using the same machine/browser context, use `--host 0.0.0.0` and the LAN IP.

### The extension loads but AMBA data does not

Check:

- AMBA is running at `http://localhost:5190`.
- The AMBA endpoints are reachable from the browser.
- Browser console does not show CORS or network errors.

### Imports fail with "No Owlbear scene is currently open"

Open or create a scene in the Owlbear room, then retry.

### Queued exports do not appear

Check:

- AMBA right-click export is writing queue items.
- `GET http://localhost:5190/api/owlbear/export-queue` returns queue data.
- Queue items include `moduleId` and `encounterId`, or embed an `encounter` payload.

## Production Hosting Note

For real use outside local development, the extension files need to be hosted at a stable HTTPS URL and the Owlbear custom extension should use that hosted `manifest.json`.

The AMBA API URLs also need to be reachable from the browser context running the Owlbear extension. The current code is development-oriented and points at:

```text
http://localhost:5190
```

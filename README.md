# AMBA Owlbear Extension

AMBA Owlbear Extension connects Adventure Maker by ACT (AMBA) encounter content to Owlbear Rodeo. It is a hosted Owlbear Rodeo extension that can load AMBA modules, inspect encounters, and push maps, monster tokens, stat cards, and optional PC tokens into the current Owlbear scene.

The project is currently focused on the modern Owlbear Rodeo extension model. Owlbear Rodeo v1 was open source and could be self-hosted, but the current Owlbear Rodeo platform is integrated through extensions rather than by modifying or self-hosting the Owlbear app itself.

## Current Capabilities

- Loads as an Owlbear Rodeo action popover.
- Connects to a local AMBA API during development.
- Lists modules for the authenticated AMBA user.
- Loads AMBA encounters from real endpoints when available, with a smoke-fixture fallback for local testing.
- Analyzes the selected encounter before export:
  - map present or missing
  - map image dimensions and MIME type
  - grid metadata such as pixels per square and `1 square = 5 ft`
  - monster block count
  - planned monster token count
- Imports encounter maps into the current Owlbear scene.
- Generates numbered monster tokens such as `Gb1`, `Gb2`, `Gi1`.
- Rasterizes SVG token art before scene placement.
- Exports monster stat blocks as Owlbear note/card items.
- Preserves existing AMBA-created token positions on re-import through metadata-based upsert behavior.
- Can clear the current scene and rebuild from the selected or queued encounter.
- Can optionally push PC tokens.
- Includes a placement-save client path for future AMBA persistence.

## What This Is Not

This repository is not a fork of Owlbear Rodeo and does not replace Owlbear's server or scene storage. It cannot silently write to arbitrary Owlbear asset folders unless the Owlbear SDK exposes that workflow. Asset and scene library uploads generally use Owlbear's picker-mediated APIs.

For modern Owlbear Rodeo, the practical integration path is:

1. Host this extension.
2. Add its `manifest.json` to Owlbear Rodeo.
3. Let the extension use the Owlbear SDK to mutate the current scene or invoke Owlbear asset flows.
4. Let AMBA own durable campaign/module/queue/placement data.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Owlbear extension dev server:

```bash
npm run dev:owlbear
```

The local extension runs on:

```text
http://localhost:5196
```

The manifest URL for Owlbear Rodeo is:

```text
http://localhost:5196/manifest.json
```

The Vite dev server proxies AMBA API and upload requests to:

```text
http://localhost:5190
```

AMBA must be running separately for real module/encounter data. Log in to AMBA in the same browser profile before opening the Owlbear extension so authenticated API requests can use the AMBA session. The extension includes a local smoke fallback for the `Owlbear Smoke Mini Spine` fixture so the encounter UI can still be exercised when authenticated AMBA encounter endpoints are unavailable.

## Loading In Owlbear Rodeo

1. Start the extension dev server with `npm run dev:owlbear`.
2. Open Owlbear Rodeo.
3. Add a custom extension using `http://localhost:5196/manifest.json`.
4. Open a room and scene.
5. Click the AMBA action icon.
6. Select a module and encounter.
7. Review the encounter export analysis.
8. Choose export options and import.

See [docs/loading-extension.md](docs/loading-extension.md) for the detailed loading guide.

## Export Options

The extension currently exposes these import controls:

- Push map
- Push monster tokens
- Push monster stat cards
- Push PC tokens

AMBA queue items can also carry `exportOptions`, allowing the future AMBA-side Owlbear page to decide what the extension should push when a GM adds an encounter to the Owlbear queue.

## Production Hosting

For production, this extension should be built and hosted as static files at a stable HTTPS URL. Owlbear Rodeo must be able to fetch the hosted `manifest.json`, app entrypoint, and image assets. AMBA image URLs need CORS configured so Owlbear's browser context can load maps and tokens.

Build:

```bash
npm run build
```

See [docs/linux-production-hosting.md](docs/linux-production-hosting.md) for the planned Linux deployment approach.

## Repository Structure

```text
public/
  manifest.json             Owlbear extension manifest

src/
  app/                      App bootstrap
  amba/                     AMBA API client, encounter controls, queue controls
  owlbear/                  Owlbear SDK item builders and import logic
  ui/                       Small DOM shell

docs/
  architecture.md           Full technical architecture
  loading-extension.md      Local Owlbear loading instructions
  linux-production-hosting.md
  amba-owlbear-settings-page.md
  placement-sync-upsert-guide.md
  owlbear-api-docs-review.md
```

## Key Design Docs

- [Architecture](docs/architecture.md)
- [AMBA Owlbear settings page](docs/amba-owlbear-settings-page.md)
- [Owlbear API docs review](docs/owlbear-api-docs-review.md)
- [Placement sync and upsert guide](docs/placement-sync-upsert-guide.md)
- [Player join/token control test](docs/player-join-token-control-test.md)

## Roadmap

Near-term work:

- Add real AMBA Owlbear export queue endpoints.
- Add AMBA-side Owlbear settings/configuration page.
- Persist Owlbear token placements back into AMBA.
- Apply saved placements during future encounter imports.
- Add role/permission checks through Owlbear player and room APIs.
- Add Owlbear notifications, queue badge count, and viewport focus after import.
- Harden map/grid validation and production CORS checks.

See [docs/medium-roadmap-todo.md](docs/medium-roadmap-todo.md) for the current medium-difficulty TODO list.

## Status

This is active integration/prototype work. The code is intentionally modular so the extension can grow without turning the main AMBA/Owlbear modules into one large file.

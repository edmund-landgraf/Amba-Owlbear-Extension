# AMBA to Owlbear Medium Roadmap TODO

These are the medium-difficulty AMBA -> Owlbear work items. They are feasible with the extension model, but each needs AMBA API support, schema decisions, or careful UI/state handling before it should be treated as production-ready.

## TODO

- [ ] Add AMBA Owlbear export queue endpoint.
  - Add `GET /api/owlbear/export-queue`.
  - Add completion and failure endpoints for consumed queue items.
  - Queue item minimum shape: `id`, `moduleId`, `encounterId`, `createdAt`, `requestedByUserId`.
  - Current extension state: dev fallback remains active and imports the selected module/encounter when the queue endpoint is missing.

- [x] Implement encounter upsert import.
  - Use O.R. item metadata to find existing AMBA-created maps, tokens, and notes.
  - Add missing items without duplicating existing ones.
  - Current extension state: maps, monster tokens, and monster stat cards use stable metadata keys and are skipped on re-import when already present.
  - Remaining production hardening: update existing map/stat-card data when AMBA source content changes.
  - Avoid moving user-placed tokens unless AMBA has a saved placement for that token instance.

- [ ] Save token positions back to AMBA.
  - Extension side is implemented with an explicit "Save token placements to AMBA" action.
  - Store `moduleId`, `encounterId`, `monsterBlockId`, `tokenInstanceId`, `x`, `y`, `sceneId`, and timestamp.
  - Treat placement save as an upsert keyed by stable AMBA token instance id.
  - Remaining AMBA work: implement `POST /api/modules/:moduleId/owlbear/encounters/:encounterId/placements`.

- [x] Normalize uploaded AMBA map assets for O.R.
  - Ensure AMBA map artifacts expose `url`, `width`, `height`, and grid metadata.
  - Use `grid.cellSize` or equivalent to align 1 square = 5 ft maps.
  - Current extension state: map artifacts are discovered from encounter containers and `grid.cellSize` is passed to Owlbear image/grid creation as DPI.
  - Remaining production hardening: validate dimensions and grid metadata before import.

- [x] Replace local fallback tokens with AMBA token payloads where available.
  - Expose a stable AMBA monster token SVG/PNG endpoint or explicit token URL per monster block.
  - Keep local SVG generation as fallback for missing token art.
  - Include label, color, size, and ruleset hints in the token payload.
  - Current extension state: explicit monster token URLs are honored; AMBA token endpoint support is opt-in per block; local SVG generation remains the default fallback.

- [x] Export monster stat block cards.
  - Convert AMBA `monster_block` artifacts into O.R. notes/cards.
  - Place cards in a staging zone away from the map and tokens.
  - Include creature name, level, quantity, source, and compact stat text.

- [x] Define O.R. scene metadata schema.
  - Store AMBA module id, encounter id, source version, import timestamp, and importer version.
  - Use a namespaced key under `com.adventuremakerbyact.owlbear`.
  - Use scene metadata to detect whether the current scene already represents the selected AMBA encounter.
  - Current extension state: scene and item metadata store module id, encounter id, kind, source id, monster id, and token instance id.

- [ ] Add player handout export.
  - Map AMBA handouts, portraits, clue cards, and treasure artifacts to O.R. note/image items.
  - Support GM-only versus player-visible placement.
  - Place handouts in a predictable non-overlapping staging area.

- [x] Build encounter import status panel.
  - Show selected module, selected encounter, queue count, last import result, and last error.
  - Distinguish dev fallback mode from real AMBA queue mode.
  - Add small diagnostics for missing map, missing monster blocks, missing token URLs, and auth failures.
  - Current extension state: import results and metadata/upsert diagnostics are shown in the encounter panel.
  - Remaining polish: add queue count and richer missing-data diagnostics once the real AMBA queue endpoint exists.

## Suggested Order

1. Queue endpoint.
2. Scene metadata schema.
3. Upsert import.
4. Placement save.
5. Map payload normalization.
6. AMBA token payloads.
7. Monster stat block cards.
8. Player handouts.
9. Import status panel polish.

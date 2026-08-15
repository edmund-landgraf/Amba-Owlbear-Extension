# AMBA to Owlbear Medium Roadmap TODO

These are the medium-difficulty AMBA -> Owlbear work items. They are feasible with the extension model, but each needs AMBA API support, schema decisions, or careful UI/state handling before it should be treated as production-ready.

## TODO

- [ ] Add AMBA Owlbear export queue endpoint.
  - Add `GET /api/owlbear/export-queue`.
  - Add completion and failure endpoints for consumed queue items.
  - Queue item minimum shape: `id`, `moduleId`, `encounterId`, `createdAt`, `requestedByUserId`.
  - Keep the current extension dev fallback until the real queue is stable.

- [ ] Implement encounter upsert import.
  - Use O.R. item metadata to find existing AMBA-created maps, tokens, and notes.
  - Add missing items without duplicating existing ones.
  - Update map/token metadata when AMBA source data changes.
  - Avoid moving user-placed tokens unless AMBA has a saved placement for that token instance.

- [ ] Save token positions back to AMBA.
  - Listen for O.R. item movement or add an explicit "Save placements to AMBA" action.
  - Store `moduleId`, `encounterId`, `monsterBlockId`, `tokenInstanceId`, `x`, `y`, `sceneId`, and timestamp.
  - Treat placement save as an upsert keyed by stable AMBA token instance id.

- [ ] Normalize uploaded AMBA map assets for O.R.
  - Ensure AMBA map artifacts expose `url`, `width`, `height`, and grid metadata.
  - Use `grid.cellSize` or equivalent to align 1 square = 5 ft maps.
  - Add map validation in the extension before import.

- [ ] Replace local fallback tokens with AMBA token payloads where available.
  - Expose a stable AMBA monster token SVG/PNG endpoint or explicit token URL per monster block.
  - Keep local SVG generation as fallback for missing token art.
  - Include label, color, size, and ruleset hints in the token payload.

- [ ] Export monster stat block cards.
  - Convert AMBA `monster_block` artifacts into O.R. notes/cards.
  - Place cards in a staging zone away from the map and tokens.
  - Include creature name, level, quantity, source, and compact stat text.

- [ ] Define O.R. scene metadata schema.
  - Store AMBA module id, encounter id, source version, import timestamp, and importer version.
  - Use a namespaced key under `com.adventuremakerbyact.owlbear`.
  - Use scene metadata to detect whether the current scene already represents the selected AMBA encounter.

- [ ] Add player handout export.
  - Map AMBA handouts, portraits, clue cards, and treasure artifacts to O.R. note/image items.
  - Support GM-only versus player-visible placement.
  - Place handouts in a predictable non-overlapping staging area.

- [ ] Build encounter import status panel.
  - Show selected module, selected encounter, queue count, last import result, and last error.
  - Distinguish dev fallback mode from real AMBA queue mode.
  - Add small diagnostics for missing map, missing monster blocks, missing token URLs, and auth failures.

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

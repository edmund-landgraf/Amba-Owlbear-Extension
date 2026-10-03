# Color palette storage

The shared eight-color token palette is defined in source, not in Owlbear scene metadata.

```js
["#7c3aed", "#45c7d8", "#78f05b", "#ffd23c", "#d46bef", "#ff4e4e", "#ff7a2f", "#2d6aef"]
```

## Palette definitions

| Array | File | Used for |
| --- | --- | --- |
| `TOKEN_COLORS` | `src/owlbear/encounterData.js` | Encounter monster label-token fills |
| `NOTE_COLORS` | `src/owlbear/pcAssets.js` | PC roster tokens (same eight hex values) |
| `TOKEN_COLOR` | `src/owlbear/pcAssets.js` | Default PC token color (`#7c3aed`, first palette entry) |

`src/owlbear/tokenColors.js` does not own the palette. It imports `TOKEN_COLORS` and:

- cycles or shuffles those fills in `buildTokenFills()`
- invents extra HSL fills only when randomized import needs more colors than the eight-entry list
- picks glyph fill/stroke in `contrastingGlyphColors()` (`#1f160f` / `#ffffff` / `#f7efe2`)

## Where a chosen color is stored on items

Owlbear item metadata namespace: `com.adventuremakerbyact.owlbear` (`NS` in `src/owlbear/layout.js`).

### Monster label tokens

Written in `src/owlbear/encounterImporter.js` when the token is **not** art-based (letter/label token). Keys are `META.*` in `src/owlbear/encounterMetadata.js`:

| Key | Meaning |
| --- | --- |
| `com.adventuremakerbyact.owlbear/color` | Circle fill from `TOKEN_COLORS` (or a randomized extra fill) |
| `com.adventuremakerbyact.owlbear/glyphFill` | Letter fill, only when “Randomize token art colors” is on |
| `com.adventuremakerbyact.owlbear/glyphStroke` | Letter stroke, only when randomization is on |

Art tokens do not get these three keys. The palette is not copied onto scene-level metadata (`META.scene`).

### PC tokens

Written in `src/owlbear/pcImporter.js` as `com.adventuremakerbyact.owlbear/color` (literal key, not the encounter `META` helper). Value is `NOTE_COLORS[index % 8]`. Later sheet/snapshot code reads that key, then falls back to the same roster index.

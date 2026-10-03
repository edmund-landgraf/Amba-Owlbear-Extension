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

For scene PC tokens, `buildPcTokenAndNoteItems()` writes Owlbear accessibility fields separately from the palette color:

| Owlbear field | Value |
| --- | --- |
| `name` | PC name |
| `plainText` | PC name |
| `description` | `AMBA generated token for ${pc.name}` |

The palette color is not stored in those visible/accessibility fields. It is on the same scene image item under metadata key `com.adventuremakerbyact.owlbear/color`, using the `NS` namespace from `src/owlbear/layout.js`. The same metadata object also includes `com.adventuremakerbyact.owlbear/moduleId`, `com.adventuremakerbyact.owlbear/pcId`, and `com.adventuremakerbyact.owlbear/kind: "pc-token"`.

`buildPcTokenAndNoteItems()` passes the roster color into `tokenInfo()`. Generated first-letter PC tokens use that color in the token art; portrait-backed tokens can use portrait art instead, but the metadata color is still written so later sheet/snapshot placement can keep the roster color.

### Characters-library generated PC token uploads

`generatedTokenUpload()` in `src/owlbear/pcAssets.js` creates an Owlbear Characters-library upload with the same `name` and `plainText` values as the scene token, and with a longer description: `AMBA generated token for ${pc.name} from ${moduleTitle}`.

That upload does not set the metadata color key. It stores the chosen color only as hidden text styling with `textFillColor(color)` and `textFillOpacity(0)`, so later code cannot read the color from AMBA metadata. A later reader would need to recover it from the uploaded image/SVG/PNG content or from the hidden text styling if Owlbear exposes it.

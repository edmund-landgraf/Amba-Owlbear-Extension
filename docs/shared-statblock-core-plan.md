# Shared Statblock Core Plan

## Goal

Create one shared PF2e statblock rendering core used by both `amba-owlbear` and `statblock-owlbear`, so fixes like spell-line formatting, action icons, trait parsing, and SVG layout land once and ship everywhere.

## Why

The two extensions currently solve the same statblock problem in separate code paths. That makes small fixes easy to lose: one repo can render `Divine Innate Spells` correctly while the other still breaks around spell ranks, commas, or action glyphs.

The shared core should own the pure statblock work. Each Owlbear extension should keep only its app-specific integration code.

## Extraction Scope

Move the reusable statblock logic into a shared package or repo:

- `statCardModel` style parsing from raw markdown, structured PF2e data, or API rows.
- `statCardRows` style row normalization and PF2e field grouping.
- `statCardImage` style SVG rendering, minus Owlbear-specific file publishing.
- `pf2eActionIcons` style action token parsing and glyph rendering.
- Shared fixtures and golden tests for known difficult monsters.

The current AMBA implementation has the latest fixes and should be treated as the starting point. Keep a comment in the local adapter noting that the duplicated code should be unified into this shared package.

## Keep Out Of Core

Do not move extension-specific behavior into the shared package:

- Owlbear SDK calls.
- Scene item creation.
- Token placement.
- AMBA API/auth configuration.
- Image fetching that depends on app credentials or local service URLs.
- Encounter importing.
- Extension UI state.
- Browser storage and settings.

The shared core should be browser-compatible ESM with no direct `@owlbear-rodeo/sdk` dependency and no network dependency.

## Proposed Package Shape

Recommended package name:

```text
@edmund-landgraf/pf2-statblock-core
```

Recommended source layout:

```text
src/
  index.js
  model.js
  rows.js
  renderSvg.js
  actionIcons.js
  text.js
test/
  fixtures/
  model.test.js
  rows.test.js
  renderSvg.test.js
```

The package can live in its own repository, for example `pf2-statblock-core`, or as a workspace package if the Owlbear repos are ever brought into a monorepo.

## Public API

Start with a small API that matches the current app needs:

```js
rawMdStatCardModel(rawMd, fallbackName)
structuredStatCardModel(row)
apiStatCardModel(row)
statCardRowsFromModel(model)
pf2eStatRows(text, name)
renderStatCardSvg(options)
normalizePf2eActionTokens(text)
splitActionBlocks(text)
tokenizeStatValue(text)
actionIconGroup(actions)
```

`renderStatCardSvg(options)` should return a pure result:

```js
{
  svg,
  width,
  height
}
```

The Owlbear extensions can wrap that result into a `File`, Blob URL, or SDK asset as needed.

## Adapter Boundary

Each extension should keep a thin adapter:

```js
import { renderStatCardSvg } from "@edmund-landgraf/pf2-statblock-core";

export function renderOwlbearStatCardFile(options) {
  const { svg } = renderStatCardSvg(options);
  return new File([svg], options.fileName, { type: "image/svg+xml" });
}
```

This keeps browser and Owlbear-specific APIs outside the shared core while preserving the existing extension behavior.

## Migration Plan

1. Freeze current behavior in both repos with tests and fixtures.
2. Create `pf2-statblock-core` as a pure ESM package.
3. Copy the AMBA statblock modules into the package as the first shared implementation.
4. Move shared tests and fixtures into the package.
5. Add coverage for the Arbiter `Divine Innate Spells` case so comma-split spell ranks stay fixed.
6. Add package dependency to `amba-owlbear`.
7. Replace local AMBA statblock modules with imports plus a thin Owlbear adapter.
8. Add package dependency to `statblock-owlbear`.
9. Replace duplicated statblock code there with the same shared imports.
10. Run both repos' unit tests and builds.
11. Remove duplicated core tests from each app, leaving only integration smoke tests.

## Versioning Options

Recommended path:

- Separate repo.
- Versioned package.
- Consume by semver tag from both Owlbear repos.

Fast path:

- Separate repo.
- Git dependency pinned to a commit or tag.
- Promote to a versioned package after the API settles.

Long-term path:

- Monorepo workspace if both extensions are managed together.
- Shared package consumed through workspace imports.

## Test Gate

The shared core should include golden tests for:

- Arbiter, especially `Divine Innate Spells`.
- A creature with multiple melee/ranged action rows.
- A creature with reactions and triggered abilities.
- A creature with traits, source text, recall knowledge, and defensive sections.
- SVG smoke tests that verify non-empty output, expected section labels, and stable dimensions.

Each extension should keep integration tests for:

- Converting rendered SVG into the extension's expected `File` or asset type.
- Owlbear item metadata and dimensions.
- Any app-specific token/stat-card placement behavior.

## Acceptance Criteria

- Both `amba-owlbear` and `statblock-owlbear` depend on the same shared statblock package.
- Neither repo keeps a private copy of core model, row, action-icon, or SVG rendering logic.
- The Arbiter spell formatting fix is tested once in the shared package and passes in both apps.
- Both repos build successfully.
- App-specific code remains app-specific and does not leak into the core package.

## Risks

- Browser APIs like `File`, `Blob`, and `FileReader` can make core tests harder to run in Node. Keep them in adapters.
- Current SVG widths and typography may differ between repos. Make layout options configurable before replacing both renderers.
- Art and token images should enter the core as data URLs or plain strings, not as fetch requests.
- Action icon parsing needs golden tests before extraction because small text-normalization changes are easy to miss visually.

## Local TODO

AMBA can keep a short local comment near the statblock adapter:

```js
// TODO: Move the shared PF2e statblock core into @edmund-landgraf/pf2-statblock-core
// so AMBA Owlbear and Statblock Owlbear render from the same implementation.
```

Once both repos import the package, delete the old duplicated implementation files.

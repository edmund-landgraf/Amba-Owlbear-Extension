import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePf2eActionTokens, splitActionBlocks, tokenizeStatValue } from "./pf2eActionIcons.js";

test("decodes AoN HTML action glyphs into icon tokens", () => {
  const melee = tokenizeStatValue("&#9670; Spectral Grasp +11");
  assert.deepEqual(
    melee.filter((token) => token.icon || String(token.text ?? "").trim()),
    [{ icon: "one" }, { text: " Spectral Grasp +11" }]
  );

  const wail = tokenizeStatValue("&#9670;&#9670; Draining Wail");
  assert.equal(wail[0]?.icon, "two");

  const encoded = tokenizeStatValue("&amp;#9670; Spectral Grasp");
  assert.equal(encoded[0]?.icon, "one");
});

test("still recognizes named action phrases and unicode glyphs", () => {
  assert.equal(tokenizeStatValue("Single Action Spectral Grasp")[0]?.icon, "one");
  assert.equal(tokenizeStatValue("◆ Spectral Grasp")[0]?.icon, "one");
  assert.equal(normalizePf2eActionTokens("&#x25C6; Grasp").includes("◆"), true);
});

test("splitActionBlocks treats name-then-glyph abilities as a new block", () => {
  const parts = splitActionBlocks("◆ Spectral Grasp +11 Draining Wail ◆◆ (fear)");
  assert.equal(parts.some((part) => part.startsWith("Draining Wail")), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { clearCreatureLookupCache, lookupCreatureName } from "./creatureLookup.js";

test("local PF2 lookup carries the full stat card row and RawMD into encounter imports", async () => {
  clearCreatureLookupCache();
  const originalFetch = globalThis.fetch;
  const row = {
    MonsterId: 4495,
    AonId: 4495,
    Name: "Animated Statue",
    AonUrl: "https://2e.aonprd.com/Monsters.aspx?ID=4495",
    ImageUrl: "/api/monsters/4495/image",
    RawMD: "## Animated Statue Creature 4\n\n**Perception** +11\n\n**Speed** 20 feet\n\n**Melee** fist +13\n\n**Collapse** Reaction The statue collapses into rubble.",
  };

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("elasticsearch.aonprd.com")) {
      return new Response("{}", { status: 503 });
    }
    if (href.includes("/api/monsters?")) {
      return new Response(JSON.stringify({ rows: [row] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const result = await lookupCreatureName({ query: "Animated Statue" });
    assert.equal(result.name, "Animated Statue");
    assert.deepEqual(result.statCardMonster, row);
    assert.equal(result.statBlock, row.RawMD);
    assert.match(result.imageUrl, /\/api\/monsters\/4495\/image$/);
    assert.equal(result.sourceUrl, row.AonUrl);
  } finally {
    globalThis.fetch = originalFetch;
    clearCreatureLookupCache();
  }
});

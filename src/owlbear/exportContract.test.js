import assert from "node:assert/strict";
import test from "node:test";
import { createExportJobStore } from "./exportJob.js";
import { stableTokenKey, validateExportDocument } from "./exportSchema.js";

function document(overrides = {}) {
  const tokenKey = stableTokenKey({
    moduleId: "mod",
    encounterId: "enc",
    kind: "monster-token",
    sourceId: "goblin",
    copy: 1,
  });
  return {
    schemaVersion: 1,
    idempotencyKey: "mod:enc:export",
    moduleId: "mod",
    encounterId: "enc",
    scene: { encounterId: "enc", title: "Room" },
    placements: [
      {
        tokenKey,
        kind: "monster-token",
        sourceId: "goblin",
        position: { x: 1, y: 2 },
      },
    ],
    ...overrides,
  };
}

test("export schema rejects unknown fields and accepts a versioned document", () => {
  const valid = validateExportDocument(document());
  assert.equal(valid.ok, true);

  const invalid = validateExportDocument(document({ guessedField: true }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /Unknown export fields: guessedField/);
});

test("stable token keys stay identical for the same AMBA identity", () => {
  const first = stableTokenKey({ moduleId: "m", encounterId: "e", kind: "monster-token", sourceId: "rat", copy: 2 });
  const second = stableTokenKey({ moduleId: "m", encounterId: "e", kind: "monster-token", sourceId: "rat", copy: 2 });
  assert.equal(first, second);
  assert.equal(first, "amba:m:e:monster-token:rat:2");
});

test("export jobs lease, retry, and stay idempotent inside a room and user", () => {
  let clock = 1_000;
  const store = createExportJobStore({ now: () => clock, leaseMs: 100, maxAttempts: 2 });
  const first = store.enqueue({ idempotencyKey: "k", roomId: "room", userId: "gm", payload: { n: 1 } });
  const again = store.enqueue({ idempotencyKey: "k", roomId: "room", userId: "gm", payload: { n: 2 } });
  assert.equal(again.id, first.id);
  assert.equal(again.payload.n, 1);

  const otherRoom = store.lease({ roomId: "other", userId: "gm", owner: "worker" });
  assert.equal(otherRoom, null);

  const leased = store.lease({ roomId: "room", userId: "gm", owner: "worker-a" });
  store.markRunning(leased.id, "worker-a");
  store.fail(leased.id, "worker-a", new Error("network"));
  assert.equal(store.get(leased.id).state, "failed");

  clock += 200;
  const retry = store.lease({ roomId: "room", userId: "gm", owner: "worker-b" });
  store.fail(retry.id, "worker-b", new Error("still down"));
  assert.equal(store.get(retry.id).state, "dead");
});

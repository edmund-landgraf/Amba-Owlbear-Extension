# AOE integration recommendations

Last reviewed: 2026-10-18

These items are the Amba-Owlbear-Extension share of the ranked integration review. WandersGuideUI owns the auth handoff, campaign DTOs, dice concurrency, and security-test skip behavior. Shared contract tests and boundary validation are specified here for the extension side.

## 1. Versioned export schema

AMBA → Owlbear exports use schema version `1` in `src/owlbear/exportSchema.js`. A document is valid only when it has `schemaVersion`, `idempotencyKey`, `moduleId`, `encounterId`, `scene`, and `placements`. Unknown fields are rejected. Placement kinds are `encounter-map`, `monster-token`, and `monster-stat-card`. Each placement needs an `amba:` token key and a numeric position. Payloads over 512 KiB fail validation.

Guessed encounter field names in `encounterData.js` remain a read compatibility layer for current AMBA responses. New writes go through `validateExportDocument` before they are stored or sent.

## 2. Export job system

`src/owlbear/exportJob.js` is the extension-side job store:

| State | Meaning |
| --- | --- |
| `queued` | Accepted and waiting for a worker |
| `leased` | Owned by one worker until the lease expires |
| `running` | Worker started the import |
| `succeeded` | Finished |
| `failed` | Retryable; attempts remain |
| `dead` | Attempt limit reached |

Enqueue is idempotent for the same key inside one `roomId` and `userId`. A lease from another room does not see the job. Expired leases can be taken by another worker. This store is in memory today; AMBA should persist the same states, lease expiry, and idempotency key when the queue endpoints exist.

## 5. Idempotent import

`stableTokenKey` is `amba:{moduleId}:{encounterId}:{kind}:{sourceId}:{copy}`. Re-import finds an existing scene item by that key and leaves it in place, including a GM-moved position. Owlbear item ids are stored as `owlbearItemId` on the placement record and are not the match key.

Cleanup and rebuild stay explicit user actions. A normal import updates matching keys and does not delete unmatched scene items.

## 6. Contract tests in this repo

`src/owlbear/exportContract.test.js` covers schema acceptance, unknown-field rejection, stable keys, scoped leasing, retry, and idempotent enqueue. The WandersGuideUI suite should call the same document shape for export, queue, import, retry, reload, and placement sync.

## 8. Boundary validation

`validateExportDocument` checks schema version, URL protocol (`http`/`https` or a same-origin path), duplicate token keys, numeric positions, unknown fields, and payload size. Image and SVG bytes still need the existing token render path to reject non-image content before they are posted to `/amba-generated-tokens`.

## 9. Production and debug

Smoke encounter fixtures and the “owlbear smoke” module preference run only when `import.meta.env.DEV` is true. Production builds use the API response or surface the original error.

## 11. Placement ownership

The AMBA token key is authoritative. `encounterItemMetadata` writes `com.adventuremakerbyact.owlbear/tokenKey`. Placement sync sends that key plus `owlbearItemId` as a secondary reference. Saved positions are applied only when the token key matches.

## 12. Maintainability follow-up

After AMBA publishes schema version 1, remove the guessed field fallbacks in `encounterData.js` and `ambaApi.js`, and split container parsing from import orchestration. Critical AMBA modules can move to TypeScript once the schema is the only accepted input. Log export failures with job id, state, attempt, and token key rather than a single status string.

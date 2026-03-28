# Purchase backfill & recovery

Quick reference for operators when on-chain purchases look missing or stuck in
`EventLog` with `processed = false`.

## When to use this

- **Symptom:** Buyer paid on-chain (Base), but no matching row in `Purchase` (or
  seller never got a notification).
- **Stuck processing:** Rows in `EventLog` with `processed = false` (often with
  `error` set) after a listener or RPC hiccup.

Check failed rows (example with `psql` or Prisma Studio):

```sql
SELECT id, "eventType", "txHash", "blockNumber", "logIndex", processed, error
FROM "EventLog"
WHERE processed = false
ORDER BY "blockNumber" ASC;
```

## How to narrow it down

1. **If you have failed `EventLog` rows** — note `blockNumber` min/max; or use
   `--retry-failed` (see below) to derive the range automatically.
2. **If there is no row for that tx** — find the tx block in a block explorer,
   then run a **manual** `--from` / `--to` window that includes that block (and
   a small margin if you like).

## Block ranges

- **Explorer:** Open the purchase tx → block number.
- **Auto from failures:** `--retry-failed` loads all `processed = false` rows,
  takes `min(blockNumber)` → `max(blockNumber)`, and scans that range for
  `PurchaseCompleted` logs.
- **Manual:** If nothing is in `EventLog` for the gap, pick `--from` / `--to`
  yourself around the known block.

## Commands

The script is `packages/backend/scripts/backfill.ts`, usually via:

```bash
pnpm --filter @marketplace/backend backfill -- <args>
```

**Dry-run first** (no DB writes, only reads + “would create” logs):

```bash
pnpm --filter @marketplace/backend backfill -- --from 1234567 --to 1234999 --dry-run
```

**Apply a specific range:**

```bash
pnpm --filter @marketplace/backend backfill -- --from 1234567 --to 1234999
```

**Retry everything that still has `processed = false` in `EventLog`:**

```bash
pnpm --filter @marketplace/backend backfill -- --retry-failed
```

**Dry-run that retry:**

```bash
pnpm --filter @marketplace/backend backfill -- --retry-failed --dry-run
```

Flags `--retry-failed` and `--from` / `--to` are **mutually exclusive**.

Env: `DATABASE_URL`, RPC (e.g. `BASE_SEPOLIA_RPC_URL`) must match the chain you
are indexing.

## Safety

- Processing is **idempotent**: same `txHash` + `logIndex` will not create
  duplicate purchases; already-processed logs are skipped.
- Safe to re-run the same range after fixing data or RPC issues.
- On production, always **`--dry-run`** before a live run.

## What “good” looks like

- CLI ends without a fatal error; summary shows `Created/indexed` and/or
  `Skipped (dedup)` as appropriate.
- After a **live** run (not dry-run), confirm:
  - `EventLog` for that tx has `processed = true` (or the row was replaced by a
    successful path).
  - `Purchase` exists for the buyer/listing and matches the on-chain tx.

Use Prisma Studio (`pnpm --filter @marketplace/backend db:studio`) or SQL to
confirm.

# Operator Runbooks: Storacha Marketplace

This document provides step-by-step procedures for operators to handle common
incidents.

---

## RB-01: Missing Purchase Recovery

**Scenario**: A buyer has completed a transaction on-chain, but the purchase
does not appear in the marketplace UI/API.

### Detection

- Check logs for `LISTING_NOT_FOUND` or `Failed to process log`.
- Search structured logs by `txHash` to find any recorded failures in the
  `EventLog` table.

### Resolution (Manual Backfill)

1.  **Identify the Block**: Find the block number of the transaction on the
    block explorer (Base Sepolia).
2.  **Run Backfill dry-run**:
    ```bash
    pnpm --filter @marketplace/backend backfill -- --from <BLOCK_NUMBER> --to <BLOCK_NUMBER> --dry-run
    ```
3.  **Execute Backfill**:
    ```bash
    pnpm --filter @marketplace/backend backfill -- --from <BLOCK_NUMBER> --to <BLOCK_NUMBER>
    ```
4.  **Retry Failed Logs**: If the system recorded the event but failed to
    process it (e.g., due to DB transient error):
    ```bash
    pnpm --filter @marketplace/backend backfill -- --retry-failed
    ```

---

## RB-02: Listing Mismatch Audit

**Scenario**: Suspected discrepancy between on-chain listing data (price,
seller, CIDs) and the database.

### Detection

- Inconsistent data reported by users or observed in the UI.

### Resolution (Audit Script)

1.  **Run the Audit Script**:
    ```bash
    # From packages/backend
    pnpm --filter @marketplace/backend exec tsx src/scripts/audit-listings.ts
    ```
2.  **Analyze Output**: The script will mark each listing as `MATCH`, `MISMATCH`
    (with specific field), or `CHAIN_READ_FAILED`.
3.  **Manual Investigation**: For any `MISMATCH`, manually verify the on-chain
    data and update the database if necessary via Prisma Studio
    (`pnpm --filter @marketplace/backend db:studio`).

---

## RB-03: Degraded RPC Provider

**Scenario**: The `/health` endpoint reports `rpc: "degraded"` or logs show
frequent `getBlockNumber` or `getLogs` failures.

### Detection

- `/health` endpoint: `services.rpc` is `"degraded"`.
- Logs: High frequency of `[listener] getLogs(...) attempt 3/3 failed`.

### Resolution (Switch RPC)

1.  **Identify New Provider**: Obtain a new Base Sepolia RPC URL (e.g., Alchemy,
    Infura, or QuickNode).
2.  **Update Environment**: Update the `BASE_SEPOLIA_RPC_URL` variable in your
    `.env` file or deployment secret.
3.  **Restart Service**: Restart the backend service to apply the new
    configuration.
4.  **Verify**: Check `/health` again to ensure `rpc` is `"ok"`.

---

## RB-04: Indexer Stale (Polling Failure)

**Scenario**: The indexer hasn't processed a block in a long time.

### Detection

- `/health` endpoint: `services.listener.stale` is `true`.
- `lastSuccessfulPollTime` is significantly older than the current time.

### Resolution

1.  **Check Chain Connectivity**: Ensure the RPC is responsive (see RB-03).
2.  **Check Logs for Errors**: Look for unhandled exceptions or listener
    failures.
3.  **Restart Listener**: If the process is hung, restart the backend service.
4.  **Adjust Threshold**: if the threshold is too aggressive, adjust
    `INDEXER_STALE_THRESHOLD_MS` in `.env`.

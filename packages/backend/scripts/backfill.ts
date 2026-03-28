/**
 * Backfill / reindex missing PurchaseCompleted events from on-chain logs.
 *
 * Usage:
 *   pnpm --filter @marketplace/backend backfill -- --from 1000 --to 2000
 *   pnpm --filter @marketplace/backend backfill -- --from 1000 --to 2000 --dry-run
 *   pnpm --filter @marketplace/backend backfill -- --retry-failed
 *   pnpm --filter @marketplace/backend backfill -- --retry-failed --dry-run
 *
 * Prerequisites:
 *   - DATABASE_URL configured in .env
 *   - BASE_SEPOLIA_RPC_URL configured in .env (or uses default public RPC)
 *   - Prisma client generated (pnpm db:generate)
 *
 * Side effects (live mode):
 *   - Creates missing Purchase records (upsert by txHash)
 *   - Creates EventLog entries for dedup tracking
 *   - salesCount (listing._count.purchases) updates automatically
 *   - Sends seller notifications for newly created purchases
 *
 * Dry-run mode:
 *   - Reads chain logs and DB state only (no writes)
 *   - Reports what would be created vs already indexed
 */

import 'dotenv/config'

import { disconnectDatabase } from '../src/config/db.js'
import {
  backfillRange,
  parseBackfillCliArgs,
  retryFailedPurchaseBackfill,
  type BackfillResult,
} from '../src/services/backfill.js'

function printSummary(result: BackfillResult) {
  console.log('\n--- Backfill Summary ---')
  console.log(`  Mode:            ${result.dryRun ? 'DRY-RUN' : 'LIVE'}`)
  console.log(`  Block range:     ${result.fromBlock} → ${result.toBlock}`)
  console.log(`  Blocks scanned:  ${result.blocksScanned}`)
  console.log(`  Events found:    ${result.eventsFound}`)
  console.log(`  Created/indexed: ${result.eventsCreated}`)
  console.log(`  Skipped (dedup): ${result.eventsSkipped}`)
  console.log(`  Failed:          ${result.eventsFailed}`)

  if (result.eventsFailed > 0) {
    console.log('\n  Failed events:')
    for (const event of result.events) {
      if (event.status === 'error') {
        console.log(
          `    tx=${event.txHash} logIndex=${event.logIndex}: ${event.error}`
        )
      }
    }
  }

  console.log('')
}

async function main() {
  const parsed = parseBackfillCliArgs(process.argv.slice(2))

  if (parsed.kind === 'error') {
    console.error(parsed.message)
    process.exit(parsed.exitCode)
  }

  if (parsed.kind === 'retry-failed') {
    console.log(
      `\n[backfill] Starting ${parsed.dryRun ? 'DRY-RUN' : 'LIVE'} retry of failed EventLog rows\n`
    )

    const outcome = await retryFailedPurchaseBackfill(parsed.dryRun)

    if (outcome === 'empty') {
      console.log(
        '[backfill] No EventLog rows with processed=false. Nothing to retry.'
      )
      return
    }

    printSummary(outcome)
    return
  }

  console.log(
    `\n[backfill] Starting ${parsed.dryRun ? 'DRY-RUN' : 'LIVE'} backfill`
  )
  console.log(`[backfill] Block range: ${parsed.from} → ${parsed.to}\n`)

  const result = await backfillRange({
    fromBlock: parsed.from,
    toBlock: parsed.to,
    dryRun: parsed.dryRun,
  })

  printSummary(result)
}

main()
  .then(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('[backfill] Fatal error:', error)
    await disconnectDatabase()
    process.exit(1)
  })

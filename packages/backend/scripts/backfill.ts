/**
 * Backfill / reindex missing PurchaseCompleted events from on-chain logs.
 *
 * Usage:
 *   pnpm --filter @marketplace/backend backfill -- --from 1000 --to 2000
 *   pnpm --filter @marketplace/backend backfill -- --from 1000 --to 2000 --dry-run
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
import { backfillRange } from '../src/services/backfill.js'

function parseArgs(argv: string[]): {
  from: bigint
  to: bigint
  dryRun: boolean
} {
  let from: bigint | null = null
  let to: bigint | null = null
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--from' && argv[i + 1]) {
      from = BigInt(argv[i + 1]!)
      i++
    } else if (arg === '--to' && argv[i + 1]) {
      to = BigInt(argv[i + 1]!)
      i++
    } else if (arg === '--dry-run') {
      dryRun = true
    }
  }

  if (from === null || to === null) {
    console.error(
      'Usage: tsx scripts/backfill.ts --from <block> --to <block> [--dry-run]'
    )
    process.exit(1)
  }

  return { from, to, dryRun }
}

async function main() {
  const { from, to, dryRun } = parseArgs(process.argv.slice(2))

  console.log(`\n[backfill] Starting ${dryRun ? 'DRY-RUN' : 'LIVE'} backfill`)
  console.log(`[backfill] Block range: ${from} → ${to}\n`)

  const result = await backfillRange({
    fromBlock: from,
    toBlock: to,
    dryRun,
  })

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

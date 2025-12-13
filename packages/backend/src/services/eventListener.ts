import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'
import prisma from '../config/db.js'
import { notifySeller } from './notification.js'
import { decodeEventLog, type Log } from 'viem'

export async function startPurchaseListener() {
  const lastEvent = await prisma.eventLog.findFirst({
    orderBy: { blockNumber: 'desc' },
  })

  const fromBlock = lastEvent
    ? BigInt(lastEvent.blockNumber)
    : await publicClient.getBlockNumber()

  console.log(
    `[listener] PurchaseCompleted listener starting from block ${fromBlock}`
  )

  publicClient.watchContractEvent({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    eventName: 'PurchaseCompleted',
    fromBlock,
    onLogs: async (logs: Log[]) => {
      const latestBlock = await publicClient.getBlockNumber()
      const confirmedBlock = latestBlock - BigInt(CONFIRMATIONS_REQUIRED)

      for (const log of logs) {
        // ---- HARD GUARDS (required for TS + correctness)
        if (
          log.blockNumber === null ||
          log.transactionHash === null ||
          log.logIndex === null
        ) {
          continue
        }

        const blockNumber = Number(log.blockNumber)
        const txHash = log.transactionHash
        const logIndex = log.logIndex

        if (log.blockNumber > confirmedBlock) continue

        const alreadyProcessed = await prisma.eventLog.findUnique({
          where: {
            txHash_logIndex: {
              txHash,
              logIndex,
            },
          },
        })
        if (alreadyProcessed) continue

        let decoded
        try {
          decoded = decodeEventLog({
            abi: MARKETPLACE_ABI,
            data: log.data,
            topics: log.topics,
          })
        } catch {
          continue
        }

        if (decoded.eventName !== 'PurchaseCompleted' || !decoded.args) continue

        // ✅ IMPORTANT: double cast via unknown
        const {
          listingId,
          buyer,
          seller,
          amountUsdc,
        } = decoded.args as unknown as {
          listingId: bigint
          buyer: `0x${string}`
          seller: `0x${string}`
          amountUsdc: bigint
        }

        try {
          await prisma.$transaction(async (tx) => {
            const listing = await tx.listing.findUnique({
              where: { onchainId: Number(listingId) },
            })
            if (!listing) {
              throw new Error('LISTING_NOT_FOUND')
            }

            const purchase = await tx.purchase.upsert({
              where: { txHash },
              update: {},
              create: {
                listingId: listing.id,
                buyerAddress: buyer,
                txHash,
                amountUsdc: amountUsdc.toString(),
                txVerified: true,
                blockNumber,
              },
            })

            await tx.eventLog.create({
              data: {
                eventType: 'PurchaseCompleted',
                txHash,
                logIndex,
                blockNumber,
                processed: true,
              },
            })

            await notifySeller({
              seller,
              purchaseId: purchase.id,
            })
          })
        } catch (err) {
          await prisma.eventLog.create({
            data: {
              eventType: 'PurchaseCompleted',
              txHash,
              logIndex,
              blockNumber,
              processed: false,
              error: String(err),
            },
          })
        }
      }
    },
  })
}

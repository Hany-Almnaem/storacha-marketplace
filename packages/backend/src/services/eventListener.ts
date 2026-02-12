/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'

import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'
import prismaDB from '../config/db.js'

import { notifySeller } from './notification.js'

let pollingInterval: NodeJS.Timeout | null = null

export async function startPurchaseListener() {
  console.log('🔄 Starting PurchaseCompleted polling listener')

  pollingInterval = setInterval(async () => {
    try {
      const latestBlock = await publicClient.getBlockNumber()
      const confirmedBlock = latestBlock - BigInt(CONFIRMATIONS_REQUIRED)

      const lastEvent = await prismaDB.eventLog.findFirst({
        orderBy: { blockNumber: 'desc' },
      })

      const fromBlock = lastEvent
        ? BigInt(lastEvent.blockNumber) + 1n
        : confirmedBlock - 5n // small safe window

      if (fromBlock > confirmedBlock) return

      console.log(`🔎 Checking blocks ${fromBlock} → ${confirmedBlock}`)

      const logs = await publicClient.getLogs({
        address: MARKETPLACE_ADDRESS,
        event: {
          type: 'event',
          name: 'PurchaseCompleted',
          inputs: [
            { indexed: true, name: 'listingId', type: 'uint256' },
            { indexed: true, name: 'buyer', type: 'address' },
            { indexed: true, name: 'seller', type: 'address' },
            { indexed: false, name: 'amountUsdc', type: 'uint256' },
          ],
        },
        fromBlock,
        toBlock: confirmedBlock,
      })

      if (!logs.length) return

      console.log(`📦 Found ${logs.length} PurchaseCompleted events`)

      for (const log of logs) {
        const decoded = decodeEventLog({
          abi: MARKETPLACE_ABI,
          data: log.data,
          topics: log.topics,
        })

        const { listingId, buyer, seller, amountUsdc } = decoded.args as any

        console.log('📦 Processing purchase for listing:', listingId.toString())

        const blockNumber = Number(log.blockNumber!)
        const txHash = log.transactionHash!
        const logIndex = log.logIndex!

        const alreadyProcessed = await prismaDB.eventLog.findUnique({
          where: {
            txHash_logIndex: { txHash, logIndex },
          },
        })

        if (alreadyProcessed) continue

        const purchase = await prismaDB.$transaction(async (tx: any) => {
          const listing = await tx.listing.findUnique({
            where: { onchainId: Number(listingId) },
          })

          if (!listing) throw new Error('LISTING_NOT_FOUND')

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

          return purchase
        })

        await notifySeller({
          seller,
          purchaseId: purchase.id,
        })
      }
    } catch (error) {
      console.error('❌ Polling error:', error)
    }
  }, 8000) // poll every 8 seconds
}

export function stopPurchaseListener() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

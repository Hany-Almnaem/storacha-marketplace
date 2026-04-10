import { publicClient, MARKETPLACE_ABI } from '@/config/chain'
import { prisma } from '@/config/db'
import { logger as baseLogger } from '@/lib/logger'

const logger = baseLogger.child({ script: 'audit-listings' })

type ChainListing = [
  `0x${string}`, // seller
  string, // dataCid
  string, // envelopeCid
  `0x${string}`, // envelopeHash
  bigint, // priceUsdc
  boolean, // active
  bigint, // salesCount
]

async function audit() {
  const listings = await prisma.listing.findMany()

  logger.info({ count: listings.length }, 'Starting audit of listings')

  for (const listing of listings) {
    try {
      const chainListing = (await publicClient.readContract({
        address: process.env['MARKETPLACE_CONTRACT_ADDRESS'] as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getListing',
        args: [BigInt(listing.onchainId)],
      })) as ChainListing

      const [seller, dataCid, envelopeCid, envelopeHash, priceUsdc] =
        chainListing

      const listingCtx = { listingId: listing.id, onchainId: listing.onchainId }

      let mismatch = false

      if (seller.toLowerCase() !== listing.sellerAddress.toLowerCase()) {
        logger.warn(
          {
            ...listingCtx,
            chainSeller: seller,
            dbSeller: listing.sellerAddress,
          },
          'SELLER_MISMATCH'
        )
        mismatch = true
      }

      if (dataCid !== listing.dataCid) {
        logger.warn(
          { ...listingCtx, chainCid: dataCid, dbCid: listing.dataCid },
          'DATA_CID_MISMATCH'
        )
        mismatch = true
      }

      if (envelopeCid !== listing.envelopeCid) {
        logger.warn(
          { ...listingCtx, chainCid: envelopeCid, dbCid: listing.envelopeCid },
          'ENVELOPE_CID_MISMATCH'
        )
        mismatch = true
      }

      if (envelopeHash !== listing.envelopeHash) {
        logger.warn(
          {
            ...listingCtx,
            chainHash: envelopeHash,
            dbHash: listing.envelopeHash,
          },
          'ENVELOPE_HASH_MISMATCH'
        )
        mismatch = true
      }

      const dbPrice = BigInt(listing.priceUsdc.toString())
      const chainPrice = BigInt(priceUsdc)

      if (dbPrice !== chainPrice) {
        logger.warn(
          {
            ...listingCtx,
            chainPrice: chainPrice.toString(),
            dbPrice: dbPrice.toString(),
          },
          'PRICE_MISMATCH'
        )
        mismatch = true
      }

      if (!mismatch) {
        logger.info(listingCtx, 'MATCH')
      }

      console.log('')
    } catch (err) {
      logger.error({ err, listingId: listing.id }, 'CHAIN_READ_FAILED')
    }
  }

  await prisma.$disconnect()
}

audit()

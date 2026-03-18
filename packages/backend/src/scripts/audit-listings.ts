import { publicClient, MARKETPLACE_ABI } from '@/config/chain'
import { prisma } from '@/config/db'

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

  console.log(`Auditing ${listings.length} listings...\n`)

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

      console.log(`Listing ${listing.id}`)

      let mismatch = false

      if (seller.toLowerCase() !== listing.sellerAddress.toLowerCase()) {
        console.log('SELLER_MISMATCH')
        mismatch = true
      }

      if (dataCid !== listing.dataCid) {
        console.log('DATA_CID_MISMATCH')
        mismatch = true
      }

      if (envelopeCid !== listing.envelopeCid) {
        console.log('ENVELOPE_CID_MISMATCH')
        mismatch = true
      }

      if (envelopeHash !== listing.envelopeHash) {
        console.log('ENVELOPE_HASH_MISMATCH')
        mismatch = true
      }

      const dbPrice = BigInt(listing.priceUsdc.toString())
      const chainPrice = BigInt(priceUsdc)

      if (dbPrice !== chainPrice) {
        console.log('PRICE_MISMATCH')
        mismatch = true
      }

      if (!mismatch) {
        console.log('MATCH')
      }

      console.log('')
    } catch {
      console.log(`Listing ${listing.id}`)
      console.log('CHAIN_READ_FAILED')
      console.log('')
    }
  }

  await prisma.$disconnect()
}

audit()

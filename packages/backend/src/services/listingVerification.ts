import { parseEventLogs, decodeEventLog } from 'viem'

import { MARKETPLACE_ABI } from '@/config/chain'

import { publicClient } from '../config/chain'
import type {
  ListingVerificationInput,
  VerifiedListingData,
} from '../types/listingVerification'
import { ListingVerificationError } from '../types/listingVerification'

export async function verifyListingCreation(
  input: ListingVerificationInput
): Promise<VerifiedListingData> {
  const { txHash, dataCid, envelopeCid, envelopeHash, priceUsdc } = input

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })

  if (!receipt) {
    throw new ListingVerificationError('TX_NOT_FOUND', 'Transaction not found')
  }

  if (receipt.status !== 'success') {
    throw new ListingVerificationError(
      'TX_FAILED',
      'Transaction execution failed'
    )
  }

  const logs = parseEventLogs({
    abi: MARKETPLACE_ABI,
    logs: receipt.logs,
    eventName: 'ListingCreated',
  })

  const log = logs[0]

  if (!log) {
    throw new ListingVerificationError(
      'EVENT_NOT_FOUND',
      'ListingCreated event not found'
    )
  }

  const decoded = decodeEventLog({
    abi: MARKETPLACE_ABI,
    data: log.data,
    topics: log.topics,
  })

  if (decoded.eventName !== 'ListingCreated') {
    throw new ListingVerificationError(
      'EVENT_NOT_FOUND',
      'ListingCreated event not found'
    )
  }

  const {
    listingId,
    seller,
    dataCid: chainDataCid,
    envelopeCid: chainEnvelopeCid,
    envelopeHash: chainEnvelopeHash,
    priceUsdc: chainPrice,
  } = decoded.args as unknown as {
    listingId: bigint
    seller: `0x${string}`
    dataCid: string
    envelopeCid: string
    envelopeHash: `0x${string}`
    priceUsdc: bigint
  }

  if (chainDataCid !== dataCid) {
    throw new ListingVerificationError(
      'DATA_CID_MISMATCH',
      'dataCid does not match blockchain'
    )
  }

  if (chainEnvelopeCid !== envelopeCid) {
    throw new ListingVerificationError(
      'ENVELOPE_CID_MISMATCH',
      'envelopeCid mismatch'
    )
  }

  if (chainEnvelopeHash.toLowerCase() !== envelopeHash.toLowerCase()) {
    throw new ListingVerificationError(
      'ENVELOPE_HASH_MISMATCH',
      'envelopeHash mismatch'
    )
  }

  if (chainPrice.toString() !== priceUsdc.toString()) {
    throw new ListingVerificationError('PRICE_MISMATCH', 'price mismatch')
  }

  return {
    onchainId: Number(listingId),
    sellerAddress: seller,
    dataCid: chainDataCid,
    envelopeCid: chainEnvelopeCid,
    envelopeHash: chainEnvelopeHash,
    priceUsdc: chainPrice.toString(),
    blockNumber: Number(receipt.blockNumber),
  }
}

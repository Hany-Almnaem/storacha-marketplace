import { parseEventLogs } from 'viem'

import {
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  publicClient,
} from '@/config/chain'

import type {
  ListingVerificationInput,
  VerifiedListingData,
} from '../types/listingVerification'
import { ListingVerificationError } from '../types/listingVerification'

const CONFIRMATIONS_REQUIRED = 2

export async function verifyListingCreation(
  input: ListingVerificationInput
): Promise<VerifiedListingData> {
  const { txHash, dataCid, envelopeCid, envelopeHash, priceUsdc } = input

  let receipt

  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    throw new ListingVerificationError(
      'TX_NOT_FOUND',
      'Transaction not found or RPC failure'
    )
  }

  if (!receipt) {
    throw new ListingVerificationError('TX_NOT_FOUND', 'Transaction not found')
  }

  if (receipt.status !== 'success') {
    throw new ListingVerificationError(
      'TX_FAILED',
      'Transaction execution failed'
    )
  }

  const confirmations = await publicClient.getTransactionConfirmations({
    hash: txHash,
  })

  if (confirmations < CONFIRMATIONS_REQUIRED) {
    throw new ListingVerificationError(
      'TX_NOT_CONFIRMED',
      `Transaction requires ${CONFIRMATIONS_REQUIRED} confirmations`
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

  if (log.address.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
    throw new ListingVerificationError(
      'INVALID_EVENT_SOURCE',
      'Event emitted from unexpected contract'
    )
  }

  const args = (log as any).args as {
    listingId: bigint
    seller: `0x${string}`
    dataCid: string
    envelopeCid: string
    envelopeHash: `0x${string}`
    priceUsdc: bigint
  }

  const {
    listingId,
    seller,
    dataCid: chainDataCid,
    envelopeCid: chainEnvelopeCid,
    envelopeHash: chainEnvelopeHash,
    priceUsdc: chainPrice,
  } = args

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

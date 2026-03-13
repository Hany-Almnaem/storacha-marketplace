export interface ListingVerificationInput {
  txHash: `0x${string}`
  dataCid: string
  envelopeCid: string
  envelopeHash: string
  priceUsdc: string
}

export interface VerifiedListingData {
  onchainId: number
  sellerAddress: string
  dataCid: string
  envelopeCid: string
  envelopeHash: string
  priceUsdc: string
  blockNumber: number
}

export class ListingVerificationError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)

    this.name = 'ListingVerificationError'
    this.code = code
    this.status = status

    Error.captureStackTrace?.(this, ListingVerificationError)
  }
}

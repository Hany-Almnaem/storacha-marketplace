import { z } from 'zod'

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * CID regex for Storacha (CIDv1 with base32 encoding)
 * Format: bafy followed by 50-59 alphanumeric characters
 */
export const cidRegex = /^bafy[a-zA-Z0-9]{50,59}$/

/**
 * Ethereum address regex (40 hex chars with 0x prefix)
 */
export const addressRegex = /^0x[a-fA-F0-9]{40}$/

/**
 * Transaction hash regex (64 hex chars with 0x prefix)
 */
export const txHashRegex = /^0x[a-fA-F0-9]{64}$/

/**
 * bytes32 regex (64 hex chars with 0x prefix) - same as txHash
 * Used for envelopeHash (keccak256 hash)
 */
export const bytes32Regex = /^0x[a-fA-F0-9]{64}$/

/**
 * USDC amount regex (positive decimal with up to 6 decimal places)
 */
export const usdcAmountRegex = /^\d+(\.\d{1,6})?$/

// ============================================================================
// Base Schemas (Reusable)
// ============================================================================

/**
 * Storacha CID validation
 */
export const CidSchema = z.string().regex(cidRegex, 'Invalid CID format')

/**
 * Ethereum address validation
 */
export const AddressSchema = z
  .string()
  .regex(addressRegex, 'Invalid Ethereum address')

/**
 * Transaction hash validation
 */
export const TxHashSchema = z
  .string()
  .regex(txHashRegex, 'Invalid transaction hash')

/**
 * bytes32 hash validation (for envelopeHash)
 */
export const Bytes32Schema = z
  .string()
  .regex(bytes32Regex, 'Invalid bytes32 hash')

/**
 * USDC amount validation (string format for precision)
 */
export const UsdcAmountSchema = z
  .string()
  .regex(usdcAmountRegex, 'Invalid USDC amount')

/**
 * Listing category enum
 */
export const CategorySchema = z.enum([
  'AI/ML',
  'IoT',
  'Health',
  'Finance',
  'Other',
])

// ============================================================================
// API Request Schemas
// ============================================================================

/**
 * Schema for creating a new listing
 * Used by POST /listings endpoint
 */
export const CreateListingSchema = z.object({
  onchainId: z.number().int().positive('Listing ID must be positive'),
  dataCid: CidSchema,
  envelopeCid: CidSchema,
  envelopeHash: Bytes32Schema,
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be at most 5000 characters'),
  category: CategorySchema,
  priceUsdc: UsdcAmountSchema,
  origFilename: z.string().max(255).optional(),
  contentType: z.string().max(100).optional(),
})

/**
 * Schema for updating a listing (partial)
 */
export const UpdateListingSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters')
    .optional(),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be at most 5000 characters')
    .optional(),
  category: CategorySchema.optional(),
  active: z.boolean().optional(),
})

/**
 * Schema for creating a purchase record
 * Used after on-chain purchase is detected
 */
export const CreatePurchaseSchema = z.object({
  listingId: z.string().cuid('Invalid listing ID'),
  buyerAddress: AddressSchema,
  txHash: TxHashSchema,
  amountUsdc: UsdcAmountSchema,
  blockNumber: z.number().int().positive().optional(),
})

/**
 * Schema for binding buyer public key
 * Used by POST /purchases/:id/bind-key endpoint
 */
export const BindKeySchema = z.object({
  publicKey: z.string().min(1, 'Public key is required'),
  signature: z.string().min(1, 'Signature is required'),
})

/**
 * Schema for delivering encrypted key
 * Used by POST /purchases/:id/key endpoint
 */
export const DeliverKeySchema = z.object({
  keyCid: CidSchema,
})

/**
 * Schema for verifying a purchase transaction
 * Used by POST /purchases/verify endpoint
 */
export const VerifyPurchaseSchema = z.object({
  txHash: TxHashSchema,
  expectedListingId: z.number().int().positive(),
  expectedBuyer: AddressSchema,
})

/**
 * Schema for listing query parameters
 */
export const ListingQuerySchema = z.object({
  category: CategorySchema.optional(),
  seller: AddressSchema.optional(),
  active: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Schema for pagination parameters
 */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// ============================================================================
// Type Exports (Inferred from Schemas)
// ============================================================================

export type CreateListingInput = z.infer<typeof CreateListingSchema>
export type UpdateListingInput = z.infer<typeof UpdateListingSchema>
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>
export type BindKeyInput = z.infer<typeof BindKeySchema>
export type DeliverKeyInput = z.infer<typeof DeliverKeySchema>
export type VerifyPurchaseInput = z.infer<typeof VerifyPurchaseSchema>
export type ListingQuery = z.infer<typeof ListingQuerySchema>
export type Pagination = z.infer<typeof PaginationSchema>
export type Category = z.infer<typeof CategorySchema>

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate input and return typed result or throw ZodError
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}

/**
 * Validate input and return result object (safe parse)
 */
export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): z.SafeParseReturnType<unknown, T> {
  return schema.safeParse(data)
}

/**
 * Check if a string is a valid CID
 */
export function isValidCid(cid: string): boolean {
  return cidRegex.test(cid)
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return addressRegex.test(address)
}

/**
 * Check if a string is a valid transaction hash
 */
export function isValidTxHash(hash: string): boolean {
  return txHashRegex.test(hash)
}

/**
 * Check if a string is a valid bytes32 hash
 */
export function isValidBytes32(hash: string): boolean {
  return bytes32Regex.test(hash)
}

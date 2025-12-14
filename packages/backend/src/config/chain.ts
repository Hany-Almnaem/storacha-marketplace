import { createPublicClient, http, getContract } from 'viem'
import { baseSepolia } from 'viem/chains'

// Import ABI directly from deployments
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON import
import DataMarketplaceABI from '../../../contracts/deployments/base-sepolia.json' assert { type: 'json' }

/**
 * DataMarketplace contract ABI
 * Exported for use in event parsing and transaction verification
 */
export const MARKETPLACE_ABI = DataMarketplaceABI as typeof DataMarketplaceABI

/**
 * Contract address from environment
 * Defaults to deployed address on Base Sepolia testnet
 */
export const MARKETPLACE_ADDRESS = (process.env[
  'MARKETPLACE_CONTRACT_ADDRESS'
] || '0xce383BfDF637772a9C56EEa033B7Eb9129A19999') as `0x${string}`

/**
 * RPC URL for Base Sepolia
 * Can be overridden via environment variable for different providers
 */
export const BASE_SEPOLIA_RPC_URL =
  process.env['BASE_SEPOLIA_RPC_URL'] || 'https://sepolia.base.org'

/**
 * HTTP transport configuration with retry logic
 */
const transport = http(BASE_SEPOLIA_RPC_URL, {
  retryCount: 3,
  retryDelay: 1000,
  timeout: 30_000,
})

/**
 * Public client for Base Sepolia
 * Used for reading contract state and fetching transaction receipts
 */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport,
})

/**
 * Typed contract instance for DataMarketplace
 * Provides type-safe access to contract functions and events
 */
export const marketplaceContract = getContract({
  address: MARKETPLACE_ADDRESS,
  abi: MARKETPLACE_ABI,
  client: publicClient,
})

/**
 * Check if the RPC connection is healthy
 * Returns the current block number or null if connection fails
 */
export async function checkChainHealth(): Promise<number | null> {
  try {
    const blockNumber = await publicClient.getBlockNumber()
    return Number(blockNumber)
  } catch (error) {
    console.error('Chain health check failed:', error)
    return null
  }
}

/**
 * Get the chain ID to verify we're connected to Base Sepolia
 */
export async function getChainId(): Promise<number> {
  return publicClient.getChainId()
}

export const CONFIRMATIONS_REQUIRED = Number(
  process.env['CHAIN_CONFIRMATIONS'] || 5
)

export default publicClient

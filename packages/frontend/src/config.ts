import { http, createConfig } from 'wagmi'
import { baseSepolia, mainnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [baseSepolia, mainnet],
  transports: {
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
  },
})
export const BLOCK_EXPLORER_URL =
  process.env['NEXT_PUBLIC_BLOCK_EXPLORER_URL'] ||
  'https://sepolia.basescan.org'

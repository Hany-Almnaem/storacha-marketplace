import { http, createConfig } from 'wagmi'
import { baseSepolia, mainnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [baseSepolia, mainnet],
  transports: {
    [baseSepolia.id]: http(process.env['NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL']),
    [mainnet.id]: http(process.env['NEXT_PUBLIC_MAINNET_RPC_URL']),
  },
})

import { http, createConfig } from 'wagmi'
import { baseSepolia, mainnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [baseSepolia, mainnet],
  transports: {
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
  },
})

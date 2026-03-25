'use client'

import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { useAccount, WagmiProvider, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import '@rainbow-me/rainbowkit/styles.css'

import { clearAuthCache } from '@/lib/authCache'

const projectId = process.env['NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID'] ?? ''

const config = getDefaultConfig({
  appName: 'Storacha Marketplace',
  projectId,
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
})

const queryClient = new QueryClient()

function AuthCacheInvalidator() {
  const { address, isConnected } = useAccount()
  const prevAddressRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const previousAddress = prevAddressRef.current

    if (!isConnected || !address) {
      // Wallet disconnected entirely: remove all cached headers.
      clearAuthCache()
      prevAddressRef.current = undefined
      return
    }

    // Wallet account switched: remove only the previous account's cached headers.
    if (previousAddress && previousAddress !== address) {
      clearAuthCache(previousAddress)
    }

    prevAddressRef.current = address
  }, [address, isConnected])

  return null
}

/**
 * Web3Provider wraps the application with Wagmi, React Query, and RainbowKit.
 * Uses mounted state to prevent SSR hydration mismatch with theme detection.
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()

  // Wait for client-side hydration before rendering theme-dependent components
  useEffect(() => {
    setMounted(true)
  }, [])

  // Render children without RainbowKit theme during SSR to avoid hydration mismatch
  // The theme will be applied after client-side hydration completes
  const rainbowTheme = mounted
    ? resolvedTheme === 'dark'
      ? darkTheme()
      : lightTheme()
    : undefined

  return (
    <WagmiProvider config={config}>
      <AuthCacheInvalidator />
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact" theme={rainbowTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

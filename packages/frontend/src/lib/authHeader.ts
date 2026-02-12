import type { SignMessageMutateAsync } from 'wagmi/query'

export async function buildAuthHeader(
  address: string,
  signMessageAsync: SignMessageMutateAsync,
  purpose: 'listing' | 'general' = 'listing'
) {
  const timestamp = Date.now().toString()

  const message =
    purpose === 'listing'
      ? `Create listing on Data Marketplace\nTimestamp: ${timestamp}`
      : `Authenticate to Data Marketplace\nTimestamp: ${timestamp}`

  const signature = await signMessageAsync({ message })

  return `signature ${address}:${timestamp}:${signature}`
}

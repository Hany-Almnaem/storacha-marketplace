import { useWriteContract } from 'wagmi'

const MARKETPLACE_ABI = [
  {
    name: 'purchaseAccess',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_listingId', type: 'uint256' }],
    outputs: [],
  },
] as const

export function usePurchaseAccess(marketplaceAddress: `0x${string}`) {
  const { writeContractAsync } = useWriteContract()

  const purchase = async (onchainId: number) => {
    if (onchainId === undefined || onchainId === null) {
      throw new Error('Invalid onchainId')
    }

    return writeContractAsync({
      address: marketplaceAddress,
      abi: MARKETPLACE_ABI,
      functionName: 'purchaseAccess',
      args: [BigInt(onchainId)],
    })
  }

  return { purchase }
}

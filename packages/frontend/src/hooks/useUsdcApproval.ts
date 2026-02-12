import { parseUnits } from 'viem'
import { useWriteContract } from 'wagmi'

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export function useUsdcApproval(
  usdcAddress: `0x${string}`,
  marketplaceAddress: `0x${string}`,
  priceUsdc: string
) {
  const { writeContractAsync } = useWriteContract()

  const approveIfNeeded = async () => {
    const amount = parseUnits(priceUsdc, 6) // ✅ USDC = 6 decimals

    return writeContractAsync({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [marketplaceAddress, amount],
    })
  }

  return { approveIfNeeded }
}

import { parseUnits } from 'viem'
import { useWriteContract, useReadContract } from 'wagmi'

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
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      {
        type: 'uint256',
      },
    ],
  },
] as const

export function useUsdcApproval(
  usdcAddress: `0x${string}`,
  marketplaceAddress: `0x${string}`,
  priceUsdc: string,
  requiredAmount: string
) {
  const { writeContractAsync } = useWriteContract()
  const { readContractAsync } = useReadContract()

  const approveIfNeeded = async () => {
    const amount = parseUnits(priceUsdc, 6) // ✅ USDC = 6 decimals

    const currentAllowance = await readContractAsync({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowancegi',
      args: [address, marketplaceAddress],
    })

    if (requiredAmount > currentAllowance) {
      return writeContractAsync({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [marketplaceAddress, amount],
      })
    }

    return
  }

  return { approveIfNeeded }
}

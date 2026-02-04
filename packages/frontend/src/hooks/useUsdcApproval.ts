import { parseUnits } from 'viem'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'

const USDC_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
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
  spender: `0x${string}`,
  amount: string
) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const { data: allowance } = useReadContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, spender] : undefined,
  })

  const approveIfNeeded = async () => {
    const required = parseUnits(amount, 6)
    if (allowance && allowance >= required) return

    await writeContractAsync({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [spender, required],
    })
  }

  return { approveIfNeeded }
}

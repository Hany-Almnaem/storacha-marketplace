import { parseUnits } from 'viem'
import { useWriteContract, useAccount } from 'wagmi'
import { readContract } from 'wagmi/actions'

import { config } from '../config'
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
  priceUsdc: string
) {
  const { writeContractAsync } = useWriteContract()
  const { address } = useAccount()

  const approveIfNeeded = async () => {
    if (!address) throw new Error('Wallet not connected')

    const amount = parseUnits(priceUsdc, 6) // ✅ USDC = 6 decimals

    const currentAllowance = await readContract(config, {
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, marketplaceAddress],
    })

    if (amount > currentAllowance) {
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

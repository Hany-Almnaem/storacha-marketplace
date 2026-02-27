export interface ParsedRpcError {
  title: string
  detail: string
  suggestion: string
  retryable: boolean
}

interface ErrorPattern {
  test: (message: string) => boolean
  parse: (message: string) => ParsedRpcError
}

function extractRevertReason(message: string): string | null {
  const reasonMatch = message.match(
    /reverted with the following reason:\s*(.+?)(?:\n|Contract Call:|$)/i
  )
  if (reasonMatch?.[1]) return reasonMatch[1].trim()

  const customMatch = message.match(/Error:\s*(\w+)\(/i)
  if (customMatch?.[1]) return customMatch[1]

  return null
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    test: (m) =>
      /user (rejected|denied|cancelled|refused)/i.test(m) ||
      /request.*rejected/i.test(m),
    parse: () => ({
      title: 'Transaction cancelled',
      detail: 'You rejected the transaction in your wallet.',
      suggestion: 'Click "Retry Purchase" when you are ready to try again.',
      retryable: true,
    }),
  },

  {
    test: (m) => /exceeds maximum per-transaction gas limit/i.test(m),
    parse: (m) => {
      const reason = extractRevertReason(m)
      return {
        title: 'Transaction would fail',
        detail: reason
          ? `The contract rejected the call: ${reason}`
          : 'The contract rejected this transaction during simulation.',
        suggestion:
          'Common causes: the listing may no longer exist on-chain, ' +
          'you may have already purchased it, or your USDC approval may not have completed. ' +
          'Check your wallet balance and try again.',
        retryable: true,
      }
    },
  },

  {
    test: (m) =>
      /insufficient funds for gas/i.test(m) ||
      /sender doesn't have enough funds/i.test(m),
    parse: () => ({
      title: 'Insufficient ETH for gas',
      detail: 'Your wallet does not have enough ETH to cover the gas fee.',
      suggestion:
        'Add ETH to your wallet on Base Sepolia, then retry the purchase.',
      retryable: true,
    }),
  },

  {
    test: (m) =>
      /insufficient (allowance|balance)/i.test(m) ||
      /transfer amount exceeds balance/i.test(m) ||
      /ERC20: transfer amount exceeds/i.test(m),
    parse: () => ({
      title: 'Insufficient USDC',
      detail:
        'Your wallet does not have enough USDC, or the approval did not complete.',
      suggestion:
        'Verify your USDC balance and ensure the approval step succeeded before retrying.',
      retryable: true,
    }),
  },

  {
    test: (m) =>
      /nonce too (low|high)/i.test(m) ||
      /replacement transaction underpriced/i.test(m),
    parse: () => ({
      title: 'Transaction conflict',
      detail:
        'A pending transaction is conflicting with this one (nonce issue).',
      suggestion:
        'Wait a moment for pending transactions to confirm, then refresh the page and retry.',
      retryable: true,
    }),
  },

  {
    test: (m) =>
      /could not detect network/i.test(m) ||
      /network changed/i.test(m) ||
      /chain mismatch/i.test(m) ||
      /wallet_switchEthereumChain/i.test(m),
    parse: () => ({
      title: 'Wrong network',
      detail: 'Your wallet is connected to the wrong network.',
      suggestion:
        'Switch to Base Sepolia in your wallet, then retry the purchase.',
      retryable: true,
    }),
  },

  {
    test: (m) =>
      /timeout/i.test(m) ||
      /ETIMEDOUT/i.test(m) ||
      /ECONNREFUSED/i.test(m) ||
      /fetch failed/i.test(m),
    parse: () => ({
      title: 'Network error',
      detail: 'The RPC node or backend did not respond in time.',
      suggestion:
        'Check your internet connection and retry. If the problem persists, the RPC may be temporarily overloaded.',
      retryable: true,
    }),
  },

  {
    test: (m) =>
      /rate.?limit/i.test(m) || /429/i.test(m) || /too many requests/i.test(m),
    parse: () => ({
      title: 'Rate limited',
      detail: 'Too many requests were sent to the RPC node.',
      suggestion: 'Wait 30 seconds and retry.',
      retryable: true,
    }),
  },

  {
    test: (m) => /Purchase not indexed by backend/i.test(m),
    parse: () => ({
      title: 'Indexing delay',
      detail:
        'Your on-chain purchase succeeded, but the backend has not indexed it yet.',
      suggestion:
        'Your funds are safe. Refresh the Purchases page in a minute — ' +
        'the purchase should appear once the indexer catches up.',
      retryable: false,
    }),
  },

  {
    test: (m) =>
      /revert/i.test(m) ||
      /execution reverted/i.test(m) ||
      /VM Exception/i.test(m),
    parse: (m) => {
      const reason = extractRevertReason(m)
      return {
        title: 'Contract error',
        detail: reason
          ? `The contract reverted: ${reason}`
          : 'The smart contract rejected this transaction.',
        suggestion:
          'The listing may have been removed or already purchased. ' +
          'Refresh the page and verify the listing is still available.',
        retryable: true,
      }
    },
  },
]

export function classifyRpcError(error: unknown): ParsedRpcError {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return pattern.parse(message)
    }
  }

  return {
    title: 'Purchase failed',
    detail: message.length > 200 ? `${message.slice(0, 200)}…` : message,
    suggestion: 'Try again. If the error persists, refresh the page.',
    retryable: true,
  }
}

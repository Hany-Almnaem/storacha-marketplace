import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

/**
 * Tests for useUsdcApproval hook logic.
 * Using static analysis since this is a React hook and full rendering
 * tests are not yet set up in this environment.
 */
describe('useUsdcApproval hook logic', () => {
  const hookPath = join(__dirname, '../useUsdcApproval.ts')
  const source = readFileSync(hookPath, 'utf-8')

  it('implements the logic to skip approval if allowance is sufficient', () => {
    expect(source).toContain('const amount = parseUnits(priceUsdc, 6)')
    expect(source).toMatch(/if\s*\(amount\s*>\s*currentAllowance\)\s*\{/)

    expect(source).toMatch(
      /if\s*\(amount\s*>\s*currentAllowance\)\s*\{[\s\S]*?return writeContractAsync/
    )
  })

  it('correctly uses the ERC20 ABI for allowance checking', () => {
    expect(source).toContain("functionName: 'allowance'")
    expect(source).toContain('abi: ERC20_ABI')
  })

  it('correctly uses the ERC20 ABI for approval', () => {
    expect(source).toContain("functionName: 'approve'")
    expect(source).toContain('abi: ERC20_ABI')
  })
})

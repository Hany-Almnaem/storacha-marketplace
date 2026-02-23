import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

describe('Seller dashboard split-state UX', () => {
  const dashboardPath = join(__dirname, '../sell/page.tsx')
  const dashboardSource = readFileSync(dashboardPath, 'utf-8')

  const panelPath = join(__dirname, '../../components/KeyDeliveryPanel.tsx')
  const panelSource = readFileSync(panelPath, 'utf-8')

  describe('3-way badge states', () => {
    it('shows amber badge when pending deliveries exist', () => {
      expect(dashboardSource).toContain('pending key deliver')
    })

    it('shows green "All keys delivered" when sales > 0 and pending = 0', () => {
      expect(dashboardSource).toContain('All keys delivered')
      expect(dashboardSource).toContain('listing.salesCount > 0')
    })

    it('shows "No sales yet" when salesCount = 0', () => {
      expect(dashboardSource).toContain('No sales yet')
    })
  })

  describe('sales breakdown', () => {
    it('displays delivered and pending counts below salesCount', () => {
      expect(dashboardSource).toContain(
        '{listing.salesCount - pending} delivered'
      )
      expect(dashboardSource).toContain('{pending} pending')
    })

    it('only shows breakdown when salesCount > 0', () => {
      expect(dashboardSource).toMatch(/listing\.salesCount\s*>\s*0.*delivered/s)
    })
  })

  describe('indexing lag notice', () => {
    it('includes a note about on-chain propagation delay', () => {
      expect(dashboardSource).toContain(
        'Recent on-chain purchases may take a few moments to appear'
      )
    })
  })

  describe('KeyDeliveryPanel empty state messaging', () => {
    it('communicates all keys are delivered when panel is empty', () => {
      expect(panelSource).toContain(
        'All buyer keys have been delivered for this listing'
      )
    })

    it('explains when new purchases will appear', () => {
      expect(panelSource).toContain('after on-chain confirmation and buyer key')
      expect(panelSource).toContain('binding')
    })
  })
})

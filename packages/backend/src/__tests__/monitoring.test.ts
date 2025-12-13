import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { getListenerHealth } from '../services/monitoring'

vi.mock('../config/db', () => ({
  default: {
    eventLog: {
      findFirst: vi.fn(),
    },
  },
}))

import prisma from '../config/db'

const mockFindFirst = prisma.eventLog
  .findFirst as MockedFunction<typeof prisma.eventLog.findFirst>

describe('getListenerHealth', () => {
  it('returns stale=true when no events exist', async () => {
    mockFindFirst.mockResolvedValue(null as any)

    const health = await getListenerHealth()

    expect(health.stale).toBe(true)
  })

  it('returns healthy when recent event exists', async () => {
    mockFindFirst.mockResolvedValue({
      blockNumber: 123,
      createdAt: new Date(),
    } as any)

    const health = await getListenerHealth()

    expect(health.stale).toBe(false)
  })
})

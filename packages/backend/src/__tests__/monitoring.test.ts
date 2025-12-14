import { describe, it, expect, vi, type MockedFunction } from 'vitest'

import prismaDB from '../config/db'
import { getListenerHealth } from '../services/monitoring'

// --------------------
// Mocks
// --------------------
vi.mock('../config/db', () => ({
  default: {
    eventLog: {
      findFirst: vi.fn(),
    },
  },
}))

const mockFindFirst = prismaDB.eventLog.findFirst as MockedFunction<
  typeof prismaDB.eventLog.findFirst
>

describe('getListenerHealth', () => {
  it('returns stale=true when no events exist', async () => {
    mockFindFirst.mockResolvedValue(null)

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

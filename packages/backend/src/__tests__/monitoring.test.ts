import { describe, it, expect, vi, type MockedFunction } from 'vitest'

import prismaDB from '../config/db'
import { getLastPollTime } from '../services/eventListener'
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

vi.mock('../services/eventListener', () => ({
  getLastPollTime: vi.fn(),
}))

const mockFindFirst = prismaDB.eventLog.findFirst as MockedFunction<
  typeof prismaDB.eventLog.findFirst
>

const mockGetLastPollTime = getLastPollTime as MockedFunction<
  typeof getLastPollTime
>

describe('getListenerHealth', () => {
  it('returns stale=true when lastPollTime is 0', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockGetLastPollTime.mockReturnValue(0)

    const health = await getListenerHealth()

    expect(health.stale).toBe(true)
  })

  it('returns healthy when recent poll exists', async () => {
    mockFindFirst.mockResolvedValue({
      blockNumber: 123,
      createdAt: new Date(),
    } as any)
    mockGetLastPollTime.mockReturnValue(Date.now())

    const health = await getListenerHealth()

    expect(health.stale).toBe(false)
  })

  it('returns stale when last poll is old', async () => {
    mockFindFirst.mockResolvedValue({
      blockNumber: 123,
      createdAt: new Date(),
    } as any)
    // 11 minutes ago (threshold is 10)
    mockGetLastPollTime.mockReturnValue(Date.now() - 11 * 60 * 1000)

    const health = await getListenerHealth()

    expect(health.stale).toBe(true)
  })
})

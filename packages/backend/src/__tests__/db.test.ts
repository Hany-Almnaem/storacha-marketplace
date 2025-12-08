import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock PrismaClient before importing db module
vi.mock('@prisma/client', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  }
  return {
    PrismaClient: vi.fn(() => mockPrisma),
  }
})

describe('Database Connection', () => {
  let mockPrisma: {
    $queryRaw: ReturnType<typeof vi.fn>
    $disconnect: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetModules()
    // Import fresh module to get mocked prisma
    const dbModule = await import('../config/db.js')
    mockPrisma = dbModule.prisma as unknown as typeof mockPrisma
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('checkDatabaseHealth', () => {
    it('should return true when database is connected', async () => {
      const { checkDatabaseHealth } = await import('../config/db.js')
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

      const result = await checkDatabaseHealth()

      expect(result).toBe(true)
      expect(mockPrisma.$queryRaw).toHaveBeenCalled()
    })

    it('should return false when database connection fails', async () => {
      const { checkDatabaseHealth } = await import('../config/db.js')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection failed'))

      const result = await checkDatabaseHealth()

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Database health check failed:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })
  })

  describe('disconnectDatabase', () => {
    it('should call prisma.$disconnect', async () => {
      const { disconnectDatabase } = await import('../config/db.js')
      mockPrisma.$disconnect.mockResolvedValueOnce(undefined)

      await disconnectDatabase()

      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
    })
  })

  describe('prisma client export', () => {
    it('should export a prisma client instance', async () => {
      const { prisma } = await import('../config/db.js')

      expect(prisma).toBeDefined()
      expect(prisma.$queryRaw).toBeDefined()
      expect(prisma.$disconnect).toBeDefined()
    })
  })
})

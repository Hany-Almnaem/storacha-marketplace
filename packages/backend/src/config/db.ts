import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton for database operations.
 *
 * In development, we attach the client to globalThis to prevent
 * multiple instances during hot-reloading.
 *
 * In production, connection pooling is handled by Prisma's default
 * connection pool (configurable via DATABASE_URL connection string).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

/**
 * Check database connection health.
 * Returns true if connection is successful, false otherwise.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}

/**
 * Gracefully disconnect from the database.
 * Should be called during application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}

export default prisma

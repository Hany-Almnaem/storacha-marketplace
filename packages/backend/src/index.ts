import cors from 'cors'
import 'dotenv/config'
import express, {
  json,
  urlencoded,
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import helmet from 'helmet'

import { checkDatabaseHealth, disconnectDatabase } from './config/db.js'

const PORT = process.env['BACKEND_PORT'] || 3001
const CORS_ORIGINS = process.env['CORS_ORIGINS']?.split(',') || [
  'http://localhost:3000',
]

const app: Application = express()

app.use(helmet())
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
)
app.use(json({ limit: '10mb' }))
app.use(urlencoded({ extended: true }))

app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth()

  const status = dbHealthy ? 'ok' : 'degraded'
  const statusCode = dbHealthy ? 200 : 503

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env['npm_package_version'] || '0.1.0',
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
    },
  })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env['NODE_ENV'] === 'development' ? err.message : undefined,
  })
})

const server = app.listen(PORT, () => {
  process.stdout.write(`Server running on http://localhost:${PORT}\n`)
  process.stdout.write(`Health check: http://localhost:${PORT}/health\n`)
})

const shutdown = async (signal: string) => {
  process.stdout.write(`${signal} received. Shutting down...\n`)

  // Close HTTP server first (stop accepting new connections)
  server.close(async () => {
    process.stdout.write('HTTP server closed\n')

    try {
      // Disconnect from database
      await disconnectDatabase()
      process.stdout.write('Database disconnected\n')
      process.exit(0)
    } catch (error) {
      console.error('Error during shutdown:', error)
      process.exit(1)
    }
  })

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

export default app

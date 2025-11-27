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

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env['npm_package_version'] || '0.1.0',
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

const shutdown = (signal: string) => {
  process.stdout.write(`${signal} received. Shutting down...\n`)
  server.close(() => {
    process.stdout.write('Server closed\n')
    process.exit(0)
  })
  setTimeout(() => {
    console.error('Forced shutdown')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app

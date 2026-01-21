/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { VerifyPurchaseSchema } from './lib/validation.js'
import listingsRouter from './routes/listings.js'
import purchasesRouter from './routes/purchases.js'
import {
  startPurchaseListener,
  stopPurchaseListener,
} from './services/eventListener.js'
import { getListenerHealth } from './services/monitoring.js'
import { verifyPurchase } from './services/txVerification'

const PORT = process.env['BACKEND_PORT'] || 3001
const CORS_ORIGINS = process.env['CORS_ORIGINS']?.split(',') || [
  'http://localhost:3000',
]
const isTest = process.env['NODE_ENV'] === 'test'

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

// --------------------
// Health
// --------------------
app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth()
  const listenerHealth = await getListenerHealth()

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      listener: listenerHealth,
    },
  })
})

// --------------------
// Verify purchase
// --------------------
app.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = VerifyPurchaseSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() })
    }

    const { txHash, expectedListingId, expectedBuyer } = parsed.data

    const verified = await verifyPurchase(
      txHash as `0x${string}`,
      expectedListingId,
      expectedBuyer as `0x${string}`
    )

    res.json({
      data: {
        ...verified,
        amountUsdc: verified.amountUsdc.toString(),
      },
    })
  } catch (err) {
    next(err)
  }
})

// --------------------
// Listings API
// --------------------
app.use('/api/listings', listingsRouter)

// --------------------
// Purchases + Seller API
// --------------------
app.use('/api/purchases', purchasesRouter)
app.use('/api/seller', purchasesRouter)

// --------------------
// 404
// --------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// --------------------
// Error handler
// --------------------
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env['NODE_ENV'] === 'development' ? err.message : undefined,
  })
})

let server: any

if (!isTest) {
  server = app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Health check: http://localhost:${PORT}/health`)

    try {
      await startPurchaseListener()
      console.log('[listener] PurchaseCompleted listener started')
    } catch (err) {
      console.error('[listener] Failed to start:', err)
    }
  })
}

// --------------------
// Graceful shutdown
// --------------------
const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down...`)

  try {
    if (stopPurchaseListener) {
      stopPurchaseListener()
      console.log('[listener] Stopped')
    }
  } catch (err) {
    console.error('[listener] Failed to stop:', err)
  }

  server?.close(async () => {
    try {
      await disconnectDatabase()
      process.exit(0)
    } catch {
      process.exit(1)
    }
  })

  setTimeout(() => process.exit(1), 10_000)
}

if (!isTest) {
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

export default app

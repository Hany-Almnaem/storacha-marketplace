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

import { checkChainHealth } from './config/chain.js'
import { checkDatabaseHealth, disconnectDatabase } from './config/db.js'
import { logger } from './lib/logger.js'
import { VerifyPurchaseSchema } from './lib/validation.js'
import { httpLogger } from './middleware/logger.js'
import listingsRouter from './routes/listings.js'
import purchasesRouter from './routes/purchases.js'
import {
  startPurchaseListener,
  stopPurchaseListener,
  getLastPollTime,
  getLastSuccessfulPollTime,
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
app.use(httpLogger)

// --------------------
// Health
// --------------------
app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth()
  const listenerHealth = await getListenerHealth()
  const blockNumber = await checkChainHealth()
  const lastPollTime = getLastPollTime()
  const lastSuccessfulPollTime = getLastSuccessfulPollTime()

  const isHealthy = dbHealthy && blockNumber !== null && !listenerHealth.stale

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    services: {
      rpc: blockNumber !== null ? 'ok' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      listener: listenerHealth,
    },
    listener: {
      lastPollTime,
      lastSuccessfulPollTime,
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
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error')
  res.status(500).json({
    error: 'Internal server error',
    message:
      process.env['NODE_ENV'] === 'development' ? err.message : undefined,
  })
})

let server: any

if (!isTest) {
  server = app.listen(PORT, async () => {
    logger.info({ port: PORT }, 'Server started')

    try {
      await startPurchaseListener()
      logger.info('PurchaseCompleted listener started')
    } catch (err) {
      logger.error({ err }, 'Failed to start listener')
    }
  })
}

// --------------------
// Graceful shutdown
// --------------------
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received')

  try {
    if (stopPurchaseListener) {
      stopPurchaseListener()
      logger.info('Listener stopped')
    }
  } catch (err) {
    logger.error({ err }, 'Failed to stop listener during shutdown')
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

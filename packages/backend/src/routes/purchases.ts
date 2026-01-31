import type { Prisma } from '@prisma/client'
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from 'express'
import { verifyMessage } from 'viem'

import { prisma } from '../config/db.js'
import {
  BindKeyRequestSchema,
  DeliverKeySchema,
  PurchaseQuerySchema,
} from '../lib/validation.js'
import {
  requireGeneralAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.js'

const router: ExpressRouter = Router()

const MAX_AGE_MS = 5 * 60 * 1000

function normalizeTimestampMs(timestamp: number): number | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null
  }

  return timestamp < 1e12 ? timestamp * 1000 : timestamp
}

function isTimestampFresh(timestamp: number): boolean {
  const timestampMs = normalizeTimestampMs(timestamp)
  if (!timestampMs) {
    return false
  }

  const now = Date.now()
  if (timestampMs > now) {
    return false
  }

  return now - timestampMs <= MAX_AGE_MS
}

function buildBindKeyMessage(
  purchaseId: string,
  publicKey: string,
  timestamp: number
): string {
  const encodedKey = Buffer.from(publicKey, 'utf8').toString('base64')

  return `I am the buyer of purchase ${purchaseId}.\nMy public key: ${encodedKey}\nTimestamp: ${timestamp}`
}

router.get(
  '/pending-deliveries',
  requireGeneralAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PurchaseQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.issues,
        })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      if (!walletAddress) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { cursor, limit } = parsed.data

      const where: Prisma.PurchaseWhereInput = {
        keyDelivered: false,
        buyerPublicKey: { not: null },
        listing: {
          sellerAddress: { equals: walletAddress, mode: 'insensitive' },
        },
        ...(cursor ? { id: { gt: cursor } } : {}),
      }

      const purchases = await prisma.purchase.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        select: {
          id: true,
          buyerAddress: true,
          buyerPublicKey: true,
          listing: {
            select: {
              id: true,
              title: true,
              onchainId: true,
            },
          },
          txHash: true,
          amountUsdc: true,
          createdAt: true,
        },
      })

      const hasNextPage = purchases.length > limit
      const trimmedPurchases = hasNextPage
        ? purchases.slice(0, limit)
        : purchases
      const nextCursor = hasNextPage ? (purchases[limit]?.id ?? null) : null

      const responsePurchases = trimmedPurchases.map((purchase) => ({
        id: purchase.id,
        buyerAddress: purchase.buyerAddress.toLowerCase(),
        buyerPublicKey: purchase.buyerPublicKey,
        listing: {
          id: purchase.listing.id,
          title: purchase.listing.title,
          onchainId: purchase.listing.onchainId,
        },
        txHash: purchase.txHash,
        amountUsdc: purchase.amountUsdc.toString(),
        createdAt: purchase.createdAt,
      }))

      res.json({ purchases: responsePurchases, nextCursor })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/',
  requireGeneralAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PurchaseQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.issues,
        })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      if (!walletAddress) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { cursor, limit } = parsed.data

      const where: Prisma.PurchaseWhereInput = {
        buyerAddress: { equals: walletAddress, mode: 'insensitive' },
        ...(cursor ? { id: { gt: cursor } } : {}),
      }

      const purchases = await prisma.purchase.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        select: {
          id: true,
          listing: {
            select: {
              id: true,
              title: true,
              category: true,
              priceUsdc: true,
              sellerAddress: true,
              dataCid: true,
              envelopeCid: true,
            },
          },
          txHash: true,
          amountUsdc: true,
          txVerified: true,
          buyerPublicKey: true,
          keyDelivered: true,
          keyCid: true,
          createdAt: true,
        },
      })

      const hasNextPage = purchases.length > limit
      const trimmedPurchases = hasNextPage
        ? purchases.slice(0, limit)
        : purchases
      const nextCursor = hasNextPage ? (purchases[limit]?.id ?? null) : null

      const responsePurchases = trimmedPurchases.map((purchase) => ({
        id: purchase.id,
        listing: {
          id: purchase.listing.id,
          title: purchase.listing.title,
          category: purchase.listing.category,
          priceUsdc: purchase.listing.priceUsdc.toString(),
          sellerAddress: purchase.listing.sellerAddress,
          dataCid: purchase.listing.dataCid,
          envelopeCid: purchase.listing.envelopeCid,
        },
        txHash: purchase.txHash,
        amountUsdc: purchase.amountUsdc.toString(),
        txVerified: purchase.txVerified,
        buyerPublicKey: purchase.buyerPublicKey,
        keyDelivered: purchase.keyDelivered,
        keyCid: purchase.keyCid,
        createdAt: purchase.createdAt,
      }))

      res.json({ purchases: responsePurchases, nextCursor })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/:id/bind-key',
  requireGeneralAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = BindKeyRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.issues,
        })
      }

      const purchase = await prisma.purchase.findUnique({
        where: { id: req.params['id'] },
      })

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      if (!walletAddress) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (walletAddress !== purchase.buyerAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (purchase.buyerPublicKey) {
        return res.status(400).json({ error: 'Public key already bound' })
      }

      const { publicKey, signature, timestamp } = parsed.data

      if (!isTimestampFresh(timestamp)) {
        return res.status(401).json({ error: 'Signature expired' })
      }

      const message = buildBindKeyMessage(purchase.id, publicKey, timestamp)
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      })

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' })
      }

      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          buyerPublicKey: publicKey,
          publicKeySignature: signature,
        },
      })

      res.json({ message: 'Public key bound successfully' })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/:id/key',
  requireGeneralAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = DeliverKeySchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.issues,
        })
      }

      const purchase = await prisma.purchase.findUnique({
        where: { id: req.params['id'] },
        include: { listing: true },
      })

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      if (!walletAddress) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (walletAddress !== purchase.listing.sellerAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (purchase.keyDelivered || purchase.keyCid) {
        return res.status(400).json({ error: 'Key already delivered' })
      }

      if (!purchase.buyerPublicKey) {
        return res.status(400).json({ error: 'Buyer public key not bound' })
      }

      const { keyCid } = parsed.data

      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          keyCid,
          keyDelivered: true,
          keyDeliveredAt: new Date(),
        },
      })

      res.json({ message: 'Key delivered successfully' })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/:id/access',
  requireGeneralAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const purchase = await prisma.purchase.findUnique({
        where: { id: req.params['id'] },
        include: { listing: true },
      })

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      if (!walletAddress) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (walletAddress !== purchase.buyerAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!purchase.keyDelivered || !purchase.keyCid) {
        return res.status(404).json({ error: 'Key not delivered yet' })
      }

      res.json({
        dataCid: purchase.listing.dataCid,
        envelopeCid: purchase.listing.envelopeCid,
        keyCid: purchase.keyCid,
      })
    } catch (error) {
      next(error)
    }
  }
)

export default router

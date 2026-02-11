import { Prisma } from '@prisma/client'
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from 'express'

import { prisma } from '../config/db.js'
import {
  AddressSchema,
  CreateListingSchema,
  ListingQuerySchema,
} from '../lib/validation.js'
import {
  optionalAuth,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.js'

const router: ExpressRouter = Router()

const CreateListingRequestSchema = CreateListingSchema.extend({
  sellerAddress: AddressSchema,
})

function buildPriceFilter(minPrice?: string, maxPrice?: string) {
  const filter: { gte?: string; lte?: string } = {}

  if (minPrice) {
    filter.gte = minPrice
  }

  if (maxPrice) {
    filter.lte = maxPrice
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ListingQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      })
    }

    const { category, cursor, limit, minPrice, maxPrice, seller } = parsed.data
    const priceFilter = buildPriceFilter(minPrice, maxPrice)
    const sellerAddress = seller?.toLowerCase()

    const baseWhere: Prisma.ListingWhereInput = {
      active: true,
      ...(priceFilter ? { priceUsdc: priceFilter } : {}),
      ...(sellerAddress ? { sellerAddress } : {}),
    }

    const where: Prisma.ListingWhereInput = {
      ...baseWhere,
      ...(category ? { category } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    }

    const listings = await prisma.listing.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        priceUsdc: true,
        dataCid: true,
        sellerAddress: true,
        createdAt: true,
        _count: { select: { purchases: true } },
      },
    })

    const hasNextPage = listings.length > limit
    const trimmedListings = hasNextPage ? listings.slice(0, limit) : listings
    const nextCursor = hasNextPage ? (listings[limit]?.id ?? null) : null

    const categoryGroups = await prisma.listing.groupBy({
      by: ['category'],
      _count: { _all: true },
      where: baseWhere,
    })

    const categories = categoryGroups.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.category] = row._count._all
        return acc
      },
      {}
    )

    const responseListings = trimmedListings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      priceUsdc: listing.priceUsdc.toString(),
      dataCid: listing.dataCid,
      sellerAddress: listing.sellerAddress,
      salesCount: listing._count.purchases,
      createdAt: listing.createdAt,
    }))

    res.json({ listings: responseListings, nextCursor, categories })
  } catch (error) {
    next(error)
  }
})

router.get(
  '/:id',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params['id'] },
        include: {
          purchases: true,
          _count: { select: { purchases: true } },
        },
      })

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      const isSeller =
        walletAddress &&
        walletAddress.toLowerCase() === listing.sellerAddress.toLowerCase()

      const baseListing = {
        id: listing.id,
        sellerAddress: listing.sellerAddress,
        dataCid: listing.dataCid,
        envelopeCid: listing.envelopeCid,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        priceUsdc: listing.priceUsdc.toString(),
        active: listing.active,
        origFilename: listing.origFilename,
        contentType: listing.contentType,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        salesCount: listing._count.purchases,
        onchainId: listing.onchainId,
      }

      if (isSeller) {
        const purchases = listing.purchases.map((purchase) => ({
          id: purchase.id,
          buyerAddress: purchase.buyerAddress,
          txHash: purchase.txHash,
          amountUsdc: purchase.amountUsdc.toString(),
          txVerified: purchase.txVerified,
          blockNumber: purchase.blockNumber,
          buyerPublicKey: purchase.buyerPublicKey,
          publicKeySignature: purchase.publicKeySignature,
          keyCid: purchase.keyCid,
          keyDelivered: purchase.keyDelivered,
          keyDeliveredAt: purchase.keyDeliveredAt,
          createdAt: purchase.createdAt,
          updatedAt: purchase.updatedAt,
        }))

        return res.json({
          listing: {
            ...baseListing,
            envelopeHash: listing.envelopeHash,
            purchases,
          },
        })
      }

      res.json({ listing: baseListing })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateListingRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.issues,
        })
      }

      const walletAddress = (req as AuthenticatedRequest).walletAddress
      const sellerAddress = parsed.data.sellerAddress.toLowerCase()

      if (!walletAddress || walletAddress !== sellerAddress) {
        return res
          .status(401)
          .json({ error: 'Signature does not match seller' })
      }

      const { sellerAddress: _seller, ...listingData } = parsed.data

      const created = await prisma.listing.create({
        data: {
          ...listingData,
          sellerAddress,
        },
      })

      res.status(201).json({
        id: created.id,
        message: 'Listing created successfully',
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return res.status(409).json({ error: 'Listing already exists' })
      }

      next(error)
    }
  }
)

export default router

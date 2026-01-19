import type { NextFunction, Request, Response } from 'express'
import { verifyMessage } from 'viem'

import { AddressSchema } from '../lib/validation.js'

const MAX_AGE_MS = 5 * 60 * 1000
const SIGNATURE_SCHEME = 'signature'

export type AuthenticatedRequest = Request & { walletAddress?: string }

type ParsedAuthHeader = {
  address: string
  timestamp: string
  signature: string
}

type AuthResult = { ok: true; address: string } | { ok: false; error: string }

export type AuthPurpose = 'listing' | 'general'

function parseAuthorizationHeader(value: string): ParsedAuthHeader | null {
  const [scheme, payload] = value.trim().split(/\s+/, 2)
  if (!scheme || !payload || scheme.toLowerCase() !== SIGNATURE_SCHEME) {
    return null
  }

  const parts = payload.split(':')
  if (parts.length < 3) {
    return null
  }

  const [address, timestamp, ...signatureParts] = parts
  const signature = signatureParts.join(':')

  if (!address || !timestamp || !signature) {
    return null
  }

  return { address, timestamp, signature }
}

function isTimestampFresh(timestamp: string): boolean {
  const parsed = Number(timestamp)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return false
  }

  const timestampMs = parsed < 1e12 ? parsed * 1000 : parsed
  const now = Date.now()
  if (timestampMs > now) {
    return false
  }

  return now - timestampMs <= MAX_AGE_MS
}

function buildMessage(
  timestamp: string,
  purpose: AuthPurpose = 'listing'
): string {
  if (purpose === 'listing') {
    return `Create listing on Data Marketplace\nTimestamp: ${timestamp}`
  }

  return `Authenticate to Data Marketplace\nTimestamp: ${timestamp}`
}

async function authenticate(
  value: string,
  purpose: AuthPurpose = 'listing'
): Promise<AuthResult> {
  const parsed = parseAuthorizationHeader(value)
  if (!parsed) {
    return { ok: false, error: 'Invalid authorization header' }
  }

  const addressResult = AddressSchema.safeParse(parsed.address)
  if (!addressResult.success) {
    return { ok: false, error: 'Invalid address' }
  }

  if (!isTimestampFresh(parsed.timestamp)) {
    return { ok: false, error: 'Signature expired' }
  }

  const isValid = await verifyMessage({
    address: parsed.address as `0x${string}`,
    message: buildMessage(parsed.timestamp, purpose),
    signature: parsed.signature as `0x${string}`,
  })

  if (!isValid) {
    return { ok: false, error: 'Invalid signature' }
  }

  return { ok: true, address: parsed.address.toLowerCase() }
}

function respondUnauthorized(res: Response, message: string): Response {
  return res.status(401).json({ error: message })
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header('authorization')
  if (!header) {
    next()
    return
  }

  try {
    const result = await authenticate(header)
    if (!result.ok) {
      respondUnauthorized(res, result.error)
      return
    }

    ;(req as AuthenticatedRequest).walletAddress = result.address
    next()
  } catch {
    respondUnauthorized(res, 'Invalid signature')
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header('authorization')
  if (!header) {
    respondUnauthorized(res, 'Missing authorization header')
    return
  }

  try {
    const result = await authenticate(header)
    if (!result.ok) {
      respondUnauthorized(res, result.error)
      return
    }

    ;(req as AuthenticatedRequest).walletAddress = result.address
    next()
  } catch {
    respondUnauthorized(res, 'Invalid signature')
  }
}

export async function requireGeneralAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header('authorization')
  if (!header) {
    respondUnauthorized(res, 'Missing authorization header')
    return
  }

  try {
    const result = await authenticate(header, 'general')
    if (!result.ok) {
      respondUnauthorized(res, result.error)
      return
    }

    ;(req as AuthenticatedRequest).walletAddress = result.address
    next()
  } catch {
    respondUnauthorized(res, 'Invalid signature')
  }
}

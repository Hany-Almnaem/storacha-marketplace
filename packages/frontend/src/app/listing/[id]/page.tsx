'use client'

import {
  ArrowLeft,
  ShieldCheck,
  Tag,
  User,
  Wallet,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useAccount } from 'wagmi'

import BuyButton from '@/components/BuyButton'
import { useListingDetail } from '@/hooks/useListingDetail'

export default function ListingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { isConnected } = useAccount()
  const { listing, loading, error } = useListingDetail(params.id)

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-4" />
        <p className="text-muted-foreground">Loading dataset...</p>
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {error || 'Listing not found'}
          </p>
        </div>
      </div>
    )
  }

  const isOwner = listing.purchases !== undefined

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/listing"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Link>

        <div className="card">
          {/* Header */}
          <div className="border-b border-border p-8">
            <div className="flex justify-between w-full items-center gap-2 mb-4">
              <span className="badge flex items-center w-full">
                <Tag className="w-3 h-3 mr-1" />
                {listing.category}
              </span>

              {isOwner && (
                <span className="badge-success flex items-center justify-end w-full">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  You are the Seller
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-foreground">
              {listing.title}
            </h1>
          </div>

          {/* Content */}
          <div className="p-8 space-y-10">
            <div>
              <h3 className="section-title">Description</h3>
              <p className="text-muted-foreground whitespace-pre-line">
                {listing.description}
              </p>
            </div>

            <div className="grid md:grid-cols-1 gap-6">
              <InfoCard
                icon={<Wallet className="w-4 h-4" />}
                label="Price"
                value={`${Number(listing.priceUsdc).toFixed(2)} USDC`}
              />

              <InfoCard
                icon={<User className="w-4 h-4" />}
                label="Seller"
                value={listing.sellerAddress}
              />
            </div>

            {/* CTA */}
            <div className="pt-6 border-t border-border">
              {!isConnected ? (
                <div className="alert-warning">
                  Connect wallet to purchase this dataset.
                </div>
              ) : isOwner ? (
                <div className="alert-muted">This is your listing.</div>
              ) : (
                <BuyButton
                  onchainId={listing.onchainId}
                  priceUsdc={listing.priceUsdc}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center text-muted-foreground mb-2 gap-2">
        {icon}
        <span className="text-xs uppercase font-semibold">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground truncate">{value}</p>
    </div>
  )
}

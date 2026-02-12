import { Search, Filter } from 'lucide-react'
import Link from 'next/link'

import ListingCard from '@/components/ListingCard'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Listing {
  id: string
  title: string
  description: string
  category: string
  priceUsdc: string
}

interface PageProps {
  searchParams?: {
    q?: string
    category?: string
    minPrice?: string
    maxPrice?: string
  }
}

async function getListings(params: PageProps['searchParams']) {
  const query = new URLSearchParams()

  if (params?.q) query.set('q', params.q)
  if (params?.category) query.set('category', params.category)
  if (params?.minPrice) query.set('minPrice', params.minPrice)
  if (params?.maxPrice) query.set('maxPrice', params.maxPrice)

  const res = await fetch(`${API_URL}/api/listings?${query.toString()}`, {
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error('Failed to fetch listings')
  }

  const json = await res.json()
  return json.listings ?? []
}

export default async function ListingPage({ searchParams }: PageProps) {
  const listings = await getListings(searchParams)

  return (
    <main className="min-h-screen gradient-mesh">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center animate-fade-in">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Browse <span className="text-brand-500">Datasets</span>
          </h1>
          <p className="mt-3 text-muted-foreground">
            Encrypted datasets. On-chain payments. Local decryption.
          </p>
        </div>

        {/* Search + Filters */}
        <form
          method="GET"
          className="mb-10 grid gap-4 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm md:grid-cols-5"
        >
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              name="q"
              placeholder="Search datasets..."
              defaultValue={searchParams?.q}
              className="w-full rounded-lg border border-border bg-background px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Category */}
          <select
            name="category"
            defaultValue={searchParams?.category}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Categories</option>
            <option value="AI/ML">AI/ML</option>
            <option value="IoT">IoT</option>
            <option value="Health">Health</option>
            <option value="Finance">Finance</option>
            <option value="Other">Other</option>
          </select>

          {/* Min Price */}
          <input
            type="number"
            name="minPrice"
            placeholder="Min USDC"
            defaultValue={searchParams?.minPrice}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Max Price */}
          <input
            type="number"
            name="maxPrice"
            placeholder="Max USDC"
            defaultValue={searchParams?.maxPrice}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Button */}
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition"
          >
            <Filter className="h-4 w-4" />
            Apply Filters
          </button>
        </form>

        {/* Listings Grid */}
        {listings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            No datasets match your filters.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up">
            {listings.map((listing: Listing) => (
              <Link
                key={listing.id}
                href={`/listing/${listing.id}`}
                className="card group"
              >
                <ListingCard
                  title={listing.title}
                  description={listing.description}
                  priceUsdc={listing.priceUsdc}
                  category={listing.category}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

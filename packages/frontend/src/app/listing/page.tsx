import Link from 'next/link'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Listing {
  id: string
  title: string
  description: string
  category: string
  priceUsdc: string
}

async function getListings(): Promise<Listing[]> {
  const res = await fetch(`${API_URL}/api/listings`, {
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error('Failed to fetch listings')
  }

  const json = await res.json()

  // ✅ API returns { listings, nextCursor, categories }
  return json.listings ?? []
}

export default async function ListingPage() {
  const listings = await getListings()

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Data Marketplace</h1>
          <p className="mt-2 text-gray-600">
            Browse encrypted datasets. Pay once, decrypt locally.
          </p>
        </div>

        {/* Listings */}
        {listings.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            No listings available.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/listing/${listing.id}`}
                className="group bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition"
              >
                <div className="flex flex-col h-full">
                  <div className="mb-3">
                    <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {listing.category}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition">
                    {listing.title}
                  </h2>

                  <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                    {listing.description}
                  </p>

                  <div className="mt-auto flex justify-between items-center pt-4 border-t border-gray-100">
                    <span className="text-sm text-gray-500">Price</span>
                    <span className="text-lg font-semibold text-gray-900">
                      {Number(listing.priceUsdc).toFixed(2)} USDC
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

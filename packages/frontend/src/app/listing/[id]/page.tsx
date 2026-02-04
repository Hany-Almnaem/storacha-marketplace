// packages/frontend/src/app/listing/[id]/page.tsx
import BuyButton from '@/components/BuyButton'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Listing {
  id: string
  title: string
  description: string
  category: string
  priceUsdc: string
  sellerAddress: string
}

async function getListing(id: string): Promise<Listing> {
  const res = await fetch(`${API_URL}/api/listings/${id}`, {
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error('Failed to fetch listing')
  }

  const json = await res.json()
  return json.data
}

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const listing = await getListing(params.id)

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          {/* Header */}
          <div className="mb-6">
            <span className="inline-block mb-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
              {listing.category}
            </span>
            <h1 className="text-3xl font-bold text-gray-900">
              {listing.title}
            </h1>
          </div>

          {/* Description */}
          <div className="mb-8">
            <p className="text-gray-700 whitespace-pre-line">
              {listing.description}
            </p>
          </div>

          {/* Meta */}
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            <div className="border border-gray-200 rounded-md p-4">
              <p className="text-xs uppercase text-gray-500 mb-1">Price</p>
              <p className="text-xl font-bold text-gray-900">
                {Number(listing.priceUsdc).toFixed(2)} USDC
              </p>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <p className="text-xs uppercase text-gray-500 mb-1">Seller</p>
              <p className="text-sm font-mono text-gray-800 truncate">
                {listing.sellerAddress}
              </p>
            </div>
          </div>

          {/* Buy */}
          <div className="border-t border-gray-200 pt-6">
            <BuyButton listingId={listing.id} priceUsdc={listing.priceUsdc} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Datasets are encrypted on Storacha. Only you can decrypt after
          purchase.
        </p>
      </div>
    </main>
  )
}

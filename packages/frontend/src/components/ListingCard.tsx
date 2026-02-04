interface ListingCardProps {
  title: string
  description: string
  priceUsdc: string
}

export default function ListingCard({
  title,
  description,
  priceUsdc,
}: ListingCardProps) {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>

      <p className="text-sm text-gray-600 line-clamp-3 mb-4">{description}</p>

      <div className="mt-auto flex justify-between items-center pt-4 border-t border-gray-100">
        <span className="text-sm text-gray-500">Price</span>
        <span className="text-lg font-semibold text-gray-900">
          {Number(priceUsdc).toFixed(2)} USDC
        </span>
      </div>
    </div>
  )
}

type ListingCardProps = {
  title: string
  description: string
  category: string
  priceUsdc: string
}

const ListingCard = ({
  category,
  title,
  description,
  priceUsdc,
}: ListingCardProps) => {
  return (
    <>
      <div className="mb-3">
        <span className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500">
          {category}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-foreground group-hover:text-brand-500 transition-colors">
        {title}
      </h2>

      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
        {description}
      </p>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Price</span>
        <span className="text-lg font-bold text-foreground">
          {Number(priceUsdc).toFixed(2)} USDC
        </span>
      </div>
    </>
  )
}

export default ListingCard

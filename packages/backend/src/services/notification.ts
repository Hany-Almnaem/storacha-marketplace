export async function notifySeller({
  seller,
  purchaseId,
}: {
  seller: string
  purchaseId: string
}) {
  // MVP: console / email / webhook
  console.log(`Seller ${seller} notified for purchase ${purchaseId}`)
}

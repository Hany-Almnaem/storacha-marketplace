-- NOTE:
-- This migration recreates the Listing table.
-- Because the project is still in early development with no
-- production data, it assumes a fresh database state.
--
-- If you already have a local database, run:
-- pnpm prisma migrate reset
--
-- Future migrations should use additive changes instead of
-- table recreation.

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "onchainId" INTEGER NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "dataCid" TEXT NOT NULL,
    "envelopeCid" TEXT NOT NULL,
    "envelopeHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceUsdc" DECIMAL(18,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "origFilename" TEXT,
    "contentType" TEXT,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "amountUsdc" DECIMAL(18,6) NOT NULL,
    "txVerified" BOOLEAN NOT NULL DEFAULT false,
    "blockNumber" INTEGER,
    "buyerPublicKey" TEXT,
    "publicKeySignature" TEXT,
    "keyCid" TEXT,
    "keyDelivered" BOOLEAN NOT NULL DEFAULT false,
    "keyDeliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_onchainId_key" ON "Listing"("onchainId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_txHash_key" ON "Listing"("txHash");

-- CreateIndex
CREATE INDEX "Listing_active_category_idx" ON "Listing"("active", "category");

-- CreateIndex
CREATE INDEX "Listing_sellerAddress_idx" ON "Listing"("sellerAddress");

-- CreateIndex
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_txHash_key" ON "Purchase"("txHash");

-- CreateIndex
CREATE INDEX "Purchase_buyerAddress_idx" ON "Purchase"("buyerAddress");

-- CreateIndex
CREATE INDEX "Purchase_txVerified_idx" ON "Purchase"("txVerified");

-- CreateIndex
CREATE INDEX "Purchase_keyDelivered_idx" ON "Purchase"("keyDelivered");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_listingId_buyerAddress_key" ON "Purchase"("listingId", "buyerAddress");

-- CreateIndex
CREATE INDEX "EventLog_processed_idx" ON "EventLog"("processed");

-- CreateIndex
CREATE INDEX "EventLog_eventType_idx" ON "EventLog"("eventType");

-- CreateIndex
CREATE INDEX "EventLog_blockNumber_idx" ON "EventLog"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EventLog_txHash_logIndex_key" ON "EventLog"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

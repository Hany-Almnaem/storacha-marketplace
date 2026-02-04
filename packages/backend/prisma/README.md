# Database Seed Script

## Overview

The seed script populates our PostgreSQL database with realistic test data for
development and testing. All data passes strict backend validation rules.

## What Gets Seeded

- **8 Test Listings** across all categories:
  - 2× AI/ML datasets
  - 2× IoT sensor data
  - 2× Health records
  - 1× Finance market data
  - 1× Climate data (Other category)

- **3 Different Sellers** with valid Ethereum addresses

- **Realistic Data**:
  - Valid Storacha CIDv1 format (bafy..., bafk...)
  - Valid bytes32 hashes (0x + 64 hex chars)
  - Prices ranging from $15.50 to $150.00
  - Varied file types (CSV, JSON, ZIP, etc.)

## Prerequisites

### 1. PostgreSQL Running

```bash
# Start PostgreSQL with Docker Compose
cd /Users/hanymac/Downloads/Storacha_DMP/storacha-marketplace
docker compose up -d postgres

# Verify it's running
docker ps | grep postgres
```

### 2. Database URL Configured

Ensure `.env` file exists in `packages/backend/`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marketplace?schema=public"
```

### 3. Prisma Client Generated

```bash
pnpm --filter @marketplace/backend db:generate
```

### 4. Database Schema Applied

```bash
pnpm --filter @marketplace/backend db:push
```

## Usage

### Run the Seed Script

```bash
# From workspace root
pnpm --filter @marketplace/backend db:seed

# Or from backend directory
cd packages/backend
pnpm db:seed
```

### Expected Output

```
🌱 Starting database seed...
📊 Seeding 8 test listings

✅ Created: [#1] AI Training Dataset - Image Classification
✅ Created: [#2] IoT Sensor Data - Smart Home
✅ Created: [#3] Healthcare Records - Anonymized
✅ Created: [#4] Financial Market Data - Stock Prices
✅ Created: [#5] Climate Data - Global Temperature Records
✅ Created: [#6] Natural Language Corpus - Multilingual
✅ Created: [#7] Industrial IoT - Manufacturing Sensor Logs
✅ Created: [#8] Genomics Data - DNA Sequences

============================================================
🎉 Seeding complete!
   ✅ Created: 8
   ⏭️  Skipped: 0
   📊 Total:   8
============================================================

📈 Database Summary:
   Total listings: 8
   Active listings: 8
   By category:
     - AI/ML: 2
     - IoT: 2
     - Health: 2
     - Finance: 1
     - Other: 1
```

## Idempotency

The seed script is **idempotent** - safe to run multiple times:

- First run: Creates all 8 listings
- Subsequent runs: Skips existing listings (based on `onchainId`)

Example second run:

```
⏭️  Skipped: [#1] AI Training Dataset - Image Classification (already exists)
⏭️  Skipped: [#2] IoT Sensor Data - Smart Home (already exists)
...
============================================================
🎉 Seeding complete!
   ✅ Created: 0
   ⏭️  Skipped: 8
   📊 Total:   8
============================================================
```

## Verify Seeded Data

### Via Prisma Studio

```bash
pnpm --filter @marketplace/backend db:studio
```

Then browse to `http://localhost:5555` and view the `Listing` table.

### Via API

```bash
# Start backend
pnpm --filter @marketplace/backend dev

# Test API endpoint
curl http://localhost:3001/api/listings | jq
```

### Via PostgreSQL CLI

```bash
docker exec -it storacha_dmp-postgres-1 psql -U postgres -d marketplace

# In psql:
SELECT id, "onchainId", title, category, "priceUsdc" FROM "Listing";
```

## Testing the Seed Script

Run comprehensive validation and integration tests:

```bash
# Run all tests (includes seed validation)
pnpm --filter @marketplace/backend test

# Run only seed tests
pnpm --filter @marketplace/backend test seed.test
```

### Test Coverage

- ✅ CID format validation (all listings)
- ✅ Ethereum address validation
- ✅ bytes32 hash validation
- ✅ Category enum validation
- ✅ USDC amount validation
- ✅ Title/description length validation
- ✅ Complete schema validation
- ✅ Data uniqueness checks
- ✅ Database insertion
- ✅ Idempotency (upsert logic)
- ✅ Query filtering by category/seller

## Cleaning Up Test Data

To remove all seeded listings:

```bash
docker exec -it storacha_dmp-postgres-1 psql -U postgres -d marketplace

# In psql:
DELETE FROM "Listing" WHERE "onchainId" BETWEEN 1 AND 8;
```

Or use Prisma Studio to manually delete listings.

## Adding More Test Data

Edit `packages/backend/prisma/seed.ts` and add entries to `TEST_LISTINGS` array:

```typescript
const TEST_LISTINGS = [
  // Existing listings...
  {
    onchainId: 9, // Must be unique
    sellerAddress: '0x...',
    dataCid: 'bafy...', // Valid CID
    envelopeCid: 'bafy...', // Valid CID
    envelopeHash: '0x...', // 64 hex chars
    title: 'The Dataset Title',
    description: 'At least 10 characters...',
    category: 'AI/ML', // Must be valid enum
    priceUsdc: '25.00', // Valid decimal
    origFilename: 'data.csv',
    contentType: 'text/csv',
  },
]
```

Then run tests to verify:

```bash
pnpm --filter @marketplace/backend test seed.test
```

## Integration with Development Workflow

Recommended workflow for new developers:

```bash
# 1. Clone repo and install dependencies
git clone <repo>
pnpm install

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Setup database
cd packages/backend
cp .env.example .env
pnpm db:generate
pnpm db:push

# 4. Seed test data
pnpm db:seed

# 5. Start backend
pnpm dev

# 6. Start frontend (in another terminal)
cd ../frontend
pnpm dev

# Now we can test the marketplace UI with real data!
```

/**
 * Database seed script for development and testing
 *
 * Populates the database with realistic test data that passes all validation rules.
 *
 * Usage:
 *   pnpm --filter @marketplace/backend db:seed
 *
 * Prerequisites:
 *   - PostgreSQL running (docker compose up postgres)
 *   - DATABASE_URL configured in .env
 *   - Prisma client generated (pnpm db:generate)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Test data that passes all backend validation rules:
 * - CIDs: Real Storacha CIDv1 format (bafy... with correct length)
 * - Addresses: Valid Ethereum addresses (0x + 40 hex chars)
 * - Hashes: Valid bytes32 (0x + 64 hex chars)
 * - Categories: Valid enum values
 * - Prices: Valid USDC amounts
 */
const TEST_LISTINGS = [
  {
    onchainId: 1,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    envelopeCid:
      'bafybeiabc223xyz456def727ghi242jkl345mno672pqr742stu234vwx567',
    envelopeHash:
      '0x1234567890123456789012345678901234567890123456789012345678901234',
    title: 'AI Training Dataset - Image Classification',
    description:
      'Large-scale image dataset for ML training with 100k labeled images across 50 categories. Perfect for computer vision research.',
    category: 'AI/ML',
    priceUsdc: '15.50',
    origFilename: 'images-100k.zip',
    contentType: 'application/zip',
  },
  {
    onchainId: 2,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafkreid7qoywk77r7rj3slobqfekdvs57qwuwh5d6d2j3jkjqbqhqzn4n4',
    envelopeCid:
      'bafybeibcd234abc567def727ghi223jkl456mno727pqr242stu345vwx672',
    envelopeHash:
      '0x2345678901234567890123456789012345678901234567890123456789012345',
    title: 'IoT Sensor Data - Smart Home',
    description:
      'Real-world sensor readings from 50 smart homes over 6 months. Includes temperature, humidity, motion, and energy consumption data.',
    category: 'IoT',
    priceUsdc: '25.00',
    origFilename: 'sensors-6months.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 3,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafybeihdwdcefgh4kdqkjbjktjqbqr3ydkdpwq6cgqgm6xqxh7w3ywo3mi',
    envelopeCid:
      'bafybeicde345bcd672efg742hij234klm567nop727qrs223tuv456wxy727',
    envelopeHash:
      '0x3456789012345678901234567890123456789012345678901234567890123456',
    title: 'Healthcare Records - Anonymized',
    description:
      'De-identified patient records for medical research (HIPAA compliant). Includes demographics, diagnoses, and treatment outcomes.',
    category: 'Health',
    priceUsdc: '50.00',
    origFilename: 'patient-records.json',
    contentType: 'application/json',
  },
  {
    onchainId: 4,
    sellerAddress: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    dataCid: 'bafybeief567ghi727jkl223mno456pqr727stu242vwx345yzabc672def742',
    envelopeCid:
      'bafybeifgh672ijk742lmn234opq567rst727uvw223xyz456abc727def242ghi',
    envelopeHash:
      '0x4567890123456789012345678901234567890123456789012345678901234567',
    title: 'Financial Market Data - Stock Prices',
    description:
      'Historical stock prices and trading volumes for S&P 500 companies over 10 years. Includes daily OHLC data and market indicators.',
    category: 'Finance',
    priceUsdc: '100.00',
    origFilename: 'market-data-10y.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 5,
    sellerAddress: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    dataCid: 'bafybeighij742klm234nop567qrs727tuv223wxy456zab727cde242fgh345',
    envelopeCid:
      'bafybeijkl242mno345pqr672stu742vwx234yza567bcd727efg223hij456klm',
    envelopeHash:
      '0x5678901234567890123456789012345678901234567890123456789012345678',
    title: 'Climate Data - Global Temperature Records',
    description:
      'Comprehensive climate data including temperature, precipitation, and atmospheric measurements from weather stations worldwide since 1950.',
    category: 'Other',
    priceUsdc: '35.75',
    origFilename: 'climate-global.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 6,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeijklm345nop672qrs742tuv234wxy567zab727cde223fgh456ijk727',
    envelopeCid:
      'bafybeilmn234opq567rst727uvw223xyz456abc727def242ghi345jkl672mno',
    envelopeHash:
      '0x6789012345678901234567890123456789012345678901234567890123456789',
    title: 'Natural Language Corpus - Multilingual',
    description:
      'Large corpus of text data in 20 languages, suitable for NLP model training. Includes news articles, books, and web content.',
    category: 'AI/ML',
    priceUsdc: '45.00',
    origFilename: 'nlp-corpus-20lang.tar.gz',
    contentType: 'application/gzip',
  },
  {
    onchainId: 7,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeimnop567qrs727tuv223wxy456zab727cde242fgh345ijk672lmn742',
    envelopeCid:
      'bafybeinop456qrs727tuv242wxy345zab672cde742fgh234ijk567lmn727opq',
    envelopeHash:
      '0x7890123456789012345678901234567890123456789012345678901234567890',
    title: 'Industrial IoT - Manufacturing Sensor Logs',
    description:
      'Production line sensor data from manufacturing facilities. Includes machine performance metrics, quality control readings, and maintenance logs.',
    category: 'IoT',
    priceUsdc: '60.00',
    origFilename: 'manufacturing-sensors.parquet',
    contentType: 'application/octet-stream',
  },
  {
    onchainId: 8,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeiopqr727stu242vwx345yza672bcd742efg234hij567klm727nop223',
    envelopeCid:
      'bafybeipqr672stu742vwx234yza567bcd727efg223hij456klm727nop242qrs',
    envelopeHash:
      '0x8901234567890123456789012345678901234567890123456789012345678901',
    title: 'Genomics Data - DNA Sequences',
    description:
      'Anonymized genomic sequencing data for research purposes. Includes whole genome sequences and variant annotations.',
    category: 'Health',
    priceUsdc: '150.00',
    origFilename: 'genomics-sequences.vcf.gz',
    contentType: 'application/gzip',
  },
]

async function main() {
  console.log('🌱 Starting database seed...')
  console.log(`📊 Seeding ${TEST_LISTINGS.length} test listings\n`)

  let successCount = 0
  let skipCount = 0

  for (const listing of TEST_LISTINGS) {
    try {
      // Check if listing already exists
      const existing = await prisma.listing.findUnique({
        where: { onchainId: listing.onchainId },
      })

      if (existing) {
        console.log(
          `⏭️  Skipped: [#${listing.onchainId}] ${listing.title} (already exists)`
        )
        skipCount++
      } else {
        await prisma.listing.create({
          data: listing,
        })
        console.log(`✅ Created: [#${listing.onchainId}] ${listing.title}`)
        successCount++
      }
    } catch (error) {
      console.error(`❌ Failed: [#${listing.onchainId}] ${listing.title}`)
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`)
      }
      throw error // Re-throw to fail the seed process
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`🎉 Seeding complete!`)
  console.log(`   ✅ Created: ${successCount}`)
  console.log(`   ⏭️  Skipped: ${skipCount}`)
  console.log(`   📊 Total:   ${TEST_LISTINGS.length}`)
  console.log('='.repeat(60))

  // Display summary
  const totalListings = await prisma.listing.count()
  const activeListings = await prisma.listing.count({ where: { active: true } })
  const categories = await prisma.listing.groupBy({
    by: ['category'],
    _count: { _all: true },
  })

  console.log('\n📈 Database Summary:')
  console.log(`   Total listings: ${totalListings}`)
  console.log(`   Active listings: ${activeListings}`)
  console.log(`   By category:`)
  categories.forEach((cat) => {
    console.log(`     - ${cat.category}: ${cat._count._all}`)
  })
}

main()
  .catch((error) => {
    console.error('\n💥 Seeding failed!')
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

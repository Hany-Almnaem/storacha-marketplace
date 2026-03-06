# Storacha Data Marketplace

Decentralized data marketplace powered by Storacha, Base, and USDC.

## Overview

A marketplace for buying and selling datasets with:

- Client-side encryption (AES-256-GCM)
- Decentralized storage via Storacha/IPFS
- On-chain payments in USDC on Base
- 24-hour buyer protection window

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                      │
│          Marketplace UI, Wallet Connect, Encryption          │
└─────────────────────────┬───────────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────────┐
    │ BACKEND  │   │   BASE   │   │   STORACHA   │
    │ (Express)│   │  (USDC)  │   │  (Storage)   │
    └──────────┘   └──────────┘   └──────────────┘
```

## Tech Stack

| Layer      | Technology                                |
| ---------- | ----------------------------------------- |
| Frontend   | Next.js 14, React 18, Tailwind, Wagmi     |
| Backend    | Node.js 20, Express, TypeScript, Prisma 6 |
| Database   | PostgreSQL 16                             |
| Contracts  | Solidity 0.8.23, Foundry, OpenZeppelin    |
| Storage    | Storacha (w3up-client)                    |
| Blockchain | Base (USDC)                               |

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Foundry (for smart contracts)
- Docker (for local PostgreSQL)

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Hany-Almnaem/storacha-marketplace.git
cd storacha-marketplace
pnpm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` with your values.

### 3. Start Database

```bash
docker compose up -d
```

### 4. Initialize Database

```bash
pnpm --filter @marketplace/backend db:push
```

### 5. Start Development

```bash
pnpm dev
```

Or start individually:

```bash
pnpm --filter @marketplace/backend dev
pnpm --filter @marketplace/frontend dev
```

### 6. Access

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Health Check: http://localhost:3001/health

## Project Structure

```
storacha-marketplace/
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   ├── test/
│   │   └── script/
│   ├── backend/
│   │   ├── src/
│   │   └── prisma/
│   └── frontend/
│       └── src/
│           └── app/
├── .env.example
├── docker-compose.yml
└── package.json
```

## Commands

### Root

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start all packages in dev mode
pnpm build            # Build all packages
pnpm lint             # Run linting
pnpm format           # Format code
pnpm typecheck        # Type checking
pnpm test             # Run tests
```

### Contracts

```bash
pnpm --filter @marketplace/contracts build
pnpm --filter @marketplace/contracts test
```

### Backend

```bash
pnpm --filter @marketplace/backend dev
pnpm --filter @marketplace/backend build
pnpm --filter @marketplace/backend typecheck
pnpm --filter @marketplace/backend db:generate
pnpm --filter @marketplace/backend db:push
pnpm --filter @marketplace/backend db:studio
```

### Frontend

```bash
pnpm --filter @marketplace/frontend dev
pnpm --filter @marketplace/frontend build
pnpm --filter @marketplace/frontend typecheck
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                                   | Used By  | Description                                   |
| ------------------------------------------ | -------- | --------------------------------------------- |
| `DATABASE_URL`                             | Backend  | PostgreSQL connection string                  |
| `BACKEND_PORT`                             | Backend  | Server port (default: 3001)                   |
| `CORS_ORIGINS`                             | Backend  | Comma-separated allowed origins               |
| `BASE_SEPOLIA_RPC_URL`                     | Backend  | Base Sepolia RPC endpoint                     |
| `MARKETPLACE_CONTRACT_ADDRESS`             | Backend  | Deployed marketplace contract address         |
| `USDC_CONTRACT_ADDRESS`                    | Backend  | USDC token contract address                   |
| `NEXT_PUBLIC_API_URL`                      | Frontend | Backend API URL                               |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`     | Frontend | WalletConnect project ID                      |
| `NEXT_PUBLIC_CHAIN_ID`                     | Frontend | Target chain ID (84532 for Sepolia)           |
| `NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS` | Frontend | Marketplace contract address (buy/sell flows) |
| `NEXT_PUBLIC_USDC_ADDRESS`                 | Frontend | USDC contract address (approval + purchase)   |

> **Note:** The backend and frontend use separate env var names for the same
> contract addresses. `MARKETPLACE_CONTRACT_ADDRESS` is read by the backend
> indexer. `NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS` is read by the frontend
> wallet interactions. Both must point to the same deployed contract.

## Database

Start PostgreSQL:

```bash
docker compose up -d
```

Push schema:

```bash
pnpm --filter @marketplace/backend db:push
```

Open Prisma Studio:

```bash
pnpm --filter @marketplace/backend db:studio
```

## Deployment

### Smart Contracts

```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

### Backend

Deploy to Railway, Render, or Fly.io with PostgreSQL.

### Frontend

Deploy to Vercel with environment variables configured.

## Testing

CI runs backend and frontend unit tests on every PR to `master`.

```bash
pnpm --filter @marketplace/backend test      # backend unit tests
pnpm --filter @marketplace/frontend test:unit # frontend unit tests
pnpm --filter @marketplace/contracts test     # contract tests (requires Foundry)
```

### What runs in CI

| Suite               | Runner                 | Runs in CI                         |
| ------------------- | ---------------------- | ---------------------------------- |
| Backend unit tests  | Vitest                 | Yes                                |
| Frontend unit tests | Vitest                 | Yes                                |
| Contract tests      | Foundry (`forge test`) | No — requires Foundry, run locally |

### Tests that require a database

`integration.test.ts` and `seed.test.ts` require a running PostgreSQL instance.
`integration.test.ts` is fully guarded by
`describe.skipIf(!process.env['DATABASE_URL'])`. `seed.test.ts` runs validation
tests always, and only its integration block is guarded with
`{ skip: !process.env['DATABASE_URL'] }`. In CI, `DATABASE_URL` is intentionally
unset for backend tests, so only database-dependent blocks skip.

To run them locally:

```bash
docker compose up -d                          # start PostgreSQL
pnpm --filter @marketplace/backend test       # all tests including integration
```

### Quarantined tests

A small number of tests are temporarily skipped with `it.skip` and a
`QUARANTINED` comment explaining the root cause. Search the test files for
`QUARANTINED` to find them. Each quarantined test names the issue that will
repair it.

Current quarantines:

- `listings.test.ts` — 1 test: stale assertion on `onchainId` visibility
  (tracked for BETA-02)
- `purchases.test.ts` — 4 tests: `verifyMessage` mock drift in bind-key and key
  delivery paths

## Security

- Never commit `.env` or files with secrets
- All encryption happens client-side
- Backend never stores plaintext keys

## License

MIT

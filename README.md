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
cp .env.example .env.local
```

Edit `.env.local` with your values.

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

Copy `.env.example` to `.env.local` and configure:

| Variable                               | Description               |
| -------------------------------------- | ------------------------- |
| `DATABASE_URL`                         | PostgreSQL connection     |
| `BACKEND_PORT`                         | Backend server port       |
| `CORS_ORIGINS`                         | Allowed CORS origins      |
| `BASE_SEPOLIA_RPC_URL`                 | Base Sepolia RPC endpoint |
| `BASE_MAINNET_RPC_URL`                 | Base Mainnet RPC endpoint |
| `NEXT_PUBLIC_API_URL`                  | Backend API URL           |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID  |
| `NEXT_PUBLIC_CHAIN_ID`                 | Target chain ID           |
| `MARKETPLACE_CONTRACT_ADDRESS`         | Deployed contract address |
| `USDC_CONTRACT_ADDRESS`                | USDC token address        |

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

## Security

- Never commit `.env.local` or files with secrets
- All encryption happens client-side
- Backend never stores plaintext keys

## License

MIT

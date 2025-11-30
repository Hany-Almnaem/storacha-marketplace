# Data Marketplace Contract

---

# 📁 Folder Structure 

```
data-marketplace/
│
├── contracts/
│   ├── DataMarketplace.sol        # Core marketplace smart contract
│
├── script/
│   ├── Deploy.s.sol               # Deployment script for Base Sepolia/Mainnet
│
├── test/
│   ├── DataMarketplace.t.sol      # Main Foundry test suite
│
│
├── lib/
│   ├── openzeppelin-contracts/    # Installed via forge install
│   └── forge-std/                 # Standard testing library
│
├── foundry.toml
├── .env
├── remappings.txt
├── README.md
└── .gitignore
```

---

# Data Marketplace (MVP)

A decentralized on-chain marketplace for encrypted datasets. Sellers list encrypted files using Storacha/IPFS, and buyers purchase access using USDC on Base.
The smart contract handles payments, fees, and purchase records. Actual data access is controlled off-chain using UCAN capability tokens.

---

## Overview

This MVP implements:

* Listing encrypted datasets
* Purchasing access via USDC (Base Sepolia / Base mainnet)
* 2.5% platform fee (configurable)
* 24-hour withdrawal delay for seller earnings
* Secure token transfers via SafeERC20
* On-chain purchase record for off-chain UCAN authorization
* Base-compatible deployment + Foundry test suite

The contract does **not** handle data decryption. After a purchase, backend components use the purchase event to grant UCAN-scoped access to the encrypted dataset stored on Storacha.

---

## Contract Summary

The core logic lives in:

```
contracts/DataMarketplace.sol
```

Key features:

| Feature          | Description                                         |
| ---------------- | --------------------------------------------------- |
| Create Listing   | Seller creates a listing with CID + price           |
| Purchase Access  | Buyer pays USDC; purchase is recorded on-chain      |
| Platform Fee     | Default 2.5% fee taken from each sale               |
| Withdrawal Delay | Seller earnings locked for 24 hours after last sale |
| SafeERC20        | All token transfers are secure                      |
| ReentrancyGuard  | Protection for purchase/withdraw functions          |
| Events           | Used by backend agent to grant UCAN data access     |

---

## Tech Stack

* **Solidity 0.8.23**
* **Foundry** (tests, scripts, deployment)
* **OpenZeppelin Contracts** (Ownable, ReentrancyGuard, SafeERC20)
* **USDC on Base**
* **Storacha** (encrypted storage layer)
* **UCAN** (capability-based access for buyers)

---

## Installation

Clone the repository:

```bash
git clone https://github.com/<your-org>/data-marketplace.git
cd data-marketplace
```

Install dependencies:

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

Set remappings:

```
openzeppelin-contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

---

## Environment Variables


```
BASE_SEPOLIA_RPC_URL='your_rpc_url'
PRIVATE_KEY='your_private_key'
ETHERSCAN_API_KEY='etherscan_api_key'
```

---

## Base Testnet (USDC Address)

Base Sepolia USDC:

```
0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Use this in deployment scripts.

---

## Deployment

Run a deployment script (example):

```bash
source .env
```

```bash
forge script script/Deploy.s.sol:Deploy \
--rpc-url $BASE_SEPOLIA_RPC_URL \
--private-key $PRIVATE_KEY \
--chain-id 84532 \
--broadcast \
--verify \
--etherscan-api-key $ETHERSCAN_API_KEY \
-vvvv
```

---

## Running Tests

To run tests on a Base Sepolia fork:

```bash
forge test -vvv
```

To get the coverage:
```bash
forge coverage
```

---

## Data Access Flow (High-Level)

1. Seller uploads encrypted dataset to Storacha
2. Seller creates on-chain listing with CID + price
3. Buyer purchases listing on-chain using USDC
4. Contract emits `PurchaseCompleted`
5. Backend agent listens for event
6. Backend generates a UCAN capability token granting access to the CID
7. Buyer fetches + decrypts the file using their UCAN

This keeps all sensitive data off-chain while payments and purchase proofs stay trustless on Base.

---

## Future Improvements

* Pausable contract for emergencies
* Listing editing (update price, metadata)
* Dispute or refund system
* Bundled datasets
* Tiered access (e.g., sample vs. full dataset)

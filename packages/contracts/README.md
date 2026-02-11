# **📦 Data Marketplace Smart Contract**

A decentralized marketplace for encrypted datasets, powered by **USDC payments
on Base**, **Storacha for encrypted storage**, and **UCAN** for post-purchase
access control.

This repository contains:

- The Solidity smart contract (`DataMarketplace.sol`)
- Comprehensive Foundry tests (`DataMarketplace.t.sol`)
- Deployment script for Base (`Deploy.s.sol`)
- Documentation for the full seller → buyer → backend → Storacha flow

---

# **📁 Folder Structure**

```
data-marketplace/
│
├── contracts/
│   ├── DataMarketplace.sol         # Core marketplace smart contract
│
├── script/
│   ├── Deploy.s.sol                # Deployment for Base Mainnet / Base Sepolia
│
├── test/
│   ├── DataMarketplace.t.sol       # Full Foundry benchmark + reentrancy tests
│
├── lib/
│   ├── openzeppelin-contracts/     # Installed via forge install
│   └── forge-std/                  # Test utilities (cheatcodes, asserts)
│
├── foundry.toml
├── remappings.txt
├── .env
├── README.md
└── .gitignore
```

---

# **🧩 What This Marketplace Actually Does**

This is **NOT** a file-hosting system.

This is a **trustless payment + purchase-record system** where:

- Encrypted data lives on **Storacha/IPFS**
- Decryption keys stay **off-chain**
- Buyers pay in **USDC**
- Smart contract records the purchase (canonical truth)
- Backend reads events → enables access through **UCAN**
- Sellers withdraw proceeds after a **24-hour security delay**

The contract **never handles plaintext keys** → compliant with EU Data Act
privacy constraints.

---

# **✨ Contract Features (MVP)**

| Feature                 | Description                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Encrypted data listings | Sellers upload encrypted files to Storacha + publish metadata on-chain                    |
| Envelope metadata       | `envelopeCid` (Storacha CID) + `envelopeHash` (keccak256 hash of canonical envelope JSON) |
| USDC payments           | Buyer pays in stablecoins on Base                                                         |
| Platform fee            | Default 2.5%, configurable by owner                                                       |
| Purchase record         | Public on-chain purchase proof for UCAN access                                            |
| Withdrawal delay        | 24h security period (per-listing)                                                         |
| Safe transfers          | All token operations via `SafeERC20`                                                      |
| Reentrancy protections  | All sensitive operations are `nonReentrant`                                               |
| Multi-withdraw          | Sellers can withdraw multiple listings in a single transaction                            |

This ensures a **secure, tamper-evident**, decentralized payment layer for data
commerce.

---

# **🔐 Encryption Model (EnvelopeCID + EnvelopeHash)**

Each listing includes:

### **1. `dataCid`**

Pointer to **encrypted dataset** stored on Storacha.

### **2. `envelopeCid`**

Pointer to **non-secret envelope.json**, containing:

- encryption scheme
- file chunks
- key lookup info
- maybe re-encryption or metadata

### **3. `envelopeHash`**

```
bytes32 envelopeHash = keccak256(canonicalEnvelopeJson)
```

This ensures:

- Backend verifies envelope hasn't been modified
- Buyers can trust envelope metadata
- No reliance on a centralized database for critical integrity

---

# **⚙️ Installation**

```
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

Add to `remappings.txt`:

```
openzeppelin-contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

---

# **📦 Environment Variables**

```
BASE_SEPOLIA_RPC_URL="..."
PRIVATE_KEY="..."
ETHERSCAN_API_KEY="..."
```

---

# **💵 USDC Address (Base Sepolia)**

```
0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Use this for deployment.

---

# **🚀 Deployment**

Run a deployment script (example):

```bash
source .env
```

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --chain-id 84532 \
  -vvvv
```

---

# **🧪 Running Tests**

```
forge test -vvv
```

Coverage:

```
forge coverage
```

Our current suite reaches:

- **96%+ line coverage**
- **90%+ branch coverage**
- **Full reentrancy simulation using malicious token mock**

---

# **📈 End-to-End Data Access Flow (Cryptographically Safe)**

### **Seller Flow**

1. Seller uploads encrypted file to Storacha → gets `dataCid`
2. Seller generates envelope JSON (metadata)
3. Seller uploads envelope.json → gets `envelopeCid`
4. Seller computes:

   ```
   envelopeHash = keccak256(canonicalEnvelopeJson)
   ```

5. Seller calls:

   ```
   createListing(dataCid, envelopeCid, envelopeHash, price)
   ```

6. Listing is now live.

---

# **🔄 Buyer Purchase Flow**

1. Buyer approves USDC

2. Buyer calls:

   ```
   purchaseAccess(listingId)
   ```

3. Contract:
   - Transfers USDC
   - Records purchase permanently
   - Emits `PurchaseCompleted`

4. Backend picks up the event → begins access provisioning.

---

# **🔑 UCAN Key Delivery Flow (Off-chain, secure)**

After verifying an on-chain purchase:

### Backend steps:

1. Watch `PurchaseCompleted(listingId, buyer, …)`
2. Fetch envelope JSON from `envelopeCid`
3. Validate:

   ```
   keccak256(envelopeJson) == envelopeHash
   ```

4. Require buyer to provide **RSA public key**
5. Notify seller: “Buyer X purchased dataset”
6. Seller encrypts AES key:

   ```
   ciphertext_K_for_buyer = Encrypt(buyerPubKey, AES_key)
   ```

7. Seller uploads ciphertext to Storacha → receives `keyCid`
8. Seller submits `keyCid` to backend
9. Backend authorizes buyer via UCAN token:
   - scope to `dataCid`
   - includes `keyCid` for decrypting

### Buyer retrieves file:

1. Buyer fetches ciphertext AES key (`keyCid`)
2. Decrypts with private key
3. Downloads encrypted dataset (`dataCid`)
4. Decrypts final dataset

Smart contract is **never exposed** to plaintext keys → zero custodial
liability.

---

# **🛡️ Security Guarantees**

| Vector                | Protection                                          |
| --------------------- | --------------------------------------------------- |
| Reentrancy            | Complete `nonReentrant` coverage                    |
| Token safety          | All operations via SafeERC20                        |
| Tamper-proof metadata | On-chain `envelopeHash`                             |
| Withdrawal griefing   | Per-listing `firstPurchaseTime` (no attacker reset) |
| Replay attacks        | On-chain purchase verification                      |
| Key privacy           | Backend never handles plaintext keys                |

---

# **🔮 Future Improvements**

| Feature                     | Value                      |
| --------------------------- | -------------------------- |
| Pausable contract           | Emergency kill-switch      |
| Seller update listing price | Dynamic pricing support    |
| Buyer refund arbitration    | Dispute resolution         |
| Multiple access tiers       | Sample vs full access      |
| Batch listing creation      | For large dataset catalogs |
| Optional meta-transactions  | Gasless seller actions     |

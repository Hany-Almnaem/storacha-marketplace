// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DataMarketplace
 * @notice Marketplace for encrypted dataset listings paid in USDC.
 *
 * - Payments in USDC (ERC20)
 * - Platform fee (bps)
 * - Listing stores envelopeCid (Storacha) + envelopeHash (keccak256 of canonical envelope JSON)
 * - Per-listing pending balances with withdrawal delay
 * - SafeERC20 used for all transfers; ReentrancyGuard on state-changing functions
 */
contract DataMarketplace is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /* ========== IMMUTABLES & CONSTANTS ========== */

    IERC20 public immutable USDC; // USDC token (6 decimals)
    uint256 public constant WITHDRAWAL_DELAY = 24 hours;
    uint256 public constant BPS_DENOM = 10000;

    /* ========== PLATFORM STATE ========== */

    // Platform fee in basis points (e.g., 250 = 2.5%)
    uint256 public platformFeeBps = 250;
    uint256 public constant MAX_FEE_BPS = 1000; // 10% cap

    // Accumulated platform fees (USDC base units)
    uint256 public platformBalance;

    // Auto-increment listing id
    uint256 public listingCount;

    /* ========== DATA STRUCTS ========== */

    struct Listing {
        address seller;
        string dataCid;
        string envelopeCid; // Storacha/IPFS CID for envelope JSON (non-secret)
        bytes32 envelopeHash; // keccak256 of canonical envelope JSON (tamper-evidence)
        uint256 priceUsdc; // price in USDC base units (6 decimals normally)
        bool active;
        uint256 salesCount;
    }

    struct ListingBalance {
        uint256 amount; // pending listing earnings
        uint256 firstPurchaseTime; // timestamp of first pending purchase (start withdrawal clock)
    }

    /* ========== STORAGE ========== */

    // listingId => Listing
    mapping(uint256 => Listing) public listings;

    // listingId => buyer => hasPurchased
    mapping(uint256 => mapping(address => bool)) public hasPurchased;

    // listingId => ListingBalance
    mapping(uint256 => ListingBalance) public listingBalances;

    /* ========== EVENTS ========== */

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        string dataCid,
        string envelopeCid,
        uint256 priceUsdc
    );

    event ListingDeactivated(uint256 indexed listingId, address indexed caller);

    event PurchaseCompleted(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 amountUsdc
    );

    event Withdrawal(address indexed seller, uint256 amountUsdc);

    event PlatformFeesWithdrawn(address indexed operator, uint256 amountUsdc);

    event FeeUpdated(uint256 oldBps, uint256 newBps);

    /* ========== CONSTRUCTOR ========== */

    /**
     * @param _usdc Address of the USDC token contract to use for payments.
     */
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "USDC_ZERO_ADDRESS");
        USDC = IERC20(_usdc);
    }

    /* ========== LISTING MANAGEMENT ========== */

    /**
     * @notice Create a new listing for an encrypted dataset.
     * @param _dataCid CID or identifier of encrypted data (off-chain storage).
     * @param _envelopeCid CID of envelope JSON stored on Storacha/IPFS (non-secret pointer).
     * @param _envelopeHash keccak256 hash of canonical envelope JSON (tamper-evidence).
     * @param _priceUsdc Price in USDC base units (6 decimals for USDC).
     * @return listingId newly created listing id
     */
    function createListing(
        string calldata _dataCid,
        string calldata _envelopeCid,
        bytes32 _envelopeHash,
        uint256 _priceUsdc
    ) external returns (uint256) {
        require(bytes(_dataCid).length > 0, "EMPTY_CID");
        require(bytes(_dataCid).length <= 100, "CID_TOO_LONG");

        // envelopeCid may be empty string in some flows, envelopeHash may be 0x0
        require(_priceUsdc >= 1e6, "PRICE_TOO_SMALL"); // minimum 1 USDC to avoid dust

        listingCount += 1;
        uint256 id = listingCount;

        listings[id] = Listing({
            seller: msg.sender,
            dataCid: _dataCid,
            envelopeCid: _envelopeCid,
            envelopeHash: _envelopeHash,
            priceUsdc: _priceUsdc,
            active: true,
            salesCount: 0
        });

        emit ListingCreated(id, msg.sender, _dataCid, _envelopeCid, _priceUsdc);
        return id;
    }

    /**
     * @notice Deactivate an existing listing (seller or owner).
     * @param _listingId id of listing to deactivate
     */
    function deactivateListing(uint256 _listingId) external {
        Listing storage l = listings[_listingId];
        require(l.seller != address(0), "LISTING_NOT_FOUND");
        require(msg.sender == l.seller || msg.sender == owner(), "NOT_AUTHORIZED");

        if (l.active) {
            l.active = false;
            emit ListingDeactivated(_listingId, msg.sender);
        }
    }

    /* ========== PURCHASE FLOW ========== */

    /**
     * @notice Purchase access to a listing. Buyer must approve USDC for this contract.
     * @param _listingId id of listing to purchase
     */
    function purchaseAccess(uint256 _listingId) external nonReentrant {
        Listing storage l = listings[_listingId];
        require(l.seller != address(0), "LISTING_NOT_FOUND");
        require(l.active, "LISTING_INACTIVE");
        require(l.seller != msg.sender, "CANNOT_BUY_OWN_LISTING");
        require(!hasPurchased[_listingId][msg.sender], "ALREADY_PURCHASED");

        uint256 price = l.priceUsdc;
        require(price > 0, "INVALID_PRICE");

        // Calculate platform fee and seller amount
        uint256 fee = (price * platformFeeBps) / BPS_DENOM;
        uint256 sellerAmount = price - fee;

        // Transfer full price from buyer to this contract
        USDC.safeTransferFrom(msg.sender, address(this), price);

        // Update balances: platform and per-listing
        platformBalance += fee;

        ListingBalance storage lb = listingBalances[_listingId];
        if (lb.amount == 0) {
            // first pending sale for this listing starts the withdrawal clock
            lb.firstPurchaseTime = block.timestamp;
        }
        lb.amount += sellerAmount;

        hasPurchased[_listingId][msg.sender] = true;
        l.salesCount += 1;

        emit PurchaseCompleted(_listingId, msg.sender, l.seller, price);
    }

    /* ========== WITHDRAWALS ========== */

    /**
     * @notice Withdraw accumulated listing earnings for a specific listing.
     * @param _listingId listing to withdraw earnings for (only listing seller)
     */
    function withdrawEarnings(uint256 _listingId) external nonReentrant {
        Listing storage l = listings[_listingId];
        require(l.seller != address(0), "LISTING_NOT_FOUND");
        require(l.seller == msg.sender, "NOT_SELLER");

        ListingBalance storage lb = listingBalances[_listingId];
        uint256 amount = lb.amount;
        require(amount > 0, "NO_BALANCE");
        require(
            block.timestamp >= lb.firstPurchaseTime + WITHDRAWAL_DELAY,
            "WITHDRAWAL_DELAY_NOT_MET"
        );

        // effects
        lb.amount = 0;
        lb.firstPurchaseTime = 0;

        // interactions
        USDC.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Batch withdraw across multiple listings owned by the caller.
     * @param _listingIds array of listing ids to withdraw for
     */
    function withdrawMultiple(uint256[] calldata _listingIds) external nonReentrant {
        uint256 total = 0;
        for (uint256 i = 0; i < _listingIds.length; ++i) {
            uint256 id = _listingIds[i];
            Listing storage l = listings[id];
            require(l.seller != address(0), "LISTING_NOT_FOUND");
            require(l.seller == msg.sender, "NOT_SELLER");

            ListingBalance storage lb = listingBalances[id];
            if (lb.amount == 0) {
                continue;
            }
            if (block.timestamp >= lb.firstPurchaseTime + WITHDRAWAL_DELAY) {
                total += lb.amount;
                lb.amount = 0;
                lb.firstPurchaseTime = 0;
            }
        }
        require(total > 0, "NO_ELIGIBLE_BALANCE");
        USDC.safeTransfer(msg.sender, total);
        emit Withdrawal(msg.sender, total);
    }

    /* ========== PLATFORM ADMIN ========== */

    /**
     * @notice Withdraw platform accumulated fees to the owner.
     */
    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 bal = platformBalance;
        require(bal > 0, "NO_PLATFORM_FEES");
        platformBalance = 0;
        USDC.safeTransfer(owner(), bal);
        emit PlatformFeesWithdrawn(msg.sender, bal);
    }

    /**
     * @notice Set platform fee (bps). Only owner. Capped by MAX_FEE_BPS.
     * @param _newFeeBps new fee in basis points
     */
    function setFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        uint256 old = platformFeeBps;
        platformFeeBps = _newFeeBps;
        emit FeeUpdated(old, _newFeeBps);
    }

    /* ========== VIEW HELPERS ========== */

    function getListing(
        uint256 _listingId
    )
        external
        view
        returns (
            address seller,
            string memory dataCid,
            string memory envelopeCid,
            bytes32 envelopeHash,
            uint256 priceUsdc,
            bool active,
            uint256 salesCount
        )
    {
        Listing storage l = listings[_listingId];
        return (
            l.seller,
            l.dataCid,
            l.envelopeCid,
            l.envelopeHash,
            l.priceUsdc,
            l.active,
            l.salesCount
        );
    }

    function hasBuyerPurchased(uint256 _listingId, address _buyer) external view returns (bool) {
        return hasPurchased[_listingId][_buyer];
    }

    function getListingBalance(
        uint256 _listingId
    ) external view returns (uint256 amount, uint256 firstPurchaseTime) {
        ListingBalance storage lb = listingBalances[_listingId];
        return (lb.amount, lb.firstPurchaseTime);
    }

    function getWithdrawableTime(uint256 _listingId) external view returns (uint256) {
        return listingBalances[_listingId].firstPurchaseTime + WITHDRAWAL_DELAY;
    }

    function getPlatformBalance() external view returns (uint256) {
        return platformBalance;
    }
}

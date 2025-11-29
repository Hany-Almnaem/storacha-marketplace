// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DataMarketplace
 * @notice Marketplace for encrypted dataset listings paid in USDC.
 * - Payments handled in an ERC20 USDC token (passed at construction).
 * - Platform fee in basis points (default 250 = 2.5%).
 * - Sellers must wait 24 hours after the last purchase before withdrawing earnings.
 * - SafeERC20 used for all token transfers. ReentrancyGuard used on state-changing functions.
 */
contract DataMarketplace is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /* ========== IMMUTABLES & CONSTANTS ========== */

    IERC20 public immutable usdc;               // USDC token (6 decimals in production/testnet)
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
        string dataCID;
        uint256 priceUsdc; // price in USDC base units (6 decimals normally)
        bool active;
        uint256 salesCount;
    }

    struct SellerBalance {
        uint256 amount;           // pending seller earnings
        uint256 lastPurchaseTime; // timestamp of last purchase (used to enforce withdrawal delay)
    }

    /* ========== STORAGE ========== */

    // listingId => Listing
    mapping(uint256 => Listing) public listings;

    // listingId => buyer => hasPurchased
    mapping(uint256 => mapping(address => bool)) public hasPurchased;

    // seller => SellerBalance
    mapping(address => SellerBalance) public sellerBalances;

    /* ========== EVENTS ========== */

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        string dataCID,
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
        usdc = IERC20(_usdc);
    }

    /* ========== LISTING MANAGEMENT ========== */

    /**
     * @notice Create a new listing for an encrypted dataset.
     * @param _dataCID CID or identifier of encrypted data (off-chain storage).
     * @param _priceUsdc Price in USDC base units (6 decimals for USDC).
     * @return listingId newly created listing id
     */
    function createListing(string calldata _dataCID, uint256 _priceUsdc) external returns (uint256) {
        require(bytes(_dataCID).length > 0, "EMPTY_CID");
        require(_priceUsdc >= 1e6, "PRICE_TOO_SMALL"); // minimum 1 USDC to avoid dust

        listingCount += 1;
        uint256 id = listingCount;

        listings[id] = Listing({
            seller: msg.sender,
            dataCID: _dataCID,
            priceUsdc: _priceUsdc,
            active: true,
            salesCount: 0
        });

        emit ListingCreated(id, msg.sender, _dataCID, _priceUsdc);
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
        usdc.safeTransferFrom(msg.sender, address(this), price);

        // Update balances
        platformBalance += fee;
        sellerBalances[l.seller].amount += sellerAmount;
        sellerBalances[l.seller].lastPurchaseTime = block.timestamp;

        hasPurchased[_listingId][msg.sender] = true;
        l.salesCount += 1;

        emit PurchaseCompleted(_listingId, msg.sender, l.seller, price);
    }

    /* ========== WITHDRAWALS ========== */

    /**
     * @notice Withdraw accumulated seller earnings. Enforces 24-hour delay since last purchase.
     */
    function withdrawEarnings() external nonReentrant {
        SellerBalance storage sb = sellerBalances[msg.sender];
        uint256 amount = sb.amount;
        require(amount > 0, "NO_BALANCE");
        require(block.timestamp >= sb.lastPurchaseTime + WITHDRAWAL_DELAY, "WITHDRAWAL_DELAY_NOT_MET");

        // effects
        sb.amount = 0;

        // interactions
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }

    /* ========== PLATFORM ADMIN ========== */

    /**
     * @notice Withdraw platform accumulated fees to the owner.
     */
    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 bal = platformBalance;
        require(bal > 0, "NO_PLATFORM_FEES");
        platformBalance = 0;
        usdc.safeTransfer(owner(), bal);
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

    function getListing(uint256 _listingId)
        external
        view
        returns (
            address seller,
            string memory dataCID,
            uint256 priceUsdc,
            bool active,
            uint256 salesCount
        )
    {
        Listing storage l = listings[_listingId];
        return (l.seller, l.dataCID, l.priceUsdc, l.active, l.salesCount);
    }

    function hasBuyerPurchased(uint256 _listingId, address _buyer) external view returns (bool) {
        return hasPurchased[_listingId][_buyer];
    }

    function getSellerBalance(address _seller) external view returns (uint256 amount, uint256 lastPurchaseTime) {
        SellerBalance storage sb = sellerBalances[_seller];
        return (sb.amount, sb.lastPurchaseTime);
    }

    function getWithdrawableTime(address _seller) external view returns (uint256) {
        return sellerBalances[_seller].lastPurchaseTime + WITHDRAWAL_DELAY;
    }

    function getPlatformBalance() external view returns (uint256) {
        return platformBalance;
    }
}

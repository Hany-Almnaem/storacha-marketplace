// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { DataMarketplace } from "../src/DataMarketplace.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DataMarketplaceTest is Test {
    DataMarketplace public marketplace;
    MockUSDC public usdc;

    address public seller;
    address public buyer;
    address public anotherBuyer;
    address public attacker;

    // Re-declare events from DataMarketplace so vm.expectEmit + emit works
    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        string dataCid,
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

    function setUp() public {
        // create accounts
        seller = vm.addr(1);
        buyer = vm.addr(2);
        anotherBuyer = vm.addr(3);
        attacker = vm.addr(4);

        // deploy mock usdc and marketplace, test contract is owner
        usdc = new MockUSDC("Mock USDC", "mUSDC");
        marketplace = new DataMarketplace(address(usdc));

        // sanity
        assertEq(marketplace.owner(), address(this));
    }

    /* ========== Helpers ========== */

    function mintAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        IERC20(address(usdc)).approve(address(marketplace), amount);
        vm.stopPrank();
    }

    function mintOnly(address who, uint256 amount) internal {
        usdc.mint(who, amount);
    }

    /* ========== CREATE LISTING ========== */

    function testCreateListingSuccess() public {
        vm.startPrank(seller);
        string memory cid = "ipfs://QmExample";
        uint256 price = 2e6; // 2 USDC (6 decimals)
        vm.expectEmit(true, true, false, true);
        emit ListingCreated(1, seller, cid, price);
        uint256 id = marketplace.createListing(cid, price);
        vm.stopPrank();

        assertEq(id, 1);
        (address s, string memory storedCid, uint256 p, bool active, uint256 sales) = marketplace
            .getListing(id);
        assertEq(s, seller);
        assertEq(storedCid, cid);
        assertEq(p, price);
        assertTrue(active);
        assertEq(sales, 0);
    }

    function testCreateListingFailsEmptyCID() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("EMPTY_CID"));
        marketplace.createListing("", 1e6);
        vm.stopPrank();
    }

    function testCreateListingFailsPriceTooSmall() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("PRICE_TOO_SMALL"));
        marketplace.createListing("cid", 1); // less than 1 USDC
        vm.stopPrank();
    }

    /* ========== DEACTIVATE LISTING ========== */

    function testDeactivateListingBySellerAndOwner() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("cid", 1e6);
        vm.stopPrank();

        // seller deactivates
        vm.startPrank(seller);
        vm.expectEmit(true, true, false, false);
        emit ListingDeactivated(id, seller);
        marketplace.deactivateListing(id);
        vm.stopPrank();

        (, , , bool activeAfterSeller, ) = marketplace.getListing(id);
        assertFalse(activeAfterSeller);

        // recreate listing to test owner deactivate
        vm.startPrank(seller);
        uint256 id2 = marketplace.createListing("cid2", 1e6);
        vm.stopPrank();

        vm.expectEmit(true, true, false, false);
        emit ListingDeactivated(id2, address(this));
        marketplace.deactivateListing(id2);
        (, , , bool activeAfterOwner, ) = marketplace.getListing(id2);
        assertFalse(activeAfterOwner);
    }

    function testDeactivateListingUnauthorizedRevert() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("cid3", 1e6);
        vm.stopPrank();

        vm.startPrank(attacker);
        vm.expectRevert(bytes("NOT_AUTHORIZED"));
        marketplace.deactivateListing(id);
        vm.stopPrank();
    }

    function testDeactivateAlreadyInactiveNoEmit() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("once", 1e6);
        marketplace.deactivateListing(id); // first deactivate emits
        // second deactivate should silently return (active==false branch)
        // We don't set expectEmit because nothing should be emitted.
        marketplace.deactivateListing(id);
        vm.stopPrank();

        (, , , bool activeNow, ) = marketplace.getListing(id);
        assertFalse(activeNow);
    }

    /* ========== PURCHASE FLOW ========== */

    function testPurchaseAccessSuccess() public {
        // create listing
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("sample", 5e6); // 5 USDC
        vm.stopPrank();

        // fund buyer and approve
        mintAndApprove(buyer, 10e6);

        vm.startPrank(buyer);
        vm.expectEmit(true, true, true, true);
        emit PurchaseCompleted(id, buyer, seller, 5e6);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // check seller balance and platform balance
        (uint256 sellerAmt, uint256 lastT) = marketplace.getSellerBalance(seller);
        uint256 fee = (5e6 * marketplace.platformFeeBps()) / 10000;
        uint256 expectedSeller = 5e6 - fee;

        assertEq(sellerAmt, expectedSeller);
        assertEq(marketplace.getPlatformBalance(), fee);
        assertTrue(marketplace.hasBuyerPurchased(id, buyer));
        (, , , , uint256 sales) = marketplace.getListing(id);
        assertEq(sales, 1);
        assertEq(lastT, block.timestamp);
    }

    function testCannotBuyOwnListing() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("self", 2e6);
        vm.stopPrank();

        // mint & approve seller (trying to buy own)
        mintAndApprove(seller, 5e6);
        vm.startPrank(seller);
        vm.expectRevert(bytes("CANNOT_BUY_OWN_LISTING"));
        marketplace.purchaseAccess(id);
        vm.stopPrank();
    }

    function testCannotDoublePurchase() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("dup", 2e6);
        vm.stopPrank();

        mintAndApprove(buyer, 5e6);

        // first purchase
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // second should revert
        vm.startPrank(buyer);
        vm.expectRevert(bytes("ALREADY_PURCHASED"));
        marketplace.purchaseAccess(id);
        vm.stopPrank();
    }

    function testPurchaseInactiveListingReverts() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("inactive", 3e6);
        marketplace.deactivateListing(id);
        vm.stopPrank();

        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        vm.expectRevert(bytes("LISTING_INACTIVE"));
        marketplace.purchaseAccess(id);
        vm.stopPrank();
    }

    function testPurchaseRevertsIfNotApproved() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("noapprove", 3e6);
        vm.stopPrank();

        // mint buyer but DO NOT approve
        mintOnly(buyer, 10e6);
        vm.startPrank(buyer);
        vm.expectRevert(); // transferFrom should revert due to no allowance
        marketplace.purchaseAccess(id);
        vm.stopPrank();
    }

    function testPurchaseRevertsIfInsufficientBalance() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("lowbal", 5e6);
        vm.stopPrank();

        // approve but no balance
        vm.startPrank(buyer);
        IERC20(address(usdc)).approve(address(marketplace), 5e6);
        vm.expectRevert(); // transferFrom should revert due to insufficient balance
        marketplace.purchaseAccess(id);
        vm.stopPrank();
    }

    /* ========== WITHDRAWALS ========== */

    function testWithdrawEarningsDelayAndSuccess() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("withdraw", 4e6);
        vm.stopPrank();

        // buyer purchases
        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // withdraw immediately should revert
        vm.startPrank(seller);
        vm.expectRevert(bytes("WITHDRAWAL_DELAY_NOT_MET"));
        marketplace.withdrawEarnings();
        vm.stopPrank();

        // warp 24 hours + 1
        vm.warp(block.timestamp + 24 hours + 1);

        // record seller usdc before
        uint256 beforeBalance = usdc.balanceOf(seller);

        (uint256 pending, ) = marketplace.getSellerBalance(seller);
        vm.startPrank(seller);
        vm.expectEmit(true, true, false, true);
        emit Withdrawal(seller, pending);
        marketplace.withdrawEarnings();
        vm.stopPrank();

        uint256 sellerAfter = usdc.balanceOf(seller);
        (uint256 remaining, ) = marketplace.getSellerBalance(seller);
        assertEq(remaining, 0);
        assertEq(sellerAfter, beforeBalance + pending);
    }

    function testWithdrawEarningsRevertsNoBalance() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("NO_BALANCE"));
        marketplace.withdrawEarnings();
        vm.stopPrank();
    }

    function testWithdrawPlatformFeesOnlyOwner() public {
        // seller creates and buyer purchases to create platform fees
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("pf", 10e6);
        vm.stopPrank();

        mintAndApprove(buyer, 20e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        uint256 platformBal = marketplace.getPlatformBalance();
        assertGt(platformBal, 0);

        // attacker cannot withdraw
        vm.startPrank(attacker);
        vm.expectRevert(); // onlyOwner
        marketplace.withdrawPlatformFees();
        vm.stopPrank();

        // owner withdraws to address(this)
        uint256 before = usdc.balanceOf(address(this));
        marketplace.withdrawPlatformFees();
        uint256 ownerAfter = usdc.balanceOf(address(this));
        assertEq(marketplace.getPlatformBalance(), 0);
        assertEq(ownerAfter, before + platformBal);
    }

    function testWithdrawPlatformFeesRevertsWhenZero() public {
        // ensure platformBalance is zero at start
        // deploy fresh marketplace in this test context not required since setUp ensures zero initially
        assertEq(marketplace.getPlatformBalance(), 0);
        vm.expectRevert(bytes("NO_PLATFORM_FEES"));
        marketplace.withdrawPlatformFees();
    }

    /* ========== FEE CONFIG ========== */

    function testSetFeeSuccessAndMaxEnforced() public {
        uint256 old = marketplace.platformFeeBps();
        vm.expectEmit(true, false, false, true);
        emit FeeUpdated(old, 500);
        marketplace.setFee(500);
        assertEq(marketplace.platformFeeBps(), 500);

        uint256 tooHigh = marketplace.MAX_FEE_BPS() + 1;

        vm.expectRevert(bytes("FEE_TOO_HIGH"));
        marketplace.setFee(tooHigh);
    }

    function testSetFeeAtMaxSucceeds() public {
        uint256 maxBps = marketplace.MAX_FEE_BPS();
        marketplace.setFee(maxBps);
        assertEq(marketplace.platformFeeBps(), maxBps);
    }

    /* ========== FEE ROUNdING & MULTI PURCHASES ========== */

    function testFeeRoundingSumsToPrice() public {
        vm.startPrank(seller);
        // choose price that causes truncation, e.g., 1_000_001 (1.000001 USDC)
        uint256 price = 1_000_001;
        uint256 id = marketplace.createListing("round", price);
        vm.stopPrank();

        // do purchase
        mintAndApprove(buyer, price);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        uint256 platform = marketplace.getPlatformBalance();
        (uint256 sellerAmt, ) = marketplace.getSellerBalance(seller);
        assertEq(platform + sellerAmt, price);
    }

    function testMultiplePurchasesAccumulateAndUpdateLastPurchaseTime() public {
        vm.startPrank(seller);
        uint256 id1 = marketplace.createListing("a", 2e6);
        uint256 id2 = marketplace.createListing("b", 3e6);
        vm.stopPrank();

        // buyer buys listing 1
        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id1);
        vm.stopPrank();

        (, uint256 lastT1) = marketplace.getSellerBalance(seller);

        // another buyer buys listing 2
        mintAndApprove(anotherBuyer, 10e6);
        vm.startPrank(anotherBuyer);
        marketplace.purchaseAccess(id2);
        vm.stopPrank();

        (uint256 totalAmt, uint256 lastT2) = marketplace.getSellerBalance(seller);

        // total should be sum of seller parts of both sales
        uint256 fee1 = (2e6 * marketplace.platformFeeBps()) / 10000;
        uint256 fee2 = (3e6 * marketplace.platformFeeBps()) / 10000;
        uint256 expectedTotal = (2e6 - fee1) + (3e6 - fee2);
        assertEq(totalAmt, expectedTotal);

        // last purchase time must be >= first purchase time
        assertTrue(lastT2 >= lastT1);
    }

    /* ========== GETTERS ========== */

    function testGetters() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("getter", 6e6);
        vm.stopPrank();

        (address s, string memory c, uint256 price, bool active, uint256 sales) = marketplace
            .getListing(id);
        assertEq(s, seller);
        assertEq(c, "getter");
        assertEq(price, 6e6);
        assertTrue(active);
        assertEq(sales, 0);

        assertFalse(marketplace.hasBuyerPurchased(id, buyer));
    }
}

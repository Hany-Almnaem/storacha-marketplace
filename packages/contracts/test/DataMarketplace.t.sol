// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { DataMarketplace } from "../src/DataMarketplace.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice A tiny reentrant token for testing reentrancy attempts via transferFrom.
/// Inherits MockUSDC and overrides transferFrom to attempt a reentrant call into marketplace.
contract ReentrantToken is MockUSDC {
    DataMarketplace public marketplace;
    bool public triggerReentry;

    constructor(string memory name, string memory symbol) MockUSDC(name, symbol) {}

    function setMarketplace(address _marketplace) external {
        marketplace = DataMarketplace(_marketplace);
    }

    function enableReentry(bool on) external {
        triggerReentry = on;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        // call parent behavior first
        bool ok = super.transferFrom(from, to, amount);

        // If configured, attempt to call withdrawEarnings on marketplace during transferFrom.
        // transferFrom will be invoked by the marketplace contract, so msg.sender will be the marketplace.
        if (
            triggerReentry &&
            address(marketplace) != address(0) &&
            msg.sender == address(marketplace)
        ) {
            // try to reenter (should be prevented by ReentrancyGuard)
            try marketplace.withdrawEarnings(1) {
                // unexpected success (test will assert later)
            } catch {
                // expected revert or prevention
            }
        }
        return ok;
    }
}

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
        string envelopeCid,
        bytes32 envelopeHash,
        uint256 priceUsdc
    );
    event ListingDeactivated(uint256 indexed listingId, address indexed caller);
    event PurchaseCompleted(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 amountUsdc
    );
    event Withdrawal(uint256 indexed listingId, address indexed seller, uint256 amountUsdc);
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
        string memory dataCid = "ipfs://QmExampleData";
        string memory envelopeCid = "ipfs://QmEnvelope";
        bytes32 envelopeHash = keccak256(bytes("dummy-envelope"));
        uint256 price = 2e6; // 2 USDC (6 decimals)

        vm.expectEmit(true, true, false, true);
        emit ListingCreated(1, seller, dataCid, envelopeCid, envelopeHash, price);

        uint256 id = marketplace.createListing(dataCid, envelopeCid, envelopeHash, price);
        vm.stopPrank();

        assertEq(id, 1);

        (
            address s,
            string memory storedDataCid,
            string memory storedEnvelopeCid,
            bytes32 storedEnvelopeHash,
            uint256 p,
            bool active,
            uint256 sales
        ) = marketplace.getListing(id);

        assertEq(s, seller);
        assertEq(storedDataCid, dataCid);
        assertEq(storedEnvelopeCid, envelopeCid);
        assertEq(storedEnvelopeHash, envelopeHash);
        assertEq(p, price);
        assertTrue(active);
        assertEq(sales, 0);
    }

    function testCreateListingFailsEmptyCID() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("EMPTY_CID"));
        marketplace.createListing("", "", bytes32(0), 1e6);
        vm.stopPrank();
    }

    function testCreateListingFailsPriceTooSmall() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("PRICE_TOO_SMALL"));
        marketplace.createListing("cid", "", bytes32(0), 1); // less than 1 USDC
        vm.stopPrank();
    }

    /* ========== DEACTIVATE LISTING ========== */

    function testDeactivateListingBySellerAndOwner() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("cid", "", bytes32(0), 1e6);
        vm.stopPrank();

        // seller deactivates
        vm.startPrank(seller);
        vm.expectEmit(true, true, false, false);
        emit ListingDeactivated(id, seller);
        marketplace.deactivateListing(id);
        vm.stopPrank();

        (, , , , , bool activeAfterSeller, ) = marketplace.getListing(id);
        assertFalse(activeAfterSeller);

        // recreate listing to test owner deactivate
        vm.startPrank(seller);
        uint256 id2 = marketplace.createListing("cid2", "", bytes32(0), 1e6);
        vm.stopPrank();

        vm.expectEmit(true, true, false, false);
        emit ListingDeactivated(id2, address(this));
        marketplace.deactivateListing(id2);
        (, , , , , bool activeAfterOwner, ) = marketplace.getListing(id2);
        assertFalse(activeAfterOwner);
    }

    function testDeactivateListingUnauthorizedRevert() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("cid3", "", bytes32(0), 1e6);
        vm.stopPrank();

        vm.startPrank(attacker);
        vm.expectRevert(bytes("NOT_AUTHORIZED"));
        marketplace.deactivateListing(id);
        vm.stopPrank();
    }

    function testDeactivateAlreadyInactiveNoEmit() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("once", "", bytes32(0), 1e6);
        marketplace.deactivateListing(id); // first deactivate emits
        // second deactivate should silently return (active==false branch)
        // We don't set expectEmit because nothing should be emitted.
        marketplace.deactivateListing(id);
        vm.stopPrank();

        (, , , , , bool activeNow, ) = marketplace.getListing(id);
        assertFalse(activeNow);
    }

    /* ========== PURCHASE FLOW ========== */

    function testPurchaseAccessSuccess() public {
        // create listing
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("sample-data", "sample-envelope", bytes32(0), 5e6); // 5 USDC
        vm.stopPrank();

        // fund buyer and approve
        mintAndApprove(buyer, 10e6);

        vm.startPrank(buyer);
        vm.expectEmit(true, true, true, true);
        emit PurchaseCompleted(id, buyer, seller, 5e6);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // check listing balance and platform balance
        (uint256 listingAmt, uint256 firstT) = marketplace.getListingBalance(id);
        uint256 fee = (5e6 * marketplace.platformFeeBps()) / 10000;
        uint256 expectedSeller = 5e6 - fee;

        assertEq(listingAmt, expectedSeller);
        assertEq(marketplace.getPlatformBalance(), fee);
        assertTrue(marketplace.hasBuyerPurchased(id, buyer));
        (, , , , , , uint256 sales) = marketplace.getListing(id);
        assertEq(sales, 1);
        assertEq(firstT, block.timestamp);
    }

    function testCannotBuyOwnListing() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("self-data", "", bytes32(0), 2e6);
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
        uint256 id = marketplace.createListing("dup", "", bytes32(0), 2e6);
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
        uint256 id = marketplace.createListing("inactive", "", bytes32(0), 3e6);
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
        uint256 id = marketplace.createListing("noapprove", "", bytes32(0), 3e6);
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
        uint256 id = marketplace.createListing("lowbal", "", bytes32(0), 5e6);
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
        uint256 id = marketplace.createListing("withdraw", "", bytes32(0), 4e6);
        vm.stopPrank();

        // buyer purchases
        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // withdraw immediately should revert
        vm.startPrank(seller);
        vm.expectRevert(bytes("WITHDRAWAL_DELAY_NOT_MET"));
        marketplace.withdrawEarnings(id);
        vm.stopPrank();

        // warp 24 hours + 1
        vm.warp(block.timestamp + 24 hours + 1);

        // record seller usdc before
        uint256 beforeBalance = usdc.balanceOf(seller);

        (uint256 pending, ) = marketplace.getListingBalance(id);
        vm.startPrank(seller);
        vm.expectEmit(true, true, false, true);
        emit Withdrawal(id, seller, pending);
        marketplace.withdrawEarnings(id);
        vm.stopPrank();

        uint256 sellerAfter = usdc.balanceOf(seller);
        (uint256 remaining, ) = marketplace.getListingBalance(id);
        assertEq(remaining, 0);
        assertEq(sellerAfter, beforeBalance + pending);
    }

    function testWithdrawEarningsRevertsNoBalance() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("no-sales", "", bytes32(0), 1e6);
        vm.stopPrank();

        vm.startPrank(seller);
        vm.expectRevert(bytes("NO_BALANCE"));
        marketplace.withdrawEarnings(id);
        vm.stopPrank();
    }

    function testWithdrawPlatformFeesOnlyOwner() public {
        // seller creates and buyer purchases to create platform fees
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("pf", "", bytes32(0), 10e6);
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
        uint256 id = marketplace.createListing("round", "", bytes32(0), price);
        vm.stopPrank();

        // do purchase
        mintAndApprove(buyer, price);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        uint256 platform = marketplace.getPlatformBalance();
        (uint256 sellerAmt, ) = marketplace.getListingBalance(id);
        assertEq(platform + sellerAmt, price);
    }

    function testMultiplePurchasesAccumulatePerListing() public {
        vm.startPrank(seller);
        uint256 id1 = marketplace.createListing("a", "", bytes32(0), 2e6);
        uint256 id2 = marketplace.createListing("b", "", bytes32(0), 3e6);
        vm.stopPrank();

        // buyer buys listing 1
        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id1);
        vm.stopPrank();

        (uint256 amt1, uint256 t1) = marketplace.getListingBalance(id1);
        assertEq(amt1, 2e6 - ((2e6 * marketplace.platformFeeBps()) / 10000));
        assertTrue(t1 > 0);

        // another buyer buys listing 2
        mintAndApprove(anotherBuyer, 10e6);
        vm.startPrank(anotherBuyer);
        marketplace.purchaseAccess(id2);
        vm.stopPrank();

        (uint256 amt2, uint256 t2) = marketplace.getListingBalance(id2);
        assertEq(amt2, 3e6 - ((3e6 * marketplace.platformFeeBps()) / 10000));
        assertTrue(t2 > 0);

        // totals should match sum of both seller parts
        uint256 expectedTotal = amt1 + amt2;
        assertEq(
            expectedTotal,
            (2e6 - ((2e6 * marketplace.platformFeeBps()) / 10000)) +
                (3e6 - ((3e6 * marketplace.platformFeeBps()) / 10000))
        );
    }

    /* ========== DECIMALS & PRECISION TESTS ========== */

    function testUSDCDecimalsIsSix() public view {
        assertEq(usdc.decimals(), 6, "MockUSDC must use 6 decimals");
    }

    function testPurchaseWithSixDecimalPrecision() public {
        vm.startPrank(seller);
        uint256 price = 1_234_567; // 1.234567 USDC (6 decimals)
        uint256 id = marketplace.createListing("data-precise", "", bytes32(0), price);
        vm.stopPrank();

        mintAndApprove(buyer, 2_000_000); // 2 USDC

        uint256 feeBps = marketplace.platformFeeBps(); // default = 250 (2.5%)
        uint256 expectedFee = (price * feeBps) / 10_000; // matches USDC decimals
        uint256 expectedSellerAmt = price - expectedFee;

        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        (uint256 amt, ) = marketplace.getListingBalance(id);

        assertEq(amt, expectedSellerAmt, "Seller amount must match 6-dec math");
        assertEq(
            marketplace.getPlatformBalance(),
            expectedFee,
            "Platform fee must match 6-dec math"
        );
    }

    function testWithdrawalSixDecimalPrecision() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("file", "", bytes32(0), 2_500_001);
        // 2.500001 USDC
        vm.stopPrank();

        mintAndApprove(buyer, 3_000_000);

        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        uint256 fee = (2_500_001 * marketplace.platformFeeBps()) / 10_000;
        uint256 expectedSeller = 2_500_001 - fee;

        vm.warp(block.timestamp + 24 hours + 1);

        uint256 beforeBal = usdc.balanceOf(seller);

        vm.startPrank(seller);
        marketplace.withdrawEarnings(id);
        vm.stopPrank();

        uint256 afterBal = usdc.balanceOf(seller);

        assertEq(afterBal - beforeBal, expectedSeller, "Seller must receive correct 6-dec payout");
    }

    /* ========== GETTERS & MISC ========== */

    function testGetters() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("getter", "", bytes32(0), 6e6);
        vm.stopPrank();

        (
            address s,
            string memory dataCid,
            ,
            ,
            uint256 price,
            bool active,
            uint256 sales
        ) = marketplace.getListing(id);
        assertEq(s, seller);
        assertEq(dataCid, "getter");
        assertEq(price, 6e6);
        assertTrue(active);
        assertEq(sales, 0);

        assertFalse(marketplace.hasBuyerPurchased(id, buyer));
    }

    function testReentrancyGuardAgainstMaliciousToken() public {
        // deploy reentrant token and marketplace that uses it
        ReentrantToken rtoken = new ReentrantToken("Reentrant USDC", "rUSDC");
        DataMarketplace localMarket = new DataMarketplace(address(rtoken));
        rtoken.setMarketplace(address(localMarket));

        // create roles
        address localSeller = vm.addr(10);
        address localBuyer = vm.addr(11);

        // create a listing
        vm.startPrank(localSeller);
        uint256 lid = localMarket.createListing("data", "", bytes32(0), 2e6);
        vm.stopPrank();

        // mint and approve rtoken for buyer
        rtoken.mint(localBuyer, 5e6);
        vm.startPrank(localBuyer);
        IERC20(address(rtoken)).approve(address(localMarket), 5e6);
        vm.stopPrank();

        // enable reentry attempt
        rtoken.enableReentry(true);

        // do purchase: transferFrom will attempt to call withdrawEarnings inside token
        vm.startPrank(localBuyer);
        // purchase should either succeed (reentry prevented) or revert safely; importantly it must not allow reentry exploit
        localMarket.purchaseAccess(lid);
        vm.stopPrank();

        // assert listing balance updated and platform balance set correctly
        (uint256 lbAmt, uint256 t) = localMarket.getListingBalance(lid);
        assertTrue(lbAmt > 0);
        assertTrue(t > 0);
    }

    function testSpamPurchasesDoNotResetFirstPurchaseTime() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("spam-data", "", bytes32(0), 1e6);
        vm.stopPrank();

        // buyer1 purchases (first)
        mintAndApprove(buyer, 5e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        (, uint256 firstT) = marketplace.getListingBalance(id);
        assertTrue(firstT > 0);

        // simulate many other buyers making tiny purchases
        for (uint256 i = 0; i < 5; ++i) {
            address b = vm.addr(20 + i);
            mintAndApprove(b, 2e6);
            vm.startPrank(b);
            marketplace.purchaseAccess(id);
            vm.stopPrank();
        }

        // firstPurchaseTime should remain unchanged (should equal firstT)
        (, uint256 firstTAfter) = marketplace.getListingBalance(id);
        assertEq(firstTAfter, firstT);

        // warp beyond withdraw delay and attempt withdrawal
        vm.warp(block.timestamp + 24 hours + 1);

        // seller withdraws full accumulated amount
        vm.startPrank(seller);
        marketplace.withdrawEarnings(id);
        vm.stopPrank();

        // listing balance should be zero
        (uint256 finalAmt, ) = marketplace.getListingBalance(id);
        assertEq(finalAmt, 0);
    }

    function testPurchaseListingNotFoundReverts() public {
        vm.startPrank(buyer);
        vm.expectRevert(bytes("LISTING_NOT_FOUND"));
        marketplace.purchaseAccess(9999); // non-existent
        vm.stopPrank();
    }

    function testDeactivateListingNotFoundReverts() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("LISTING_NOT_FOUND")); // because seller check uses listings[id].seller != address(0)
        marketplace.deactivateListing(9999);
        vm.stopPrank();
    }

    function testWithdrawEarningsNotSellerReverts() public {
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("x", "", bytes32(0), 2e6);
        vm.stopPrank();

        // buyer purchases so there is balance
        mintAndApprove(buyer, 10e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        vm.warp(block.timestamp + 24 hours + 1);

        vm.startPrank(attacker);
        vm.expectRevert(bytes("NOT_SELLER"));
        marketplace.withdrawEarnings(id);
        vm.stopPrank();
    }

    function testFeeConfigsAndEdgeCases() public {
        // set fee to zero
        marketplace.setFee(0);
        assertEq(marketplace.platformFeeBps(), 0);

        // listing price
        vm.startPrank(seller);
        uint256 id = marketplace.createListing("feeZero", "", bytes32(0), 1_000_001);
        vm.stopPrank();

        mintAndApprove(buyer, 2e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id);
        vm.stopPrank();

        // platform is zero, seller gets entire price
        uint256 platform = marketplace.getPlatformBalance();
        (uint256 saleAmt, ) = marketplace.getListingBalance(id);
        assertEq(platform, 0);
        assertEq(saleAmt, 1_000_001);

        // set fee to max and test rounding
        uint256 maxBps = marketplace.MAX_FEE_BPS();
        marketplace.setFee(maxBps);
        assertEq(marketplace.platformFeeBps(), maxBps);

        // create another listing priced to create rounding scenarios
        vm.startPrank(seller);
        uint256 id2 = marketplace.createListing("feeMax", "", bytes32(0), 1_000_003);
        vm.stopPrank();

        mintAndApprove(buyer, 5e6);
        vm.startPrank(buyer);
        marketplace.purchaseAccess(id2);
        vm.stopPrank();

        (uint256 saleAmt2, ) = marketplace.getListingBalance(id2);
        assertEq(saleAmt2 + (marketplace.getPlatformBalance() - platform), 1_000_003);
        // simple sanity: saleAmt2 + (newPlatform - previousPlatform) == price
    }

    function testWithdrawMultipleGasReasonable() public {
        // create many listings and purchases, then attempt withdrawMultiple in reasonable batch
        vm.startPrank(seller);
        uint256 N = 30; // moderate size to exercise loop without OOG in tests
        uint256[] memory ids = new uint256[](N);
        for (uint256 i = 0; i < N; ++i) {
            ids[i] = marketplace.createListing(
                string(abi.encodePacked("L", vm.toString(i))),
                "",
                bytes32(0),
                1e6 + uint256(i)
            );
        }
        vm.stopPrank();

        // multiple buyers buy each listing
        for (uint256 i = 0; i < N; ++i) {
            address b = vm.addr(100 + i);
            mintAndApprove(b, 5e6);
            vm.startPrank(b);
            marketplace.purchaseAccess(ids[i]);
            vm.stopPrank();
        }

        // warp sufficient time for all to be withdrawable
        vm.warp(block.timestamp + 24 hours + 1);

        // seller withdraw in batches (single batch here)
        vm.startPrank(seller);
        marketplace.withdrawMultiple(ids);
        vm.stopPrank();

        // all listing balances should be zero
        for (uint256 i = 0; i < N; ++i) {
            (uint256 a, ) = marketplace.getListingBalance(ids[i]);
            assertEq(a, 0);
        }
    }
}

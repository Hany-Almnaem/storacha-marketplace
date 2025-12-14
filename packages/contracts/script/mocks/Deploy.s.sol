// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import { MockUSDC } from "../../src/mocks/MockUSDC.sol";
import { DataMarketplace } from "../../src/DataMarketplace.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC mock = new MockUSDC("Mock USDC", "mUSDC");

        console.log("Mock USDC deployed at:", address(mock));

        vm.stopBroadcast();
    }
}

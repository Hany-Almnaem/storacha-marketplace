// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DataMarketplace} from "../src/DataMarketplace.sol";

contract Deploy is Script {
    // Default Base Sepolia USDC
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {

        vm.startBroadcast();

        DataMarketplace marketplace = new DataMarketplace(USDC_BASE_SEPOLIA);

        console.log("DataMarketplace deployed at:", address(marketplace));
        console.log("Using USDC:", USDC_BASE_SEPOLIA);

        vm.stopBroadcast();
    }
}

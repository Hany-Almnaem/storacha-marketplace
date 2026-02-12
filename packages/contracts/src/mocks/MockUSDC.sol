// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice ERC20 mock used for local tests. 6 decimals to match USDC.
 */
contract MockUSDC is ERC20 {
    uint8 public constant DECIMALS = 6;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    /// @notice Mint tokens (public for tests)

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

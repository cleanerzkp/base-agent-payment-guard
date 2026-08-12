// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { BaseAgentPaymentGuard } from "../contracts/BaseAgentPaymentGuard.sol";

interface VmBroadcast {
    function startBroadcast() external;
    function stopBroadcast() external;
}

abstract contract BaseSepoliaDeployment {
    uint256 public constant REQUIRED_CHAIN_ID = 84_532;
    address public constant CANONICAL_BASE_SEPOLIA_USDC =
        0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    error DeploymentChainMismatch(uint256 actualChainId);
    error DeploymentTokenMismatch(address actualToken);

    function _requireBaseSepolia(address token) internal view {
        if (block.chainid != REQUIRED_CHAIN_ID) {
            revert DeploymentChainMismatch(block.chainid);
        }
        if (token != CANONICAL_BASE_SEPOLIA_USDC) {
            revert DeploymentTokenMismatch(token);
        }
    }

    function _deployGuard(address token) internal returns (BaseAgentPaymentGuard) {
        _requireBaseSepolia(token);
        return new BaseAgentPaymentGuard(token);
    }
}

/// @notice Deploys only to Base Sepolia and only with canonical Circle testnet USDC.
/// @dev No key enters the script. Foundry must supply an external encrypted-account or
/// hardware-wallet signer for vm.startBroadcast().
contract DeployBaseSepolia is BaseSepoliaDeployment {
    VmBroadcast private constant VM =
        VmBroadcast(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (BaseAgentPaymentGuard deployed) {
        _requireBaseSepolia(CANONICAL_BASE_SEPOLIA_USDC);

        VM.startBroadcast();
        deployed = new BaseAgentPaymentGuard(CANONICAL_BASE_SEPOLIA_USDC);
        VM.stopBroadcast();
    }
}

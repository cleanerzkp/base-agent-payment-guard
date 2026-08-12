// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { BaseAgentPaymentGuard } from "../contracts/BaseAgentPaymentGuard.sol";
import { BaseSepoliaDeployment } from "../script/DeployBaseSepolia.s.sol";

interface VmDeploy {
    function chainId(uint256 newChainId) external;
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes calldata revertData) external;
}

contract TestTokenCode {
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }
}

contract BaseSepoliaDeploymentHarness is BaseSepoliaDeployment {
    function deploy(address token) external returns (BaseAgentPaymentGuard) {
        return _deployGuard(token);
    }
}

contract DeployBaseSepoliaTest {
    VmDeploy private constant VM =
        VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    BaseSepoliaDeploymentHarness private harness;

    function setUp() public {
        harness = new BaseSepoliaDeploymentHarness();
    }

    function testRejectsNonBaseSepoliaChain() public {
        VM.chainId(8453);
        address canonicalUsdc = harness.CANONICAL_BASE_SEPOLIA_USDC();

        VM.expectRevert(
            abi.encodeWithSelector(BaseSepoliaDeployment.DeploymentChainMismatch.selector, 8453)
        );
        harness.deploy(canonicalUsdc);
    }

    function testRejectsNonCanonicalStablecoin() public {
        VM.chainId(harness.REQUIRED_CHAIN_ID());
        TestTokenCode wrongToken = new TestTokenCode();

        VM.expectRevert(
            abi.encodeWithSelector(
                BaseSepoliaDeployment.DeploymentTokenMismatch.selector, address(wrongToken)
            )
        );
        harness.deploy(address(wrongToken));
    }

    function testDeploysGuardWithCanonicalBaseSepoliaUsdc() public {
        VM.chainId(harness.REQUIRED_CHAIN_ID());
        address canonicalUsdc = harness.CANONICAL_BASE_SEPOLIA_USDC();
        VM.etch(canonicalUsdc, type(TestTokenCode).runtimeCode);

        BaseAgentPaymentGuard guard = harness.deploy(canonicalUsdc);

        _assertEq(block.chainid, 84_532, "chain");
        _assertEq(address(guard.stablecoin()), canonicalUsdc, "stablecoin");
        require(address(guard).code.length > 0, "guard code");
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(address actual, address expected, string memory reason) private pure {
        require(actual == expected, reason);
    }
}

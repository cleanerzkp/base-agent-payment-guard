// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { BaseAgentPaymentGuard } from "../contracts/BaseAgentPaymentGuard.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool topic1, bool topic2, bool topic3, bool data, address emitter) external;
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract MockERC20 {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint8 public returnMode;
    BaseAgentPaymentGuard public reentryGuard;
    address public reentryOwner;
    address public reentryMerchant;
    uint256 public reentryAmount;
    bytes32 public reentryReference;
    bool public reentrySucceeded;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function setReturnMode(uint8 mode) external {
        returnMode = mode;
    }

    function setReentry(
        BaseAgentPaymentGuard target,
        address owner,
        address merchant,
        uint256 amount,
        bytes32 externalReference
    ) external {
        reentryGuard = target;
        reentryOwner = owner;
        reentryMerchant = merchant;
        reentryAmount = amount;
        reentryReference = externalReference;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (returnMode == 1) return false;
        if (returnMode == 2) revert("mock transfer revert");
        if (returnMode == 5) {
            (reentrySucceeded,) = address(reentryGuard)
                .call(
                    abi.encodeCall(
                        BaseAgentPaymentGuard.executePayment,
                        (reentryOwner, reentryMerchant, reentryAmount, reentryReference)
                    )
                );
        }

        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        allowance[from][msg.sender] = approved - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (returnMode == 3) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        if (returnMode == 4) {
            assembly ("memory-safe") {
                mstore(0, 1)
                return(31, 1)
            }
        }
        return true;
    }
}

contract BaseAgentPaymentGuardTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant OWNER = address(0xA11CE);
    address private constant AGENT = address(0xA63E7);

    MockERC20 private token;
    BaseAgentPaymentGuard private guard;

    event PaymentExecuted(
        bytes32 indexed receiptId,
        address indexed owner,
        address indexed agent,
        address merchant,
        uint256 amount,
        bytes32 externalReference,
        uint64 day,
        uint256 spentToday,
        uint64 policyRevision
    );

    function setUp() public {
        vm.chainId(84_532);
        vm.warp(1_800_000_000);
        token = new MockERC20();
        guard = new BaseAgentPaymentGuard(address(token));
    }

    function testOwnerCanConfigurePolicy() public {
        uint64 expiry = uint64(block.timestamp + 7 days);

        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 25e6, 100e6, expiry);

        BaseAgentPaymentGuard.Policy memory policy = guard.getPolicy(OWNER);
        _assertEq(policy.agent, AGENT, "agent");
        _assertEq(policy.perPaymentLimit, 25e6, "per-payment limit");
        _assertEq(policy.dailyLimit, 100e6, "daily limit");
        _assertEq(policy.expiresAt, expiry, "expiry");
        _assertFalse(policy.paused, "paused");
        _assertFalse(policy.revoked, "revoked");
        _assertEq(policy.revision, 1, "revision");
    }

    function testConfiguredAgentCanPayAllowedMerchant() public {
        address merchant = address(0xBEEF);
        bytes32 externalReference = keccak256("invoice-42");

        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 25e6, 100e6, uint64(block.timestamp + 7 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);
        token.mint(OWNER, 100e6);
        vm.prank(OWNER);
        token.approve(address(guard), 100e6);

        bytes32 expectedReceipt = guard.computeReceiptId(OWNER, merchant, 20e6, externalReference);
        vm.prank(AGENT);
        bytes32 actualReceipt = guard.executePayment(OWNER, merchant, 20e6, externalReference);

        _assertEq(actualReceipt, expectedReceipt, "receipt");
        _assertEq(token.balanceOf(OWNER), 80e6, "owner balance");
        _assertEq(token.balanceOf(merchant), 20e6, "merchant balance");
        _assertTrue(guard.isReferenceUsed(OWNER, externalReference), "reference used");
        (uint64 day, uint256 spent) = guard.getDailySpend(OWNER);
        _assertEq(day, uint64(block.timestamp / 1 days), "spend day");
        _assertEq(spent, 20e6, "spent");
        _assertEq(guard.remainingDailyAllowance(OWNER), 80e6, "remaining");
    }

    function testOwnerCanPauseAndUnpausePaymentPolicy() public {
        address merchant = address(0xBEEF);
        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 25e6, 100e6, uint64(block.timestamp + 7 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);

        vm.prank(OWNER);
        guard.setPolicyPaused(true);
        vm.expectRevert(BaseAgentPaymentGuard.PolicyPaused.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1e6, keccak256("paused"));

        vm.prank(OWNER);
        guard.setPolicyPaused(false);
        token.mint(OWNER, 1e6);
        vm.prank(OWNER);
        token.approve(address(guard), 1e6);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1e6, keccak256("unpaused"));

        _assertEq(token.balanceOf(merchant), 1e6, "unpaused transfer");
    }

    function testRejectsDeploymentOutsideBaseChains() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(BaseAgentPaymentGuard.UnsupportedChain.selector, 1));
        new BaseAgentPaymentGuard(address(token));

        vm.chainId(8453);
        BaseAgentPaymentGuard mainnetGuard = new BaseAgentPaymentGuard(address(token));
        _assertEq(address(mainnetGuard.stablecoin()), address(token), "mainnet token");
    }

    function testRejectsZeroAndNonContractTokens() public {
        vm.expectRevert(BaseAgentPaymentGuard.InvalidToken.selector);
        new BaseAgentPaymentGuard(address(0));
        vm.expectRevert(BaseAgentPaymentGuard.InvalidToken.selector);
        new BaseAgentPaymentGuard(address(1));
    }

    function testRejectsMalformedPolicyConfigurations() public {
        vm.expectRevert(BaseAgentPaymentGuard.InvalidAgent.selector);
        vm.prank(OWNER);
        guard.configurePolicy(address(0), 1, 1, uint64(block.timestamp + 1));

        vm.expectRevert(BaseAgentPaymentGuard.InvalidLimits.selector);
        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 0, 1, uint64(block.timestamp + 1));

        vm.expectRevert(BaseAgentPaymentGuard.InvalidLimits.selector);
        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 2, 1, uint64(block.timestamp + 1));

        vm.expectRevert(BaseAgentPaymentGuard.InvalidExpiry.selector);
        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 1, 1, uint64(block.timestamp));
    }

    function testReconfigurationInvalidatesPreviousMerchantPermissions() public {
        address merchant = address(0xBEEF);
        _configure(25e6, 100e6, uint64(block.timestamp + 7 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);

        vm.prank(OWNER);
        guard.configurePolicy(address(0xB0B), 25e6, 100e6, uint64(block.timestamp + 8 days));

        _assertFalse(guard.isMerchantAllowed(OWNER, merchant), "old allowlist invalidated");
    }

    function testOnlyPolicyOwnerCanMutateItsControls() public {
        _configure(25e6, 100e6, uint64(block.timestamp + 7 days));

        vm.expectRevert(BaseAgentPaymentGuard.PolicyNotConfigured.selector);
        vm.prank(address(0xBAD));
        guard.setPolicyPaused(true);
        vm.expectRevert(BaseAgentPaymentGuard.PolicyNotConfigured.selector);
        vm.prank(address(0xBAD));
        guard.setMerchant(address(0xBEEF), true);
        vm.expectRevert(BaseAgentPaymentGuard.PolicyNotConfigured.selector);
        vm.prank(address(0xBAD));
        guard.revokePolicy();

        BaseAgentPaymentGuard.Policy memory policy = guard.getPolicy(OWNER);
        _assertFalse(policy.paused, "owner policy unchanged");
    }

    function testRevocationStopsPaymentsAndOwnerCanCreateFreshPolicy() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));

        vm.prank(OWNER);
        guard.revokePolicy();
        vm.expectRevert(BaseAgentPaymentGuard.PolicyIsRevoked.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1e6, keccak256("revoked"));
        vm.expectRevert(BaseAgentPaymentGuard.PolicyIsRevoked.selector);
        vm.prank(OWNER);
        guard.setPolicyPaused(false);

        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 25e6, 100e6, uint64(block.timestamp + 8 days));
        BaseAgentPaymentGuard.Policy memory policy = guard.getPolicy(OWNER);
        _assertFalse(policy.revoked, "fresh policy active");
        _assertEq(policy.revision, 3, "monotonic revision");
        _assertFalse(guard.isMerchantAllowed(OWNER, merchant), "fresh allowlist empty");
    }

    function testRejectsUnconfiguredWrongAgentExpiredAndUnallowedPayments() public {
        address merchant = address(0xBEEF);
        vm.expectRevert(BaseAgentPaymentGuard.PolicyNotConfigured.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1, keccak256("unconfigured"));

        _configure(25e6, 100e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(BaseAgentPaymentGuard.UnauthorizedAgent.selector);
        vm.prank(address(0xBAD));
        guard.executePayment(OWNER, merchant, 1, keccak256("wrong-agent"));
        vm.expectRevert(BaseAgentPaymentGuard.MerchantNotAllowed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1, keccak256("unallowed"));

        vm.prank(OWNER);
        guard.setMerchant(merchant, true);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(BaseAgentPaymentGuard.PolicyExpired.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1, keccak256("expired"));
    }

    function testRemovedMerchantCannotReceivePayments() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));

        vm.prank(OWNER);
        guard.setMerchant(merchant, false);

        _assertFalse(guard.isMerchantAllowed(OWNER, merchant), "merchant removed");
        vm.expectRevert(BaseAgentPaymentGuard.MerchantNotAllowed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1, keccak256("removed"));
    }

    function testRejectsMalformedPaymentRequests() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));

        vm.expectRevert(BaseAgentPaymentGuard.InvalidOwner.selector);
        vm.prank(AGENT);
        guard.executePayment(address(0), merchant, 1, keccak256("owner"));
        vm.expectRevert(BaseAgentPaymentGuard.InvalidMerchant.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, address(0), 1, keccak256("merchant"));
        vm.expectRevert(BaseAgentPaymentGuard.InvalidAmount.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 0, keccak256("amount"));
        vm.expectRevert(BaseAgentPaymentGuard.InvalidReference.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1, bytes32(0));
    }

    function testRejectsDirectSelfPaymentReceipts() public {
        _configure(25e6, 100e6, uint64(block.timestamp + 7 days));

        vm.expectRevert(bytes4(keccak256("SelfPaymentNotAllowed()")));
        vm.prank(OWNER);
        guard.setMerchant(OWNER, true);

        vm.expectRevert(bytes4(keccak256("SelfPaymentNotAllowed()")));
        vm.prank(AGENT);
        guard.executePayment(OWNER, OWNER, 10e6, keccak256("self-payment"));
    }

    function testEnforcesPerPaymentAndDailyLimitsThenResetsNextDay() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 60e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(200e6);

        vm.expectRevert(BaseAgentPaymentGuard.PerPaymentLimitExceeded.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 61e6, keccak256("too-large"));

        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 60e6, keccak256("first"));
        vm.expectRevert(BaseAgentPaymentGuard.DailyLimitExceeded.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 41e6, keccak256("over-day"));
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 40e6, keccak256("fills-day"));
        _assertEq(guard.remainingDailyAllowance(OWNER), 0, "day exhausted");

        vm.warp(block.timestamp + 1 days);
        _assertEq(guard.remainingDailyAllowance(OWNER), 100e6, "new day reset");
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 60e6, keccak256("next-day"));
        (, uint256 spent) = guard.getDailySpend(OWNER);
        _assertEq(spent, 60e6, "new day spend");
    }

    function testReferenceCannotBeReplayed() public {
        address merchant = address(0xBEEF);
        bytes32 externalReference = keccak256("unique-reference");
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(50e6);

        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 10e6, externalReference);
        vm.expectRevert(BaseAgentPaymentGuard.ReferenceAlreadyUsed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 10e6, externalReference);
    }

    function testReferenceAndAgentAuthorizationSurvivePolicyRotation() public {
        address merchant = address(0xBEEF);
        address nextAgent = address(0xB0B);
        bytes32 externalReference = keccak256("owner-global-reference");
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(50e6);

        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 10e6, externalReference);

        vm.prank(OWNER);
        guard.configurePolicy(nextAgent, 25e6, 100e6, uint64(block.timestamp + 8 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);

        vm.expectRevert(BaseAgentPaymentGuard.UnauthorizedAgent.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1e6, keccak256("old-agent"));

        vm.expectRevert(BaseAgentPaymentGuard.ReferenceAlreadyUsed.selector);
        vm.prank(nextAgent);
        guard.executePayment(OWNER, merchant, 10e6, externalReference);
    }

    function testSameDaySpendSurvivesPolicyReconfigurationAndLoweredLimits() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 60e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(150e6);

        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 60e6, keccak256("before-reconfigure"));

        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 60e6, 100e6, uint64(block.timestamp + 8 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);

        vm.expectRevert(BaseAgentPaymentGuard.DailyLimitExceeded.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 41e6, keccak256("over-after-reconfigure"));
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 40e6, keccak256("fill-after-reconfigure"));

        vm.prank(OWNER);
        guard.configurePolicy(AGENT, 10e6, 50e6, uint64(block.timestamp + 9 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);
        vm.expectRevert(BaseAgentPaymentGuard.DailyLimitExceeded.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 1e6, keccak256("lowered-limit"));
    }

    function testPaymentEmitsDeterministicReceipt() public {
        address merchant = address(0xBEEF);
        bytes32 externalReference = keccak256("receipt-reference");
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(25e6);
        bytes32 receipt = guard.computeReceiptId(OWNER, merchant, 25e6, externalReference);

        vm.expectEmit(true, true, true, true, address(guard));
        emit PaymentExecuted(
            receipt,
            OWNER,
            AGENT,
            merchant,
            25e6,
            externalReference,
            uint64(block.timestamp / 1 days),
            25e6,
            1
        );
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 25e6, externalReference);
    }

    function testTokenTransferFailureRollsBackSpendAndReference() public {
        address merchant = address(0xBEEF);
        bytes32 externalReference = keccak256("retry-safe");
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(25e6);
        token.setReturnMode(1);

        vm.expectRevert(BaseAgentPaymentGuard.TokenTransferFailed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 25e6, externalReference);
        _assertFalse(guard.isReferenceUsed(OWNER, externalReference), "reference rolled back");
        (, uint256 spent) = guard.getDailySpend(OWNER);
        _assertEq(spent, 0, "spend rolled back");

        token.setReturnMode(0);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 25e6, externalReference);
        _assertEq(token.balanceOf(merchant), 25e6, "retry succeeds");
    }

    function testRevertingTokenIsNormalizedToTransferFailure() public {
        address merchant = address(0xBEEF);
        bytes32 externalReference = keccak256("reverting-token");
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(25e6);
        token.setReturnMode(2);

        vm.expectRevert(BaseAgentPaymentGuard.TokenTransferFailed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 25e6, externalReference);
        _assertFalse(guard.isReferenceUsed(OWNER, externalReference), "revert rolls back reference");
        (, uint256 spent) = guard.getDailySpend(OWNER);
        _assertEq(spent, 0, "revert rolls back spend");
    }

    function testAcceptsNoReturnTokenAndRejectsMalformedReturn() public {
        address merchant = address(0xBEEF);
        _configureAndAllow(merchant, 25e6, 100e6, uint64(block.timestamp + 7 days));
        _fundAndApprove(50e6);
        token.setReturnMode(3);

        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 10e6, keccak256("no-return"));
        _assertEq(token.balanceOf(merchant), 10e6, "no-return accepted");

        token.setReturnMode(4);
        vm.expectRevert(BaseAgentPaymentGuard.TokenTransferFailed.selector);
        vm.prank(AGENT);
        guard.executePayment(OWNER, merchant, 10e6, keccak256("malformed-return"));
    }

    function testBlocksTokenReentrancyAfterEffects() public {
        address merchant = address(0xBEEF);
        address tokenAgent = address(token);
        vm.prank(OWNER);
        guard.configurePolicy(tokenAgent, 25e6, 100e6, uint64(block.timestamp + 7 days));
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);
        _fundAndApprove(50e6);
        bytes32 outerReference = keccak256("outer");
        bytes32 innerReference = keccak256("inner");
        token.setReentry(guard, OWNER, merchant, 10e6, innerReference);
        token.setReturnMode(5);

        vm.prank(tokenAgent);
        guard.executePayment(OWNER, merchant, 10e6, outerReference);

        _assertFalse(token.reentrySucceeded(), "reentry blocked");
        _assertFalse(guard.isReferenceUsed(OWNER, innerReference), "inner reference unused");
        (, uint256 spent) = guard.getDailySpend(OWNER);
        _assertEq(spent, 10e6, "one payment spent");
        _assertEq(token.balanceOf(merchant), 10e6, "one transfer");
    }

    function _configure(uint256 perPayment, uint256 daily, uint64 expiry) private {
        vm.prank(OWNER);
        guard.configurePolicy(AGENT, perPayment, daily, expiry);
    }

    function _configureAndAllow(address merchant, uint256 perPayment, uint256 daily, uint64 expiry)
        private
    {
        _configure(perPayment, daily, expiry);
        vm.prank(OWNER);
        guard.setMerchant(merchant, true);
    }

    function _fundAndApprove(uint256 amount) private {
        token.mint(OWNER, amount);
        vm.prank(OWNER);
        token.approve(address(guard), amount);
    }

    function _assertEq(address actual, address expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertTrue(bool value, string memory reason) private pure {
        require(value, reason);
    }

    function _assertFalse(bool value, string memory reason) private pure {
        require(!value, reason);
    }
}

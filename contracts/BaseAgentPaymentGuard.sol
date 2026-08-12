// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Base Agent Payment Guard
/// @notice Lets an owner delegate narrowly constrained stablecoin payments to one agent.
contract BaseAgentPaymentGuard {
    uint256 public constant BASE_MAINNET_CHAIN_ID = 8453;
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    struct Policy {
        address agent;
        uint256 perPaymentLimit;
        uint256 dailyLimit;
        uint64 expiresAt;
        bool paused;
        bool revoked;
        uint64 revision;
    }

    struct DailySpend {
        uint64 day;
        uint256 amount;
    }

    error InvalidToken();
    error UnsupportedChain(uint256 chainId);
    error InvalidAgent();
    error InvalidLimits();
    error InvalidExpiry();
    error InvalidMerchant();
    error SelfPaymentNotAllowed();
    error InvalidOwner();
    error InvalidAmount();
    error InvalidReference();
    error PolicyNotConfigured();
    error PolicyPaused();
    error PolicyIsRevoked();
    error PolicyExpired();
    error UnauthorizedAgent();
    error MerchantNotAllowed();
    error PerPaymentLimitExceeded();
    error DailyLimitExceeded();
    error ReferenceAlreadyUsed();
    error TokenTransferFailed();
    error Reentrancy();

    event PolicyConfigured(
        address indexed owner,
        address indexed agent,
        uint256 perPaymentLimit,
        uint256 dailyLimit,
        uint64 expiresAt,
        uint64 revision
    );
    event MerchantPermissionUpdated(address indexed owner, address indexed merchant, bool allowed);
    event PolicyPauseUpdated(address indexed owner, bool paused);
    event PolicyRevoked(address indexed owner, uint64 revision);
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

    IERC20 public immutable stablecoin;

    mapping(address owner => Policy policy) private policies;
    mapping(
        address owner => mapping(uint64 revision => mapping(address merchant => bool allowed))
    ) private merchantPermissions;
    mapping(address owner => mapping(bytes32 externalReference => bool used)) private
        usedReferences;
    mapping(address owner => DailySpend spend) private dailySpends;

    uint256 private lockState = 1;

    modifier nonReentrant() {
        if (lockState != 1) revert Reentrancy();
        lockState = 2;
        _;
        lockState = 1;
    }

    constructor(address token) {
        if (block.chainid != BASE_MAINNET_CHAIN_ID && block.chainid != BASE_SEPOLIA_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (token == address(0) || token.code.length == 0) revert InvalidToken();

        stablecoin = IERC20(token);
    }

    function configurePolicy(
        address agent,
        uint256 perPaymentLimit,
        uint256 dailyLimit,
        uint64 expiresAt
    ) external {
        if (agent == address(0)) revert InvalidAgent();
        if (perPaymentLimit == 0 || dailyLimit < perPaymentLimit) revert InvalidLimits();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        uint64 nextRevision = policies[msg.sender].revision + 1;
        policies[msg.sender] = Policy({
            agent: agent,
            perPaymentLimit: perPaymentLimit,
            dailyLimit: dailyLimit,
            expiresAt: expiresAt,
            paused: false,
            revoked: false,
            revision: nextRevision
        });

        emit PolicyConfigured(
            msg.sender, agent, perPaymentLimit, dailyLimit, expiresAt, nextRevision
        );
    }

    function getPolicy(address owner) external view returns (Policy memory) {
        return policies[owner];
    }

    function setMerchant(address merchant, bool allowed) external {
        if (merchant == address(0)) revert InvalidMerchant();
        if (merchant == msg.sender) revert SelfPaymentNotAllowed();
        Policy storage policy = policies[msg.sender];
        if (policy.agent == address(0)) revert PolicyNotConfigured();
        if (policy.revoked) revert PolicyIsRevoked();

        merchantPermissions[msg.sender][policy.revision][merchant] = allowed;
        emit MerchantPermissionUpdated(msg.sender, merchant, allowed);
    }

    function setPolicyPaused(bool paused) external {
        Policy storage policy = policies[msg.sender];
        if (policy.agent == address(0)) revert PolicyNotConfigured();
        if (policy.revoked) revert PolicyIsRevoked();

        policy.paused = paused;
        emit PolicyPauseUpdated(msg.sender, paused);
    }

    function revokePolicy() external {
        Policy storage policy = policies[msg.sender];
        if (policy.agent == address(0)) revert PolicyNotConfigured();
        if (policy.revoked) revert PolicyIsRevoked();

        policy.revoked = true;
        policy.paused = true;
        policy.revision += 1;
        emit PolicyRevoked(msg.sender, policy.revision);
    }

    function isMerchantAllowed(address owner, address merchant) public view returns (bool) {
        Policy storage policy = policies[owner];
        return merchantPermissions[owner][policy.revision][merchant];
    }

    function isReferenceUsed(address owner, bytes32 externalReference)
        external
        view
        returns (bool)
    {
        return usedReferences[owner][externalReference];
    }

    function getDailySpend(address owner) external view returns (uint64 day, uint256 spent) {
        uint64 today = _currentDay();
        DailySpend storage storedSpend = dailySpends[owner];
        if (storedSpend.day != today) return (today, 0);
        return (today, storedSpend.amount);
    }

    function remainingDailyAllowance(address owner) external view returns (uint256) {
        uint256 limit = policies[owner].dailyLimit;
        DailySpend storage storedSpend = dailySpends[owner];
        uint256 spent = storedSpend.day == _currentDay() ? storedSpend.amount : 0;
        if (spent >= limit) return 0;
        return limit - spent;
    }

    function computeReceiptId(
        address owner,
        address merchant,
        uint256 amount,
        bytes32 externalReference
    ) public view returns (bytes32) {
        Policy storage policy = policies[owner];
        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                owner,
                policy.agent,
                merchant,
                amount,
                externalReference,
                policy.revision
            )
        );
    }

    function executePayment(
        address owner,
        address merchant,
        uint256 amount,
        bytes32 externalReference
    ) external nonReentrant returns (bytes32 receiptId) {
        if (owner == address(0)) revert InvalidOwner();
        if (merchant == address(0)) revert InvalidMerchant();
        if (merchant == owner) revert SelfPaymentNotAllowed();
        if (amount == 0) revert InvalidAmount();
        if (externalReference == bytes32(0)) revert InvalidReference();

        Policy storage policy = policies[owner];
        if (policy.agent == address(0)) revert PolicyNotConfigured();
        if (msg.sender != policy.agent) revert UnauthorizedAgent();
        if (policy.revoked) revert PolicyIsRevoked();
        if (policy.paused) revert PolicyPaused();
        if (block.timestamp >= policy.expiresAt) revert PolicyExpired();
        if (!merchantPermissions[owner][policy.revision][merchant]) revert MerchantNotAllowed();
        if (amount > policy.perPaymentLimit) revert PerPaymentLimitExceeded();
        if (usedReferences[owner][externalReference]) revert ReferenceAlreadyUsed();

        uint64 today = _currentDay();
        DailySpend storage dailySpend = dailySpends[owner];
        uint256 spentToday = dailySpend.day == today ? dailySpend.amount : 0;
        if (amount > policy.dailyLimit || spentToday > policy.dailyLimit - amount) {
            revert DailyLimitExceeded();
        }
        uint256 newSpend = spentToday + amount;

        receiptId = computeReceiptId(owner, merchant, amount, externalReference);

        // Effects precede the external token call. A reverted call rolls these writes back.
        usedReferences[owner][externalReference] = true;
        dailySpend.day = today;
        dailySpend.amount = newSpend;

        _safeTransferFrom(owner, merchant, amount);

        emit PaymentExecuted(
            receiptId,
            owner,
            policy.agent,
            merchant,
            amount,
            externalReference,
            today,
            newSpend,
            policy.revision
        );
    }

    function _currentDay() private view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _safeTransferFrom(address owner, address merchant, uint256 amount) private {
        (bool success, bytes memory returnData) =
            address(stablecoin).call(abi.encodeCall(IERC20.transferFrom, (owner, merchant, amount)));
        if (!success) revert TokenTransferFailed();
        if (returnData.length == 0) return;
        if (returnData.length != 32) revert TokenTransferFailed();

        uint256 result;
        assembly ("memory-safe") {
            result := mload(add(returnData, 32))
        }
        if (result != 1) revert TokenTransferFailed();
    }
}

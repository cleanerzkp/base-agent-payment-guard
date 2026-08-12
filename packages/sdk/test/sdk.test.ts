import { encodeEventTopics, encodeAbiParameters, parseAbiParameters, zeroAddress, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  aggregateReceiptMetrics,
  baseAgentPaymentGuardAbi,
  buildApproveStablecoin,
  buildConfigurePolicy,
  buildExecutePayment,
  computePaymentReceiptId,
  preflightPayment,
  verifyPaymentReceipt,
  type GuardPolicy,
  type PaymentIntent,
  type ReceiptDomain,
  type ReceiptEvidenceClient,
  type RpcTransactionReceiptEvidence,
  type VerifiedPaymentReceipt,
} from '../src/index.js';

const owner = '0x1111111111111111111111111111111111111111' as const;
const agent = '0x2222222222222222222222222222222222222222' as const;
const merchant = '0x3333333333333333333333333333333333333333' as const;
const reference = `0x${'ab'.repeat(32)}` as const;
const policy: GuardPolicy = { agent, perPaymentLimit: 50_000_000n, dailyLimit: 200_000_000n, expiresAt: 2_000_000_000n, paused: false, revoked: false, revision: 1n };
const intent: PaymentIntent = { chainId: 8453, owner, caller: agent, merchant, amount: 25_000_000n, externalReference: reference, now: 1_800_000_000n };

describe('preflightPayment', () => {
  it('allows only when every state-backed check passes', () => {
    const result = preflightPayment(intent, { policy, merchantAllowed: true, spentToday: 60_000_000n, referenceUsed: false });
    expect(result.decision).toBe('allow');
    expect(result.checks.every(({ status }) => status === 'pass')).toBe(true);
  });

  it('fails closed when state is missing', () => {
    const result = preflightPayment(intent, {});
    expect(result.decision).toBe('deny');
    expect(result.checks.some(({ status }) => status === 'indeterminate')).toBe(true);
  });

  it('diagnoses malformed policy state independently from pause state', () => {
    const result = preflightPayment(intent, { policy: { ...policy, revision: 0n }, merchantAllowed: true, spentToday: 0n, referenceUsed: false });
    expect(result.decision).toBe('deny');
    expect(result.checks.find(({ ruleId }) => ruleId === 'BAPG-POLICY-001')?.reason).toBe('Policy state is malformed.');
  });

  it.each([
    ['string amount', { ...intent, amount: '25000000' }, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['number timestamp', { ...intent, now: 1_800_000_000 }, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['string merchant flag', intent, { policy, merchantAllowed: 'false', spentToday: 0n, referenceUsed: false }],
    ['null replay flag', intent, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: null }],
    ['number policy limit', intent, { policy: { ...policy, perPaymentLimit: 50_000_000 }, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['null policy pause', intent, { policy: { ...policy, paused: null }, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['numeric policy revoked', intent, { policy: { ...policy, revoked: 0 }, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
  ])('fails closed without throwing for malformed runtime state: %s', (_label, malformedIntent, malformedContext) => {
    expect(() => preflightPayment(malformedIntent as PaymentIntent, malformedContext as never)).not.toThrow();
    expect(preflightPayment(malformedIntent as PaymentIntent, malformedContext as never).decision).toBe('deny');
  });

  it.each([
    ['unsupported chain', { ...intent, chainId: 1 }, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['wrong agent', { ...intent, caller: owner }, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['unlisted merchant', intent, { policy, merchantAllowed: false, spentToday: 0n, referenceUsed: false }],
    ['self-payment', { ...intent, merchant: owner }, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: false }],
    ['daily limit', { ...intent, amount: 50_000_000n }, { policy, merchantAllowed: true, spentToday: 175_000_000n, referenceUsed: false }],
    ['replay', intent, { policy, merchantAllowed: true, spentToday: 0n, referenceUsed: true }],
  ])('denies %s', (_label, sampleIntent, context) => {
    expect(preflightPayment(sampleIntent as PaymentIntent, context).decision).toBe('deny');
  });
});

describe('transaction builders', () => {
  it('keeps SDK custom errors in parity with the contract surface', () => {
    const errorNames = baseAgentPaymentGuardAbi.filter((item) => item.type === 'error').map((item) => item.name).sort();
    expect(errorNames).toEqual(['DailyLimitExceeded', 'InvalidAgent', 'InvalidAmount', 'InvalidExpiry', 'InvalidLimits', 'InvalidMerchant', 'InvalidOwner', 'InvalidReference', 'InvalidToken', 'MerchantNotAllowed', 'PerPaymentLimitExceeded', 'PolicyExpired', 'PolicyIsRevoked', 'PolicyNotConfigured', 'PolicyPaused', 'Reentrancy', 'ReferenceAlreadyUsed', 'SelfPaymentNotAllowed', 'TokenTransferFailed', 'UnauthorizedAgent', 'UnsupportedChain'].sort());
  });
  it('builds a zero-value Base call', () => {
    const call = buildExecutePayment({ chainId: 8453, guard: owner, owner, merchant, amount: 1n, externalReference: reference });
    expect(call.chainId).toBe(8453);
    expect(call.value).toBe(0n);
    expect(call.data).toMatch(/^0x[0-9a-f]+$/);
  });

  it('rejects non-Base chains before encoding', () => {
    expect(() => buildExecutePayment({ chainId: 1, guard: owner, owner, merchant, amount: 1n, externalReference: reference })).toThrow(/Only Base/);
  });

  it('rejects contract-invalid inputs but permits zero approval revocation', () => {
    expect(() => buildExecutePayment({ chainId: 8453, guard: owner, owner, merchant: owner, amount: 1n, externalReference: reference })).toThrow(/distinct/);
    expect(() => buildExecutePayment({ chainId: 8453, guard: owner, owner, merchant, amount: 0n, externalReference: reference })).toThrow(/positive/);
    expect(() => buildConfigurePolicy({ chainId: 8453, guard: owner, agent: zeroAddress, perPaymentLimit: 1n, dailyLimit: 1n, expiresAt: 1n })).toThrow(/Agent/);
    expect(buildApproveStablecoin({ chainId: 8453, token: merchant, guard: owner, amount: 0n }).data).toMatch(/^0x/);
    expect(() => buildApproveStablecoin({ chainId: 8453, token: merchant, guard: zeroAddress, amount: 1n })).toThrow(/Guard/);
  });

  it.each([
    ['execute number', () => buildExecutePayment({ chainId: 8453, guard: owner, owner, merchant, amount: 9_007_199_254_740_993 as never, externalReference: reference })],
    ['execute string', () => buildExecutePayment({ chainId: 8453, guard: owner, owner, merchant, amount: '1' as never, externalReference: reference })],
    ['configure numeric payment limit', () => buildConfigurePolicy({ chainId: 8453, guard: owner, agent, perPaymentLimit: 1 as never, dailyLimit: 2n, expiresAt: 2_000_000_000n })],
    ['configure string daily limit', () => buildConfigurePolicy({ chainId: 8453, guard: owner, agent, perPaymentLimit: 1n, dailyLimit: '2' as never, expiresAt: 2_000_000_000n })],
    ['configure numeric expiry', () => buildConfigurePolicy({ chainId: 8453, guard: owner, agent, perPaymentLimit: 1n, dailyLimit: 2n, expiresAt: 2_000_000_000 as never })],
    ['approve number', () => buildApproveStablecoin({ chainId: 8453, token: merchant, guard: owner, amount: 1 as never })],
  ])('rejects non-bigint builder input before ABI encoding: %s', (_label, build) => {
    expect(build).toThrow(/bigint/);
  });
});

describe('receipt evidence', () => {
  const domain: ReceiptDomain = { chainId: 8453, guard: owner };
  const transactionHash = `0x${'ef'.repeat(32)}` as Hex;
  const blockHash = `0x${'cd'.repeat(32)}` as Hex;
  const receiptBase = { guard: owner, chainId: 8453 as const, owner, agent, merchant, amount: 25_000_000n, externalReference: reference, policyRevision: 1n };
  const receiptId = computePaymentReceiptId(receiptBase);
  const topics = encodeEventTopics({ abi: baseAgentPaymentGuardAbi, eventName: 'PaymentExecuted', args: { receiptId, owner, agent } }) as readonly Hex[];
  const data = encodeAbiParameters(parseAbiParameters('address, uint256, bytes32, uint64, uint256, uint64'), [merchant, 25_000_000n, reference, 20_000n, 85_000_000n, 1n]);

  function rpcReceipt(overrides: Partial<RpcTransactionReceiptEvidence> = {}): RpcTransactionReceiptEvidence {
    return {
      transactionHash,
      blockHash,
      blockNumber: 123n,
      status: 'success',
      logs: [{
        address: owner,
        data,
        topics,
        transactionHash,
        blockHash,
        blockNumber: 123n,
        logIndex: 4,
        removed: false,
      }],
      ...overrides,
    };
  }

  function evidenceClient(options: {
    chainId?: number;
    latestBlockNumber?: bigint;
    receipt?: RpcTransactionReceiptEvidence;
  } = {}): ReceiptEvidenceClient {
    return {
      async getChainId() { return options.chainId ?? 8453; },
      async getTransactionReceipt({ hash }) {
        expect(hash).toBe(transactionHash);
        return options.receipt ?? rpcReceipt();
      },
      async getBlockNumber() { return options.latestBlockNumber ?? 130n; },
    };
  }

  async function verify(options: {
    client?: ReceiptEvidenceClient;
    expectedDomain?: ReceiptDomain;
    requiredConfirmations?: bigint;
  } = {}) {
    return verifyPaymentReceipt({
      client: options.client ?? evidenceClient(),
      domain: options.expectedDomain ?? domain,
      transactionHash,
      logIndex: 4,
      requiredConfirmations: options.requiredConfirmations ?? 3n,
    });
  }

  it('rejects fabricated raw receipt data at the aggregation boundary', () => {
    const rawLog = rpcReceipt().logs[0] as unknown as VerifiedPaymentReceipt;
    const fabricated = {
      ...receiptBase,
      receiptId,
      day: 20_000n,
      spentToday: 85_000_000n,
      transactionHash,
      blockHash,
      blockNumber: 123n,
      logIndex: 4,
      verification: {
        source: 'trusted-rpc-transaction-receipt',
        status: 'success',
        latestBlockNumber: 130n,
        confirmations: 8n,
        requiredConfirmations: 3n,
      },
    } as unknown as VerifiedPaymentReceipt;

    expect(aggregateReceiptMetrics(domain, [rawLog, fabricated])).toEqual({
      chainId: 8453,
      guard: owner,
      paymentCount: 0,
      uniqueOwners: 0,
      uniqueAgents: 0,
      uniqueMerchants: 0,
      totalAmount: 0n,
      rejectedCount: 2,
    });
  });

  it('fails closed for a wrong RPC chain or aggregation domain', async () => {
    expect(await verify({ client: evidenceClient({ chainId: 84532 }) })).toBeUndefined();
    expect(await verify({ expectedDomain: { chainId: 8453, guard: merchant } })).toBeUndefined();

    const verified = await verify();
    expect(verified).toBeDefined();
    expect(aggregateReceiptMetrics({ chainId: 84532, guard: owner }, [verified!]).rejectedCount).toBe(1);
    expect(aggregateReceiptMetrics({ chainId: 8453, guard: merchant }, [verified!]).rejectedCount).toBe(1);
  });

  it('rejects a failed transaction receipt', async () => {
    expect(await verify({ client: evidenceClient({ receipt: rpcReceipt({ status: 'reverted' }) }) })).toBeUndefined();
  });

  it('rejects a removed receipt log', async () => {
    const receipt = rpcReceipt();
    expect(await verify({
      client: evidenceClient({ receipt: { ...receipt, logs: [{ ...receipt.logs[0]!, removed: true }] } }),
    })).toBeUndefined();
  });

  it('rejects log provenance that does not match the transaction receipt', async () => {
    const receipt = rpcReceipt();
    const differentBlockHash = `0x${'aa'.repeat(32)}` as Hex;
    expect(await verify({
      client: evidenceClient({ receipt: { ...receipt, logs: [{ ...receipt.logs[0]!, blockHash: differentBlockHash }] } }),
    })).toBeUndefined();
  });

  it('rejects insufficient confirmation depth', async () => {
    expect(await verify({
      client: evidenceClient({ latestBlockNumber: 124n }),
      requiredConfirmations: 3n,
    })).toBeUndefined();
  });

  it('rejects a duplicate verified receipt during aggregation', async () => {
    const verified = await verify();
    expect(verified).toBeDefined();
    expect(aggregateReceiptMetrics(domain, [verified!, verified!])).toEqual({
      chainId: 8453,
      guard: owner,
      paymentCount: 1,
      uniqueOwners: 1,
      uniqueAgents: 1,
      uniqueMerchants: 1,
      totalAmount: 25_000_000n,
      rejectedCount: 1,
    });
  });

  it('verifies and aggregates a successful canonical receipt from the expected domain', async () => {
    const verified = await verify();
    expect(verified).toMatchObject({
      chainId: 8453,
      guard: owner,
      receiptId,
      merchant,
      transactionHash,
      blockHash,
      blockNumber: 123n,
      logIndex: 4,
      verification: {
        source: 'trusted-rpc-transaction-receipt',
        status: 'success',
        latestBlockNumber: 130n,
        confirmations: 8n,
        requiredConfirmations: 3n,
      },
    });
    expect(verified && aggregateReceiptMetrics(domain, [verified])).toEqual({
      chainId: 8453,
      guard: owner,
      paymentCount: 1,
      uniqueOwners: 1,
      uniqueAgents: 1,
      uniqueMerchants: 1,
      totalAmount: 25_000_000n,
      rejectedCount: 0,
    });
    expect(zeroAddress).not.toBe(owner);
  });
});

import { decodeFunctionData, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { erc20ApproveAbi } from '@base-agent-payment-guard/sdk';
import { BASE_SEPOLIA_DEPLOYMENT } from '../deployment';
import {
  MAX_TESTNET_APPROVAL_AMOUNT,
  BASE_BUILDER_CODE_SUFFIX,
  OnchainError,
  createTransactionCoordinator,
  type PublicRpcClient,
  type WalletProvider,
  type WalletTransactionRequest,
} from './index';

const owner = '0x1111111111111111111111111111111111111111' as const;
const other = '0x2222222222222222222222222222222222222222' as const;
const agent = '0x3333333333333333333333333333333333333333' as const;
const merchant = '0x4444444444444444444444444444444444444444' as const;
const reference = `0x${'ab'.repeat(32)}` as const;
const builderCodeSuffix = BASE_BUILDER_CODE_SUFFIX;
const block = { number: 100n, hash: `0x${'cd'.repeat(32)}` as const, timestamp: 1_800_000_000n };

class TestWallet implements WalletProvider {
  account: Address = owner;
  chainId = 84532;
  sent: WalletTransactionRequest[] = [];
  rejectNext = false;
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();

  async request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown> {
    if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') return [this.account];
    if (args.method === 'eth_chainId') return `0x${this.chainId.toString(16)}`;
    if (args.method === 'eth_sendTransaction') {
      if (this.rejectNext) {
        this.rejectNext = false;
        throw { code: 4001, message: `do not expose ${this.account}` };
      }
      const [request] = args.params as readonly WalletTransactionRequest[];
      this.sent.push(request!);
      return `0x${'ef'.repeat(32)}`;
    }
    throw new Error(`unexpected wallet method ${args.method}`);
  }

  on(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (value: unknown) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (value: unknown) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: 'accountsChanged' | 'chainChanged' | 'disconnect', value: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

interface TestPublicClient extends PublicRpcClient {
  observedReadBlocks: bigint[];
  simulations: Array<{ request: Readonly<{ account: Address; chainId: 84532; to: Address; data: Hex; value: 0n }>; blockNumber: bigint }>;
  allowance: bigint;
  policyAgent: Address;
  simulationGate?: Promise<void>;
}

function publicClient(): TestPublicClient {
  const observedReadBlocks: bigint[] = [];
  const simulations: TestPublicClient['simulations'] = [];
  return {
    observedReadBlocks,
    simulations,
    allowance: 0n,
    policyAgent: agent,
    async getChainId() { return 84532; },
    async getLatestBlock() { return block; },
    async getBlock(number) { expect(number).toBe(block.number); return block; },
    async getCodeIdentity(address, number) {
      observedReadBlocks.push(number);
      return address.toLowerCase() === BASE_SEPOLIA_DEPLOYMENT.guard.toLowerCase()
        ? { exists: true, hash: BASE_SEPOLIA_DEPLOYMENT.runtimeCodeHash }
        : { exists: true, hash: `0x${'aa'.repeat(32)}` };
    },
    async readStablecoin(number) { observedReadBlocks.push(number); return BASE_SEPOLIA_DEPLOYMENT.stablecoin; },
    async readPolicy(_owner, number) {
      observedReadBlocks.push(number);
      return { agent: this.policyAgent, perPaymentLimit: 50_000_000n, dailyLimit: 100_000_000n, expiresAt: block.timestamp + 1_000n, paused: false, revoked: false, revision: 1n };
    },
    async readMerchantAllowed(_owner, _merchant, number) { observedReadBlocks.push(number); return true; },
    async readReferenceUsed(_owner, _reference, number) { observedReadBlocks.push(number); return false; },
    async readDailySpend(_owner, number) { observedReadBlocks.push(number); return { day: block.timestamp / 86_400n, spent: 10_000_000n }; },
    async readAllowance(_owner, _spender, number) { observedReadBlocks.push(number); return this.allowance; },
    async simulateTransaction(request, blockNumber) {
      simulations.push({ request, blockNumber });
      await this.simulationGate;
    },
    async getTransactionReceipt() { throw new Error('not used'); },
    async getBlockNumber() { return block.number; },
  };
}

async function connected(options: { suffix?: Hex | undefined; wallet?: TestWallet; publicRpc?: TestPublicClient; now?: () => number } = {}) {
  const wallet = options.wallet ?? new TestWallet();
  const publicRpc = options.publicRpc ?? publicClient();
  const coordinator = createTransactionCoordinator({
    publicClient: publicRpc,
    walletProvider: wallet,
    builderCodeSuffix: options.suffix === undefined ? builderCodeSuffix : options.suffix,
    now: options.now,
  });
  await coordinator.connect();
  return { coordinator, wallet, publicRpc };
}

describe('transaction coordinator', () => {
  it('uses the registered Builder Code by default and appends its suffix exactly once', async () => {
    const wallet = new TestWallet();
    const rpc = publicClient();
    const coordinator = createTransactionCoordinator({ publicClient: rpc, walletProvider: wallet });
    await coordinator.connect();
    const operation = await coordinator.prepareRevoke();
    expect(coordinator.getState()).toMatchObject({ status: 'ready', writesEnabled: true });
    expect(operation.request.data.endsWith(BASE_BUILDER_CODE_SUFFIX.slice(2))).toBe(true);
    expect(operation.request.data.split(BASE_BUILDER_CODE_SUFFIX.slice(2))).toHaveLength(2);
  });

  it('keeps wallet writes disabled when the explicit public Builder Code suffix is missing', async () => {
    const { coordinator } = await connected({ suffix: '0x' });
    expect(coordinator.getState()).toMatchObject({ status: 'ready', writesEnabled: false });
    await expect(coordinator.prepareRevoke()).rejects.toMatchObject({ code: 'MISSING_BUILDER_SUFFIX' } satisfies Partial<OnchainError>);
  });

  it('reads payment state at one block and uses that block timestamp', async () => {
    const wallet = new TestWallet();
    wallet.account = agent;
    const { coordinator, publicRpc } = await connected({ wallet });
    const prepared = await coordinator.prepareExecute({ owner, merchant, amount: 25_000_000n, externalReference: reference });

    expect(prepared.snapshot).toEqual(block);
    expect(publicRpc.observedReadBlocks.every((number) => number === block.number)).toBe(true);
    expect(prepared.role).toBe('agent');
    expect(prepared.payment?.state).toEqual({
      policy: {
        agent,
        perPaymentLimit: 50_000_000n,
        dailyLimit: 100_000_000n,
        expiresAt: block.timestamp + 1_000n,
        paused: false,
        revoked: false,
        revision: 1n,
      },
      merchantAllowed: true,
      referenceUsed: false,
      dailySpend: { day: block.timestamp / 86_400n, spent: 10_000_000n },
    });
  });

  it('denies payment preparation unless the connected account is the configured agent', async () => {
    const { coordinator, wallet } = await connected();
    await expect(coordinator.prepareExecute({ owner, merchant, amount: 1n, externalReference: reference }))
      .rejects.toMatchObject({ code: 'ROLE_DENIED' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it('sends exactly the simulated builder-suffixed request after explicit confirmation', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    const prepared = await coordinator.prepareConfigure({ agent, perPaymentLimit: 20_000_000n, dailyLimit: 50_000_000n, expiresAt: block.timestamp + 500n });
    const result = await coordinator.confirm(prepared, { approved: true });

    expect(result.status).toBe('sent');
    expect(publicRpc.simulations).toHaveLength(1);
    expect(wallet.sent).toHaveLength(1);
    expect(wallet.sent[0]?.data).toBe(publicRpc.simulations[0]?.request.data);
    expect(wallet.sent[0]?.to).toBe(publicRpc.simulations[0]?.request.to);
    expect(wallet.sent[0]?.data.endsWith(builderCodeSuffix.slice(2))).toBe(true);
  });

  it('does not send when confirmation is denied or the prepared session is stale', async () => {
    let now = 1_000;
    const { coordinator, wallet } = await connected({ now: () => now });
    const denied = await coordinator.prepareConfigure({ agent, perPaymentLimit: 1n, dailyLimit: 2n, expiresAt: block.timestamp + 10n });
    expect(await coordinator.confirm(denied, { approved: false })).toEqual({ status: 'cancelled' });

    const stale = await coordinator.prepareRevoke();
    now += 121_000;
    await expect(coordinator.confirm(stale, { approved: true })).rejects.toMatchObject({ code: 'SESSION_STALE' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it('consumes each prepared operation once, including after wallet rejection', async () => {
    const { coordinator, wallet } = await connected();
    const operation = await coordinator.prepareRevoke();
    wallet.rejectNext = true;
    await expect(coordinator.confirm(operation, { approved: true })).rejects.toMatchObject({ code: 'USER_REJECTED' } satisfies Partial<OnchainError>);
    await expect(coordinator.confirm(operation, { approved: true })).rejects.toMatchObject({ code: 'SESSION_STALE' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it.each(['account', 'chain'] as const)('rechecks %s immediately before sending', async (change) => {
    const { coordinator, wallet } = await connected();
    const prepared = await coordinator.prepareConfigure({ agent, perPaymentLimit: 1n, dailyLimit: 2n, expiresAt: block.timestamp + 10n });
    if (change === 'account') wallet.account = other;
    else wallet.chainId = 8453;

    await expect(coordinator.confirm(prepared, { approved: true })).rejects.toMatchObject({ code: 'SESSION_STALE' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it('invalidates the session on wallet events', async () => {
    const { coordinator, wallet } = await connected();
    const prepared = await coordinator.prepareRevoke();
    wallet.emit('accountsChanged', [other]);
    expect(coordinator.getState().status).toBe('invalidated');
    await expect(coordinator.confirm(prepared, { approved: true })).rejects.toMatchObject({ code: 'SESSION_STALE' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it('submits one bounded approval per confirmation and enforces zero first', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    publicRpc.allowance = 7n;
    const zero = await coordinator.prepareApprove({ amount: 10n });
    expect(zero.approval).toEqual({ step: 'zero', desiredAmount: 10n, observedAllowance: 7n });
    const decodedZero = decodeFunctionData({ abi: erc20ApproveAbi, data: zero.request.data.slice(0, -builderCodeSuffix.slice(2).length) as Hex });
    expect(decodedZero.args?.[1]).toBe(0n);
    const result = await coordinator.confirm(zero, { approved: true });
    expect(wallet.sent).toHaveLength(1);
    expect(result.status === 'sent' ? result.followUp : undefined).toEqual({ kind: 'approve', amount: 10n });

    publicRpc.allowance = 0n;
    const set = await coordinator.prepareApprove({ amount: 10n });
    expect(set.approval).toEqual({ step: 'set', desiredAmount: 10n, observedAllowance: 0n });
    expect(() => coordinator.prepareApprove({ amount: MAX_TESTNET_APPROVAL_AMOUNT + 1n })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('does not sign a redundant nonzero approval', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    publicRpc.allowance = 10n;

    await expect(coordinator.prepareApprove({ amount: 10n }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it.each([
    ['increase', 7n, 10n],
    ['decrease', 10n, 7n],
  ] as const)('resets every existing nonzero allowance before a nonzero %s', async (_label, current, desired) => {
    const { coordinator, publicRpc } = await connected();
    publicRpc.allowance = current;

    const operation = await coordinator.prepareApprove({ amount: desired });
    const decoded = decodeFunctionData({
      abi: erc20ApproveAbi,
      data: operation.request.data.slice(0, -builderCodeSuffix.slice(2).length) as Hex,
    });
    expect(operation.approval).toEqual({ step: 'zero', desiredAmount: desired, observedAllowance: current });
    expect(decoded.args?.[1]).toBe(0n);
  });

  it('normalizes wallet rejection without leaking provider text', async () => {
    const { coordinator, wallet } = await connected();
    const prepared = await coordinator.prepareConfigure({ agent, perPaymentLimit: 1n, dailyLimit: 2n, expiresAt: block.timestamp + 10n });
    wallet.rejectNext = true;
    const error = await coordinator.confirm(prepared, { approved: true }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'USER_REJECTED' } satisfies Partial<OnchainError>);
    expect((error as Error).message).not.toContain(owner);
    expect(wallet.sent).toHaveLength(0);
  });

  it('rechecks the wallet again after simulation and before the signature request', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    let release!: () => void;
    publicRpc.simulationGate = new Promise<void>((resolve) => { release = resolve; });
    const prepared = await coordinator.prepareRevoke();
    const confirmation = coordinator.confirm(prepared, { approved: true });
    while (publicRpc.simulations.length === 0) await Promise.resolve();
    wallet.account = other;
    release();

    await expect(confirmation).rejects.toMatchObject({ code: 'SESSION_STALE' } satisfies Partial<OnchainError>);
    expect(wallet.sent).toHaveLength(0);
  });

  it('allows only one operation at a time and never retries', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    let release!: () => void;
    publicRpc.simulationGate = new Promise<void>((resolve) => { release = resolve; });
    const first = await coordinator.prepareConfigure({ agent, perPaymentLimit: 1n, dailyLimit: 2n, expiresAt: block.timestamp + 10n });
    const second = await coordinator.prepareConfigure({ agent, perPaymentLimit: 2n, dailyLimit: 3n, expiresAt: block.timestamp + 10n });
    const inFlight = coordinator.confirm(first, { approved: true });
    await Promise.resolve();
    await expect(coordinator.confirm(second, { approved: true })).rejects.toMatchObject({ code: 'BUSY' } satisfies Partial<OnchainError>);
    release();
    await inFlight;
    expect(wallet.sent).toHaveLength(1);
  });

  it('re-runs payment preflight at the confirmation block and does not send stale authority', async () => {
    const wallet = new TestWallet();
    wallet.account = agent;
    const { coordinator, publicRpc } = await connected({ wallet });
    const operation = await coordinator.prepareExecute({ owner, merchant, amount: 1n, externalReference: reference });
    publicRpc.policyAgent = other;

    await expect(coordinator.confirm(operation, { approved: true })).rejects.toMatchObject({ code: 'ROLE_DENIED' } satisfies Partial<OnchainError>);
    expect(publicRpc.simulations).toHaveLength(0);
    expect(wallet.sent).toHaveLength(0);
  });

  it('re-reads allowance at confirmation and does not send a stale approval', async () => {
    const { coordinator, wallet, publicRpc } = await connected();
    publicRpc.allowance = 3n;
    const operation = await coordinator.prepareApprove({ amount: 5n });
    publicRpc.allowance = 4n;

    await expect(coordinator.confirm(operation, { approved: true })).rejects.toMatchObject({ code: 'SNAPSHOT_STALE' } satisfies Partial<OnchainError>);
    expect(publicRpc.simulations).toHaveLength(0);
    expect(wallet.sent).toHaveLength(0);
  });

  it('treats zero allowance as the final revocation step without a follow-up transaction', async () => {
    const { coordinator, publicRpc } = await connected();
    publicRpc.allowance = 9n;
    const operation = await coordinator.prepareApprove({ amount: 0n });
    expect(operation.approval).toEqual({ step: 'set', desiredAmount: 0n, observedAllowance: 9n });
    const result = await coordinator.confirm(operation, { approved: true });
    expect(result.status === 'sent' ? result.followUp : undefined).toBeUndefined();
  });
});

import {
  buildApproveStablecoin,
  buildConfigurePolicy,
  buildExecutePayment,
  buildRevokePolicy,
  buildSetMerchant,
  buildSetPolicyPaused,
  preflightPayment,
  verifyPaymentReceipt,
  type GuardPolicy,
  type VerifiedPaymentReceipt,
} from '@base-agent-payment-guard/sdk';
import { getAddress, isHex, type Address, type Hex } from 'viem';
import { BASE_SEPOLIA_DEPLOYMENT } from '../deployment';
import { BASE_BUILDER_CODE_SUFFIX } from './attribution';
import { verifyBaseSepoliaDeployment, type BlockSnapshot, type DeploymentVerification } from './deployment';
import { normalizeOnchainError, OnchainError } from './errors';
import type { PublicRpcClient } from './types';

export const MAX_TESTNET_APPROVAL_AMOUNT = 1_000_000_000n;
export const PREPARED_OPERATION_LIFETIME_MS = 120_000;

export type OperationKind = 'configure' | 'approve' | 'merchant' | 'pause' | 'revoke' | 'execute';
export type OperationRole = 'owner' | 'agent';

export interface WalletTransactionRequest {
  readonly from: Address;
  readonly to: Address;
  readonly data: Hex;
  readonly value: '0x0';
  readonly chainId: '0x14a34';
}

export interface WalletProvider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
  on?(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (value: unknown) => void): void;
  removeListener?(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (value: unknown) => void): void;
}

export interface WalletSession {
  readonly account: Address;
  readonly chainId: 84532;
  readonly generation: number;
  readonly deployment: DeploymentVerification;
}

export interface PreparedOperation {
  readonly id: string;
  readonly kind: OperationKind;
  readonly role: OperationRole;
  readonly account: Address;
  readonly chainId: 84532;
  readonly generation: number;
  readonly preparedAt: number;
  readonly expiresAt: number;
  readonly request: Readonly<{ account: Address; chainId: 84532; to: Address; data: Hex; value: 0n }>;
  readonly snapshot: BlockSnapshot;
  readonly approval?: Readonly<{ step: 'zero' | 'set'; desiredAmount: bigint; observedAllowance: bigint }>;
  readonly payment?: Readonly<{
    owner: Address;
    merchant: Address;
    amount: bigint;
    externalReference: Hex;
    state: Readonly<{
      policy: GuardPolicy;
      merchantAllowed: boolean;
      referenceUsed: boolean;
      dailySpend: Readonly<{ day: bigint; spent: bigint }>;
    }>;
  }>;
}

export interface OperationResult {
  readonly status: 'sent';
  readonly transactionHash: Hex;
  readonly followUp?: Readonly<{ kind: 'approve'; amount: bigint }>;
}

export type ConfirmationResult = OperationResult | Readonly<{ status: 'cancelled' }>;

export type CoordinatorState =
  | Readonly<{ status: 'disconnected'; writesEnabled: false; reason: string }>
  | Readonly<{ status: 'connecting'; writesEnabled: false; reason: string }>
  | Readonly<{ status: 'ready'; writesEnabled: boolean; reason?: string; session: WalletSession }>
  | Readonly<{ status: 'invalidated'; writesEnabled: false; reason: string }>;

export interface TransactionCoordinator {
  connect(): Promise<WalletSession>;
  subscribe(listener: (state: CoordinatorState) => void): () => void;
  getState(): CoordinatorState;
  dispose(): void;
  prepareConfigure(params: { readonly agent: Address; readonly perPaymentLimit: bigint; readonly dailyLimit: bigint; readonly expiresAt: bigint }): Promise<PreparedOperation>;
  prepareApprove(params: { readonly amount: bigint }): Promise<PreparedOperation>;
  prepareSetMerchant(params: { readonly merchant: Address; readonly allowed: boolean }): Promise<PreparedOperation>;
  preparePause(params: { readonly paused: boolean }): Promise<PreparedOperation>;
  prepareRevoke(): Promise<PreparedOperation>;
  prepareExecute(params: { readonly owner: Address; readonly merchant: Address; readonly amount: bigint; readonly externalReference: Hex }): Promise<PreparedOperation>;
  confirm(prepared: PreparedOperation, decision: { readonly approved: boolean }): Promise<ConfirmationResult>;
  verifyReceipt(transactionHash: Hex, logIndex: number, requiredConfirmations: bigint): Promise<VerifiedPaymentReceipt | undefined>;
}

export interface CoordinatorOptions {
  readonly publicClient: PublicRpcClient;
  readonly walletProvider: WalletProvider;
  /** Test/adapter override. The default is derived from the hard-pinned public BASE_BUILDER_CODE. */
  readonly builderCodeSuffix?: Hex;
  readonly now?: () => number;
}

const sameAddress = (left: Address, right: Address) => left.toLowerCase() === right.toLowerCase();

function validatedSuffix(value: Hex | undefined): Hex | undefined {
  if (!value || value === '0x' || !isHex(value, { strict: true }) || !value.toLowerCase().endsWith('80218021802180218021802180218021')) return undefined;
  return value.toLowerCase() === BASE_BUILDER_CODE_SUFFIX.toLowerCase() ? value : undefined;
}

function appendSuffix(data: Hex, suffix: Hex): Hex {
  if (data.toLowerCase().endsWith(suffix.slice(2).toLowerCase())) {
    throw new OnchainError('INVALID_INPUT', 'Builder attribution must be appended exactly once.');
  }
  return `${data}${suffix.slice(2)}` as Hex;
}

function parseChainId(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new OnchainError('SESSION_STALE', 'The wallet returned an invalid chain.');
  return Number.parseInt(value.slice(2), 16);
}

function transactionRequest(prepared: PreparedOperation): WalletTransactionRequest {
  return { from: prepared.account, to: prepared.request.to, data: prepared.request.data, value: '0x0', chainId: '0x14a34' };
}

export function createTransactionCoordinator(options: CoordinatorOptions): TransactionCoordinator {
  const now = options.now ?? Date.now;
  const suffix = validatedSuffix(options.builderCodeSuffix === undefined ? BASE_BUILDER_CODE_SUFFIX : options.builderCodeSuffix);
  const listeners = new Set<(state: CoordinatorState) => void>();
  let state: CoordinatorState = { status: 'disconnected', writesEnabled: false, reason: 'Connect a wallet to continue.' };
  let generation = 0;
  let sequence = 0;
  let busy = false;
  let disposed = false;
  const issuedOperations = new WeakSet<object>();
  const consumedOperations = new WeakSet<object>();

  const publish = (next: CoordinatorState) => {
    state = Object.freeze(next);
    for (const listener of listeners) listener(state);
  };
  const invalidate = () => {
    generation += 1;
    publish({ status: 'invalidated', writesEnabled: false, reason: 'The wallet account or chain changed. Reconnect and verify again.' });
  };
  const eventListeners = {
    accountsChanged: () => invalidate(),
    chainChanged: () => invalidate(),
    disconnect: () => invalidate(),
  } as const;

  options.walletProvider.on?.('accountsChanged', eventListeners.accountsChanged);
  options.walletProvider.on?.('chainChanged', eventListeners.chainChanged);
  options.walletProvider.on?.('disconnect', eventListeners.disconnect);

  function ready(): WalletSession {
    if (disposed || state.status !== 'ready') throw new OnchainError('NOT_CONNECTED', 'Connect and verify the wallet before preparing a transaction.');
    if (!state.writesEnabled || !suffix) throw new OnchainError('MISSING_BUILDER_SUFFIX', 'A verified Base Builder Code suffix is required before wallet writes are enabled.');
    return state.session;
  }

  async function currentSnapshot(): Promise<BlockSnapshot> {
    const snapshot = await options.publicClient.getLatestBlock();
    const canonical = await options.publicClient.getBlock(snapshot.number);
    if (canonical.hash.toLowerCase() !== snapshot.hash.toLowerCase() || canonical.timestamp !== snapshot.timestamp) {
      throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC snapshot changed. Prepare the operation again.');
    }
    return Object.freeze(snapshot);
  }

  async function assertWalletSession(operation: PreparedOperation): Promise<void> {
    const accounts = await options.walletProvider.request({ method: 'eth_accounts' });
    const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? getAddress(accounts[0]) : undefined;
    const chainId = parseChainId(await options.walletProvider.request({ method: 'eth_chainId' }));
    if (!account || !sameAddress(account, operation.account) || chainId !== operation.chainId || operation.generation !== generation) {
      invalidate();
      throw new OnchainError('SESSION_STALE', 'The wallet account or chain changed before signing.');
    }
  }

  function prepared(kind: OperationKind, role: OperationRole, session: WalletSession, request: Omit<PreparedOperation['request'], 'data'> & { readonly data: Hex }, snapshot: BlockSnapshot, approval?: PreparedOperation['approval'], payment?: PreparedOperation['payment']): PreparedOperation {
    const preparedAt = now();
    const frozenPayment = payment
      ? Object.freeze({
          ...payment,
          state: Object.freeze({
            ...payment.state,
            policy: Object.freeze({ ...payment.state.policy }),
            dailySpend: Object.freeze({ ...payment.state.dailySpend }),
          }),
        })
      : undefined;
    const operation = Object.freeze({
      id: `${generation}:${++sequence}`,
      kind,
      role,
      account: session.account,
      chainId: BASE_SEPOLIA_DEPLOYMENT.chainId,
      generation: session.generation,
      preparedAt,
      expiresAt: preparedAt + PREPARED_OPERATION_LIFETIME_MS,
      request: Object.freeze({ ...request, data: appendSuffix(request.data, suffix!) }),
      snapshot,
      ...(approval ? { approval: Object.freeze(approval) } : {}),
      ...(frozenPayment ? { payment: frozenPayment } : {}),
    });
    issuedOperations.add(operation);
    return operation;
  }

  async function ownerOperation(kind: OperationKind, builder: () => { readonly to: Address; readonly data: Hex; readonly value: 0n }, approval?: PreparedOperation['approval']): Promise<PreparedOperation> {
    const session = ready();
    const snapshot = await currentSnapshot();
    const built = builder();
    return prepared(kind, 'owner', session, { account: session.account, chainId: 84532, to: built.to, data: built.data, value: 0n }, snapshot, approval);
  }

  return {
    async connect() {
      if (disposed) throw new OnchainError('NOT_CONNECTED', 'This wallet session has been disposed.');
      publish({ status: 'connecting', writesEnabled: false, reason: 'Verifying Base Sepolia deployment and wallet session.' });
      try {
        const deployment = await verifyBaseSepoliaDeployment(options.publicClient);
        const accounts = await options.walletProvider.request({ method: 'eth_requestAccounts' });
        const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? getAddress(accounts[0]) : undefined;
        const chainId = parseChainId(await options.walletProvider.request({ method: 'eth_chainId' }));
        if (!account || chainId !== BASE_SEPOLIA_DEPLOYMENT.chainId) throw new OnchainError('SESSION_STALE', 'Connect the wallet to Base Sepolia and select one account.');
        generation += 1;
        const session = Object.freeze({ account, chainId: 84532 as const, generation, deployment });
        publish(suffix
          ? { status: 'ready', writesEnabled: true, session }
          : { status: 'ready', writesEnabled: false, reason: 'The verified Base Builder Code suffix is missing.', session });
        return session;
      } catch (error) {
        publish({ status: 'disconnected', writesEnabled: false, reason: 'Wallet connection or deployment verification failed.' });
        throw normalizeOnchainError(error);
      }
    },

    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    getState() { return state; },
    dispose() {
      disposed = true;
      options.walletProvider.removeListener?.('accountsChanged', eventListeners.accountsChanged);
      options.walletProvider.removeListener?.('chainChanged', eventListeners.chainChanged);
      options.walletProvider.removeListener?.('disconnect', eventListeners.disconnect);
      listeners.clear();
      invalidate();
    },

    prepareConfigure(params) {
      return ownerOperation('configure', () => buildConfigurePolicy({ chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard, ...params }));
    },
    async prepareApprove(params) {
      if (typeof params.amount !== 'bigint' || params.amount < 0n || params.amount > MAX_TESTNET_APPROVAL_AMOUNT) {
        throw new OnchainError('INVALID_INPUT', `Testnet approval must be between zero and ${MAX_TESTNET_APPROVAL_AMOUNT} base units.`);
      }
      const session = ready();
      const snapshot = await currentSnapshot();
      const current = await options.publicClient.readAllowance(session.account, BASE_SEPOLIA_DEPLOYMENT.guard, snapshot.number);
      if (params.amount !== 0n && current === params.amount) {
        throw new OnchainError('INVALID_INPUT', 'The exact USDC allowance is already set. No approval transaction is needed.');
      }
      const step = params.amount !== 0n && current !== 0n ? 'zero' : 'set';
      const amount = step === 'zero' ? 0n : params.amount;
      const built = buildApproveStablecoin({ chainId: 84532, token: BASE_SEPOLIA_DEPLOYMENT.stablecoin, guard: BASE_SEPOLIA_DEPLOYMENT.guard, amount });
      return prepared('approve', 'owner', session, {
        account: session.account, chainId: 84532, to: built.to, data: built.data, value: 0n,
      }, snapshot, { step, desiredAmount: params.amount, observedAllowance: current });
    },
    prepareSetMerchant(params) {
      return ownerOperation('merchant', () => buildSetMerchant({ chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard, owner: ready().account, ...params }));
    },
    preparePause(params) {
      return ownerOperation('pause', () => buildSetPolicyPaused({ chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard, paused: params.paused }));
    },
    prepareRevoke() {
      return ownerOperation('revoke', () => buildRevokePolicy({ chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard }));
    },
    async prepareExecute(params) {
      const session = ready();
      const snapshot = await currentSnapshot();
      const [policy, merchantAllowed, referenceUsed, dailySpend] = await Promise.all([
        options.publicClient.readPolicy(params.owner, snapshot.number),
        options.publicClient.readMerchantAllowed(params.owner, params.merchant, snapshot.number),
        options.publicClient.readReferenceUsed(params.owner, params.externalReference, snapshot.number),
        options.publicClient.readDailySpend(params.owner, snapshot.number),
      ]);
      if (!sameAddress(session.account, policy.agent)) throw new OnchainError('ROLE_DENIED', 'Only the policy agent can execute this payment.');
      const decision = preflightPayment({
        chainId: 84532,
        owner: params.owner,
        caller: session.account,
        merchant: params.merchant,
        amount: params.amount,
        externalReference: params.externalReference,
        now: snapshot.timestamp,
      }, { policy, merchantAllowed, spentToday: dailySpend.spent, referenceUsed });
      if (decision.decision !== 'allow') throw new OnchainError('ROLE_DENIED', `Payment preflight denied: ${decision.denialRuleIds.join(', ')}.`);
      const request = buildExecutePayment({ chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard, ...params });
      return prepared('execute', 'agent', session, {
        account: session.account, chainId: 84532, to: request.to, data: request.data, value: 0n,
      }, snapshot, undefined, {
        ...params,
        state: { policy, merchantAllowed, referenceUsed, dailySpend },
      });
    },

    async confirm(operation, decision) {
      if (!operation || typeof operation !== 'object' || !issuedOperations.has(operation) || consumedOperations.has(operation)) {
        throw new OnchainError('SESSION_STALE', 'The prepared operation is unknown or was already used. Prepare it again.');
      }
      consumedOperations.add(operation);
      if (!decision.approved) return { status: 'cancelled' };
      if (busy) throw new OnchainError('BUSY', 'Another wallet operation is in progress.');
      if (operation.generation !== generation || now() > operation.expiresAt) {
        throw new OnchainError('SESSION_STALE', 'The prepared operation expired or belongs to an old wallet session.');
      }
      const session = ready();
      if (operation.generation !== session.generation) {
        throw new OnchainError('SESSION_STALE', 'The prepared operation expired or belongs to an old wallet session.');
      }
      busy = true;
      try {
        await assertWalletSession(operation);
        const deployment = await verifyBaseSepoliaDeployment(options.publicClient);
        const freshSnapshot = deployment.block;
        if (operation.approval) {
          const allowance = await options.publicClient.readAllowance(operation.account, BASE_SEPOLIA_DEPLOYMENT.guard, freshSnapshot.number);
          if (allowance !== operation.approval.observedAllowance) {
            throw new OnchainError('SNAPSHOT_STALE', 'The USDC allowance changed. Prepare the approval again.');
          }
        }
        if (operation.payment) {
          const payment = operation.payment;
          const [policy, merchantAllowed, referenceUsed, dailySpend] = await Promise.all([
            options.publicClient.readPolicy(payment.owner, freshSnapshot.number),
            options.publicClient.readMerchantAllowed(payment.owner, payment.merchant, freshSnapshot.number),
            options.publicClient.readReferenceUsed(payment.owner, payment.externalReference, freshSnapshot.number),
            options.publicClient.readDailySpend(payment.owner, freshSnapshot.number),
          ]);
          if (!sameAddress(operation.account, policy.agent)) throw new OnchainError('ROLE_DENIED', 'Only the current policy agent can execute this payment.');
          const preflight = preflightPayment({
            chainId: 84532,
            owner: payment.owner,
            caller: operation.account,
            merchant: payment.merchant,
            amount: payment.amount,
            externalReference: payment.externalReference,
            now: freshSnapshot.timestamp,
          }, { policy, merchantAllowed, spentToday: dailySpend.spent, referenceUsed });
          if (preflight.decision !== 'allow') throw new OnchainError('SNAPSHOT_STALE', `Fresh payment preflight denied: ${preflight.denialRuleIds.join(', ')}.`);
        }
        await options.publicClient.simulateTransaction(operation.request, freshSnapshot.number);
        await assertWalletSession(operation);
        const hash = await options.walletProvider.request({ method: 'eth_sendTransaction', params: [transactionRequest(operation)] });
        if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new OnchainError('WALLET_ERROR', 'The wallet did not return a transaction hash.');
        const followUp = operation.approval?.step === 'zero'
          ? { kind: 'approve' as const, amount: operation.approval.desiredAmount }
          : undefined;
        return Object.freeze({ status: 'sent' as const, transactionHash: hash as Hex, ...(followUp ? { followUp } : {}) });
      } catch (error) {
        throw normalizeOnchainError(error);
      } finally {
        busy = false;
      }
    },

    verifyReceipt(transactionHash, logIndex, requiredConfirmations) {
      return verifyPaymentReceipt({
        client: options.publicClient,
        domain: { chainId: 84532, guard: BASE_SEPOLIA_DEPLOYMENT.guard },
        transactionHash,
        logIndex,
        requiredConfirmations,
      });
    },
  };
}

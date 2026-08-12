import type { Address, Hex } from 'viem';
import { decodeEventLog, encodeAbiParameters, getAddress, isAddress, keccak256, parseAbiParameters, zeroAddress } from 'viem';
import { baseAgentPaymentGuardAbi } from './abi.js';
import { isSupportedChainId, type SupportedChainId } from './chains.js';

export interface ReceiptDomain {
  readonly chainId: SupportedChainId;
  readonly guard: Address;
}

export interface PaymentReceiptIdInput extends ReceiptDomain {
  readonly owner: Address;
  readonly agent: Address;
  readonly merchant: Address;
  readonly amount: bigint;
  readonly externalReference: Hex;
  readonly policyRevision: bigint;
}

export interface RpcReceiptLog {
  readonly address: Address;
  readonly data: Hex;
  readonly topics: readonly Hex[];
  readonly transactionHash: Hex | null;
  readonly blockHash: Hex | null;
  readonly blockNumber: bigint | null;
  readonly logIndex: number | null;
  readonly removed: boolean;
}

export interface RpcTransactionReceiptEvidence {
  readonly transactionHash: Hex;
  readonly blockHash: Hex;
  readonly blockNumber: bigint;
  readonly status: 'success' | 'reverted';
  readonly logs: readonly RpcReceiptLog[];
}

/**
 * Adapt a chain-pinned, trusted RPC client to this minimal interface.
 * The verifier trusts these responses; it does not validate receipt-trie proofs.
 */
export interface ReceiptEvidenceClient {
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { readonly hash: Hex }): Promise<RpcTransactionReceiptEvidence>;
  getBlockNumber(): Promise<bigint>;
}

export interface ReceiptVerificationEvidence {
  readonly source: 'trusted-rpc-transaction-receipt';
  readonly status: 'success';
  readonly latestBlockNumber: bigint;
  readonly confirmations: bigint;
  readonly requiredConfirmations: bigint;
}

interface PaymentReceiptFields extends PaymentReceiptIdInput {
  readonly receiptId: Hex;
  readonly day: bigint;
  readonly spentToday: bigint;
  readonly transactionHash: Hex;
  readonly blockHash: Hex;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly verification: ReceiptVerificationEvidence;
}

const verifiedPaymentReceiptBrand: unique symbol = Symbol('VerifiedPaymentReceipt');

/**
 * An in-process receipt created only by verifyPaymentReceipt.
 * Copying or serializing this object removes its runtime verification identity.
 */
export type VerifiedPaymentReceipt = Readonly<PaymentReceiptFields & {
  readonly [verifiedPaymentReceiptBrand]: true;
}>;

export interface ReceiptMetrics extends ReceiptDomain {
  readonly paymentCount: number;
  readonly uniqueOwners: number;
  readonly uniqueAgents: number;
  readonly uniqueMerchants: number;
  readonly totalAmount: bigint;
  readonly rejectedCount: number;
}

export interface VerifyPaymentReceiptInput {
  readonly client: ReceiptEvidenceClient;
  readonly domain: ReceiptDomain;
  readonly transactionHash: Hex;
  readonly logIndex: number;
  readonly requiredConfirmations: bigint;
}

const verifiedReceiptObjects = new WeakSet<object>();
const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

const notZeroAddress = (value: unknown): value is Address => (
  typeof value === 'string'
  && isAddress(value)
  && value.toLowerCase() !== zeroAddress
);

const isHexValue = (value: unknown): value is Hex => (
  typeof value === 'string'
  && /^0x(?:[0-9a-f]{2})*$/i.test(value)
);

const isHex32 = (value: unknown): value is Hex => (
  typeof value === 'string'
  && /^0x[0-9a-f]{64}$/i.test(value)
);

const notZeroHex32 = (value: unknown): value is Hex => (
  isHex32(value) && !/^0x0{64}$/i.test(value)
);

const sameHex = (left: unknown, right: unknown) => (
  typeof left === 'string'
  && typeof right === 'string'
  && left.toLowerCase() === right.toLowerCase()
);

function normalizeReceiptDomain(domain: ReceiptDomain): ReceiptDomain | undefined {
  try {
    if (!domain || !isSupportedChainId(domain.chainId) || !notZeroAddress(domain.guard)) return undefined;
    return { chainId: domain.chainId, guard: getAddress(domain.guard) };
  } catch {
    return undefined;
  }
}

export function computePaymentReceiptId(receipt: PaymentReceiptIdInput): Hex {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('address, uint256, address, address, address, uint256, bytes32, uint64'),
    [receipt.guard, BigInt(receipt.chainId), receipt.owner, receipt.agent, receipt.merchant, receipt.amount, receipt.externalReference, receipt.policyRevision],
  ));
}

function decodeReceiptFields(log: RpcReceiptLog, domain: ReceiptDomain): Omit<PaymentReceiptFields, 'transactionHash' | 'blockHash' | 'blockNumber' | 'logIndex' | 'verification'> | undefined {
  try {
    if (getAddress(log.address) !== domain.guard
      || !isHexValue(log.data)
      || log.data.length !== 386
      || !Array.isArray(log.topics)
      || log.topics.length !== 4
      || !log.topics.every(isHex32)) return undefined;
    const decoded = decodeEventLog({
      abi: baseAgentPaymentGuardAbi,
      eventName: 'PaymentExecuted',
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    });
    const args = decoded.args;
    return {
      chainId: domain.chainId,
      guard: domain.guard,
      receiptId: args.receiptId,
      owner: getAddress(args.owner),
      agent: getAddress(args.agent),
      merchant: getAddress(args.merchant),
      amount: args.amount,
      externalReference: args.externalReference,
      day: args.day,
      spentToday: args.spentToday,
      policyRevision: args.policyRevision,
    };
  } catch {
    return undefined;
  }
}

function isValidPaymentReceipt(receipt: PaymentReceiptFields): boolean {
  try {
    const verification = receipt.verification;
    return isSupportedChainId(receipt.chainId)
      && notZeroAddress(receipt.guard)
      && notZeroAddress(receipt.owner)
      && notZeroAddress(receipt.agent)
      && notZeroAddress(receipt.merchant)
      && receipt.owner.toLowerCase() !== receipt.merchant.toLowerCase()
      && typeof receipt.amount === 'bigint' && receipt.amount > 0n && receipt.amount <= UINT256_MAX
      && typeof receipt.day === 'bigint' && receipt.day >= 0n && receipt.day <= UINT64_MAX
      && typeof receipt.spentToday === 'bigint' && receipt.spentToday >= receipt.amount && receipt.spentToday <= UINT256_MAX
      && typeof receipt.policyRevision === 'bigint' && receipt.policyRevision > 0n && receipt.policyRevision <= UINT64_MAX
      && typeof receipt.blockNumber === 'bigint' && receipt.blockNumber >= 0n
      && Number.isSafeInteger(receipt.logIndex) && receipt.logIndex >= 0
      && notZeroHex32(receipt.externalReference)
      && notZeroHex32(receipt.transactionHash)
      && notZeroHex32(receipt.blockHash)
      && notZeroHex32(receipt.receiptId)
      && verification?.source === 'trusted-rpc-transaction-receipt'
      && verification.status === 'success'
      && typeof verification.latestBlockNumber === 'bigint'
      && typeof verification.confirmations === 'bigint'
      && typeof verification.requiredConfirmations === 'bigint'
      && verification.requiredConfirmations > 0n
      && verification.latestBlockNumber >= receipt.blockNumber
      && verification.confirmations === verification.latestBlockNumber - receipt.blockNumber + 1n
      && verification.confirmations >= verification.requiredConfirmations
      && computePaymentReceiptId(receipt) === receipt.receiptId;
  } catch {
    return false;
  }
}

/**
 * Verifies receipt shape, explicit Base domain, successful transaction status,
 * matching log provenance, and caller-selected confirmation depth against a
 * trusted RPC client. This is not a cryptographic receipt-inclusion proof.
 */
export async function verifyPaymentReceipt(input: VerifyPaymentReceiptInput): Promise<VerifiedPaymentReceipt | undefined> {
  const domain = normalizeReceiptDomain(input.domain);
  if (!domain || !notZeroHex32(input.transactionHash) || !Number.isSafeInteger(input.logIndex) || input.logIndex < 0) return undefined;
  if (typeof input.requiredConfirmations !== 'bigint' || input.requiredConfirmations <= 0n) return undefined;

  try {
    const observedChainId = await input.client.getChainId();
    if (observedChainId !== domain.chainId) return undefined;

    const transactionReceipt = await input.client.getTransactionReceipt({ hash: input.transactionHash });
    if (transactionReceipt.status !== 'success'
      || !sameHex(transactionReceipt.transactionHash, input.transactionHash)
      || !notZeroHex32(transactionReceipt.transactionHash)
      || !notZeroHex32(transactionReceipt.blockHash)
      || typeof transactionReceipt.blockNumber !== 'bigint'
      || transactionReceipt.blockNumber < 0n
      || !Array.isArray(transactionReceipt.logs)) return undefined;

    const matchingLogs = transactionReceipt.logs.filter(({ logIndex }) => logIndex === input.logIndex);
    if (matchingLogs.length !== 1) return undefined;
    const log = matchingLogs[0]!;
    if (log.removed !== false
      || !sameHex(log.transactionHash, transactionReceipt.transactionHash)
      || !sameHex(log.blockHash, transactionReceipt.blockHash)
      || log.blockNumber !== transactionReceipt.blockNumber
      || log.logIndex !== input.logIndex) return undefined;

    const latestBlockNumber = await input.client.getBlockNumber();
    if (typeof latestBlockNumber !== 'bigint' || latestBlockNumber < transactionReceipt.blockNumber) return undefined;
    const confirmations = latestBlockNumber - transactionReceipt.blockNumber + 1n;
    if (confirmations < input.requiredConfirmations) return undefined;

    const decoded = decodeReceiptFields(log, domain);
    if (!decoded) return undefined;
    const verification = Object.freeze<ReceiptVerificationEvidence>({
      source: 'trusted-rpc-transaction-receipt',
      status: 'success',
      latestBlockNumber,
      confirmations,
      requiredConfirmations: input.requiredConfirmations,
    });
    const verified = Object.freeze({
      ...decoded,
      transactionHash: transactionReceipt.transactionHash,
      blockHash: transactionReceipt.blockHash,
      blockNumber: transactionReceipt.blockNumber,
      logIndex: input.logIndex,
      verification,
      [verifiedPaymentReceiptBrand]: true as const,
    });
    if (!isValidPaymentReceipt(verified)) return undefined;
    verifiedReceiptObjects.add(verified);
    return verified;
  } catch {
    return undefined;
  }
}

export function aggregateReceiptMetrics(domainInput: ReceiptDomain, receipts: readonly VerifiedPaymentReceipt[]): ReceiptMetrics {
  const domain = normalizeReceiptDomain(domainInput);
  if (!domain) throw new TypeError('Receipt metrics require an explicit supported Base chain and nonzero guard address.');

  const owners = new Set<string>();
  const agents = new Set<string>();
  const merchants = new Set<string>();
  const receiptIds = new Set<string>();
  const canonicalLogs = new Set<string>();
  let totalAmount = 0n;
  let rejectedCount = 0;

  for (const receipt of receipts) {
    if (!receipt
      || typeof receipt !== 'object'
      || !verifiedReceiptObjects.has(receipt)
      || receipt[verifiedPaymentReceiptBrand] !== true
      || !isValidPaymentReceipt(receipt)
      || receipt.chainId !== domain.chainId
      || receipt.guard.toLowerCase() !== domain.guard.toLowerCase()) {
      rejectedCount += 1;
      continue;
    }

    const receiptKey = receipt.receiptId.toLowerCase();
    const logKey = `${receipt.transactionHash.toLowerCase()}:${receipt.blockHash.toLowerCase()}:${receipt.logIndex}`;
    if (receiptIds.has(receiptKey) || canonicalLogs.has(logKey)) {
      rejectedCount += 1;
      continue;
    }

    receiptIds.add(receiptKey);
    canonicalLogs.add(logKey);
    owners.add(receipt.owner.toLowerCase());
    agents.add(receipt.agent.toLowerCase());
    merchants.add(receipt.merchant.toLowerCase());
    totalAmount += receipt.amount;
  }

  return {
    chainId: domain.chainId,
    guard: domain.guard,
    paymentCount: receiptIds.size,
    uniqueOwners: owners.size,
    uniqueAgents: agents.size,
    uniqueMerchants: merchants.size,
    totalAmount,
    rejectedCount,
  };
}

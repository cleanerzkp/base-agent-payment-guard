import { baseAgentPaymentGuardAbi, erc20ApproveAbi, type GuardPolicy, type RpcTransactionReceiptEvidence } from '@base-agent-payment-guard/sdk';
import { createPublicClient, getAddress, http, isAddress, keccak256, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { BASE_SEPOLIA_DEPLOYMENT } from '../deployment';
import { createTransactionCoordinator, type CoordinatorOptions, type TransactionCoordinator, type WalletProvider } from './coordinator';
import { OnchainError } from './errors';
import type { PublicRpcClient } from './types';

export const BASE_SEPOLIA_PUBLIC_RPC_URL = 'https://sepolia.base.org' as const;

const nonNullBlock = (block: { readonly number: bigint | null; readonly hash: Hex | null; readonly timestamp: bigint }) => {
  if (block.number === null || block.hash === null) throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned an incomplete block.');
  return Object.freeze({ number: block.number, hash: block.hash, timestamp: block.timestamp });
};

function policy(value: unknown): GuardPolicy {
  if (!value || typeof value !== 'object') throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed policy state.');
  const record = value as Record<string, unknown>;
  if (typeof record.agent !== 'string' || !isAddress(record.agent)
    || typeof record.perPaymentLimit !== 'bigint'
    || typeof record.dailyLimit !== 'bigint'
    || typeof record.expiresAt !== 'bigint'
    || typeof record.paused !== 'boolean'
    || typeof record.revoked !== 'boolean'
    || typeof record.revision !== 'bigint') {
    throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed policy state.');
  }
  return Object.freeze({
    agent: getAddress(record.agent),
    perPaymentLimit: record.perPaymentLimit,
    dailyLimit: record.dailyLimit,
    expiresAt: record.expiresAt,
    paused: record.paused,
    revoked: record.revoked,
    revision: record.revision,
  });
}

export function createBaseSepoliaPublicClient(): PublicRpcClient {
  const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_PUBLIC_RPC_URL) });
  return {
    getChainId: () => client.getChainId(),
    async getLatestBlock() { return nonNullBlock(await client.getBlock({ blockTag: 'latest' })); },
    async getBlock(blockNumber) { return nonNullBlock(await client.getBlock({ blockNumber })); },
    async getCodeIdentity(address, blockNumber) {
      const code = await client.getBytecode({ address, blockNumber });
      return { exists: !!code && code !== '0x', hash: keccak256(code ?? '0x') };
    },
    async readStablecoin(blockNumber) {
      return getAddress(await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.guard,
        abi: baseAgentPaymentGuardAbi,
        functionName: 'stablecoin',
        blockNumber,
      }));
    },
    async readPolicy(owner, blockNumber) {
      return policy(await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.guard,
        abi: baseAgentPaymentGuardAbi,
        functionName: 'getPolicy',
        args: [owner],
        blockNumber,
      }));
    },
    async readMerchantAllowed(owner, merchant, blockNumber) {
      const value = await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.guard,
        abi: baseAgentPaymentGuardAbi,
        functionName: 'isMerchantAllowed',
        args: [owner, merchant],
        blockNumber,
      });
      if (typeof value !== 'boolean') throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed merchant state.');
      return value;
    },
    async readReferenceUsed(owner, reference, blockNumber) {
      const value = await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.guard,
        abi: baseAgentPaymentGuardAbi,
        functionName: 'isReferenceUsed',
        args: [owner, reference],
        blockNumber,
      });
      if (typeof value !== 'boolean') throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed reference state.');
      return value;
    },
    async readDailySpend(owner, blockNumber) {
      const result = await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.guard,
        abi: baseAgentPaymentGuardAbi,
        functionName: 'getDailySpend',
        args: [owner],
        blockNumber,
      });
      const [day, spent] = result;
      if (typeof day !== 'bigint' || typeof spent !== 'bigint') throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed spend state.');
      return { day, spent };
    },
    async readAllowance(owner, spender, blockNumber) {
      const value = await client.readContract({
        address: BASE_SEPOLIA_DEPLOYMENT.stablecoin,
        abi: erc20ApproveAbi,
        functionName: 'allowance',
        args: [owner, spender],
        blockNumber,
      });
      if (typeof value !== 'bigint') throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC returned malformed allowance state.');
      return value;
    },
    async simulateTransaction(request, blockNumber) {
      await client.call({ account: request.account, to: request.to, data: request.data, value: request.value, blockNumber });
    },
    async getTransactionReceipt({ hash }): Promise<RpcTransactionReceiptEvidence> {
      const receipt = await client.getTransactionReceipt({ hash });
      return {
        transactionHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
          transactionHash: log.transactionHash,
          blockHash: log.blockHash,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
          removed: log.removed,
        })),
      };
    },
    getBlockNumber: () => client.getBlockNumber(),
  };
}

export interface BrowserWalletAdapterOptions {
  readonly publicClient?: PublicRpcClient;
  readonly walletProvider?: WalletProvider;
  readonly builderCodeSuffix?: Hex;
  readonly now?: () => number;
}

export function createBrowserWalletAdapter(options: BrowserWalletAdapterOptions = {}): TransactionCoordinator {
  const provider = options.walletProvider ?? (globalThis as { window?: { ethereum?: WalletProvider } }).window?.ethereum;
  if (!provider) throw new OnchainError('NOT_CONNECTED', 'No injected wallet was found.');
  const coordinatorOptions: CoordinatorOptions = {
    publicClient: options.publicClient ?? createBaseSepoliaPublicClient(),
    walletProvider: provider,
    ...(options.builderCodeSuffix !== undefined ? { builderCodeSuffix: options.builderCodeSuffix } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
  return createTransactionCoordinator(coordinatorOptions);
}

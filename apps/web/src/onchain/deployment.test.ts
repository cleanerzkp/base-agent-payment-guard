import { describe, expect, it } from 'vitest';
import { BASE_SEPOLIA_DEPLOYMENT } from '../deployment';
import { OnchainError } from './errors';
import { verifyBaseSepoliaDeployment, type PublicRpcClient } from './index';

const block = {
  number: 45_395_858n,
  hash: `0x${'ab'.repeat(32)}` as const,
  timestamp: 1_786_557_604n,
};

function client(overrides: Partial<PublicRpcClient> = {}): PublicRpcClient {
  const reads: bigint[] = [];
  return {
    async getChainId() { return 84532; },
    async getLatestBlock() { return block; },
    async getBlock(blockNumber) {
      expect(blockNumber).toBe(block.number);
      return block;
    },
    async getCodeIdentity(address, blockNumber) {
      reads.push(blockNumber);
      if (address.toLowerCase() === BASE_SEPOLIA_DEPLOYMENT.guard.toLowerCase()) {
        return { exists: true, hash: BASE_SEPOLIA_DEPLOYMENT.runtimeCodeHash };
      }
      return { exists: true, hash: `0x${'cd'.repeat(32)}` };
    },
    async readStablecoin(blockNumber) {
      reads.push(blockNumber);
      return BASE_SEPOLIA_DEPLOYMENT.stablecoin;
    },
    async readPolicy() { throw new Error('not used'); },
    async readMerchantAllowed() { throw new Error('not used'); },
    async readReferenceUsed() { throw new Error('not used'); },
    async readDailySpend() { throw new Error('not used'); },
    async readAllowance() { throw new Error('not used'); },
    async simulateTransaction() { throw new Error('not used'); },
    async getTransactionReceipt() { throw new Error('not used'); },
    async getBlockNumber() { return block.number; },
    ...overrides,
  };
}

describe('verifyBaseSepoliaDeployment', () => {
  it('pins chain, guard code hash, stablecoin and token code to one canonical block', async () => {
    const verified = await verifyBaseSepoliaDeployment(client());
    expect(verified).toEqual({
      ...BASE_SEPOLIA_DEPLOYMENT,
      block,
    });
  });

  it.each([
    ['wrong chain', { getChainId: async () => 8453 }],
    ['missing guard code', { getCodeIdentity: async () => ({ exists: false, hash: `0x${'00'.repeat(32)}` as const }) }],
    ['wrong guard code hash', { getCodeIdentity: async () => ({ exists: true, hash: `0x${'11'.repeat(32)}` as const }) }],
    ['wrong immutable token', { readStablecoin: async () => '0x1111111111111111111111111111111111111111' as const }],
    ['missing token code', {
      getCodeIdentity: async (address: string) => address.toLowerCase() === BASE_SEPOLIA_DEPLOYMENT.guard.toLowerCase()
        ? { exists: true, hash: BASE_SEPOLIA_DEPLOYMENT.runtimeCodeHash }
        : { exists: false, hash: `0x${'00'.repeat(32)}` as const },
    }],
  ])('fails closed for %s', async (_label, overrides) => {
    await expect(verifyBaseSepoliaDeployment(client(overrides as Partial<PublicRpcClient>)))
      .rejects.toMatchObject({ code: 'DEPLOYMENT_INVALID' } satisfies Partial<OnchainError>);
  });

  it('rejects a reorged snapshot instead of mixing blocks', async () => {
    await expect(verifyBaseSepoliaDeployment(client({
      getBlock: async () => ({ ...block, hash: `0x${'ef'.repeat(32)}` }),
    }))).rejects.toMatchObject({ code: 'SNAPSHOT_STALE' } satisfies Partial<OnchainError>);
  });
});

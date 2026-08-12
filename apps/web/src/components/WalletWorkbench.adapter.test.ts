import { describe, expect, it, vi } from 'vitest';
import { BASE_BUILDER_CODE } from '../deployment';
import { BASE_BUILDER_CODE_SUFFIX, type PreparedOperation, type TransactionCoordinator } from '../onchain';
import { createWalletWorkbenchAdapter, type WalletFormValues } from './WalletWorkbench';

const owner = '0x1111111111111111111111111111111111111111' as const;
const agent = '0x2222222222222222222222222222222222222222' as const;
const merchant = '0x3333333333333333333333333333333333333333' as const;
const reference = `0x${'ab'.repeat(32)}` as const;
const calldata = `0x12345678${BASE_BUILDER_CODE_SUFFIX.slice(2)}` as const;

const operation: PreparedOperation = Object.freeze({
  id: 'payment-1',
  kind: 'execute',
  role: 'agent',
  account: agent,
  chainId: 84532,
  generation: 1,
  preparedAt: 1,
  expiresAt: 120_001,
  request: { account: agent, chainId: 84532 as const, to: '0x048eAF1596492cd29378fF240841b8ec32db50eA' as const, data: calldata, value: 0n as const },
  snapshot: { number: 100n, hash: `0x${'cd'.repeat(32)}` as const, timestamp: 1_800_000_000n },
  payment: {
    owner,
    merchant,
    amount: 25_000_000n,
    externalReference: reference,
    state: {
      policy: { agent, perPaymentLimit: 50_000_000n, dailyLimit: 100_000_000n, expiresAt: 1_800_001_000n, paused: false, revoked: false, revision: 7n },
      merchantAllowed: true,
      referenceUsed: false,
      dailySpend: { day: 20_833n, spent: 10_000_000n },
    },
  },
});

const fields: WalletFormValues = {
  owner,
  agent,
  merchant,
  amount: '25',
  perPaymentLimit: '50',
  dailyLimit: '100',
  expiresAt: '2027-01-15T08:00',
  reference,
};

function coordinator() {
  return {
    getState: () => ({
      status: 'ready' as const,
      writesEnabled: true as const,
      session: {
        account: agent,
        chainId: 84532 as const,
        generation: 1,
        deployment: {
          chainId: 84532 as const,
          guard: '0x048eAF1596492cd29378fF240841b8ec32db50eA' as const,
          stablecoin: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
          runtimeCodeHash: `0x${'ef'.repeat(32)}` as const,
          block: operation.snapshot,
        },
      },
    }),
    subscribe: vi.fn(() => () => undefined),
    prepareExecute: vi.fn(async () => operation),
    confirm: vi.fn(async () => ({ status: 'cancelled' as const })),
  } as unknown as TransactionCoordinator;
}

describe('wallet workbench adapter signing intent', () => {
  it('shows exact attribution, calldata, and the payment authority snapshot', async () => {
    const adapter = createWalletWorkbenchAdapter(coordinator());
    const prepared = await adapter.prepare('execute', fields);
    const details = Object.fromEntries(prepared.details.map(({ label, value }) => [label, value]));

    expect(prepared.builderCode).toBe(BASE_BUILDER_CODE);
    expect(prepared.attributionSuffix).toBe(BASE_BUILDER_CODE_SUFFIX);
    expect(prepared.calldata).toBe(calldata);
    expect(details).toMatchObject({
      'Snapshot policy agent': agent,
      'Snapshot per-payment limit': '50 USDC (50000000 base units)',
      'Snapshot daily limit': '100 USDC (100000000 base units)',
      'Snapshot daily spend': '10 USDC (10000000 base units)',
      'Snapshot expiry': '2027-01-15T08:16:40.000Z (1800001000 Unix seconds)',
      'Snapshot merchant permission': 'Allowed',
      'Snapshot reference used': 'No',
      'Snapshot policy paused': 'No',
      'Snapshot policy revoked': 'No',
      'Snapshot policy revision': '7',
    });
    await expect(adapter.confirm(prepared)).resolves.toMatchObject({ status: 'cancelled' });
  });
});

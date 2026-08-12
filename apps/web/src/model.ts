import { getAddress, isAddress, keccak256, parseUnits, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import { preflightPayment, type GuardPolicy, type PreflightDecision } from '@base-agent-payment-guard/sdk';

export interface SimulatorFields {
  owner: string;
  agent: string;
  merchant: string;
  amount: string;
  perPaymentLimit: string;
  dailyLimit: string;
  spentToday: string;
  expiresAt: string;
  reference: string;
  merchantAllowed: boolean;
  paused: boolean;
  referenceUsed: boolean;
}

export const INITIAL_FIELDS: SimulatorFields = {
  owner: '0x1111111111111111111111111111111111111111',
  agent: '0x2222222222222222222222222222222222222222',
  merchant: '0x3333333333333333333333333333333333333333',
  amount: '25.00',
  perPaymentLimit: '50.00',
  dailyLimit: '200.00',
  spentToday: '60.00',
  expiresAt: '2030-05-25T23:59',
  reference: 'SYNTHETIC-INVOICE-001',
  merchantAllowed: true,
  paused: false,
  referenceUsed: false,
};

export type SimulationResult =
  | { ok: true; decision: PreflightDecision; referenceHash: Hex; amount: bigint; day: bigint; evaluatedAt: string; expiresAt: string }
  | { ok: false; message: string };

const address = (value: string): Address => {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error('Owner, agent, and merchant must be valid nonzero EVM addresses.');
  return getAddress(value);
};

export function runSimulation(fields: SimulatorFields, nowMs = Date.now()): SimulationResult {
  try {
    if (fields.reference.trim() === '') throw new Error('Reference must not be blank.');
    const amount = parseUnits(fields.amount, 6);
    const expiryDate = new Date(fields.expiresAt);
    if (!Number.isFinite(expiryDate.getTime())) throw new Error('Policy expiry is invalid.');
    const policy: GuardPolicy = {
      agent: address(fields.agent),
      perPaymentLimit: parseUnits(fields.perPaymentLimit, 6),
      dailyLimit: parseUnits(fields.dailyLimit, 6),
      expiresAt: BigInt(Math.floor(expiryDate.getTime() / 1000)),
      paused: fields.paused,
      revoked: false,
      revision: 1n,
    };
    const referenceHash = keccak256(stringToHex(fields.reference));
    const decision = preflightPayment(
      {
        chainId: 8453,
        owner: address(fields.owner),
        caller: address(fields.agent),
        merchant: address(fields.merchant),
        amount,
        externalReference: referenceHash,
        now: BigInt(Math.floor(nowMs / 1000)),
      },
      {
        policy,
        merchantAllowed: fields.merchantAllowed,
        spentToday: parseUnits(fields.spentToday, 6),
        referenceUsed: fields.referenceUsed,
      },
    );
    return { ok: true, decision, referenceHash, amount, day: BigInt(Math.floor(nowMs / 86_400_000)), evaluatedAt: new Date(nowMs).toISOString(), expiresAt: expiryDate.toISOString() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Simulation input is invalid.' };
  }
}

export function configuredGuardAddress(raw: string | undefined): Address | undefined {
  return raw && isAddress(raw) && raw.toLowerCase() !== zeroAddress ? getAddress(raw) : undefined;
}

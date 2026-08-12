import type { Address, Hex } from 'viem';
import { isAddress, isHex, zeroAddress } from 'viem';
import { isSupportedChainId, type SupportedChainId } from './chains.js';

export const PREFLIGHT_RULE_IDS = [
  'BAPG-CHAIN-001',
  'BAPG-INPUT-001',
  'BAPG-POLICY-001',
  'BAPG-AGENT-001',
  'BAPG-MERCHANT-001',
  'BAPG-SELF-001',
  'BAPG-AMOUNT-001',
  'BAPG-DAILY-001',
  'BAPG-EXPIRY-001',
  'BAPG-REPLAY-001',
] as const;

export type PreflightRuleId = (typeof PREFLIGHT_RULE_IDS)[number];
export type CheckStatus = 'pass' | 'deny' | 'indeterminate';

export interface GuardPolicy {
  readonly agent: Address;
  readonly perPaymentLimit: bigint;
  readonly dailyLimit: bigint;
  readonly expiresAt: bigint;
  readonly paused: boolean;
  readonly revoked: boolean;
  readonly revision: bigint;
}

export interface PaymentIntent {
  readonly chainId: number;
  readonly owner: Address;
  readonly caller: Address;
  readonly merchant: Address;
  readonly amount: bigint;
  readonly externalReference: Hex;
  readonly now: bigint;
}

export interface PreflightContext {
  readonly policy?: GuardPolicy;
  readonly merchantAllowed?: boolean;
  readonly spentToday?: bigint;
  readonly referenceUsed?: boolean;
}

export interface PreflightCheck {
  readonly ruleId: PreflightRuleId;
  readonly label: string;
  readonly status: CheckStatus;
  readonly reason: string;
}

export interface PreflightDecision {
  readonly decision: 'allow' | 'deny';
  readonly chainId?: SupportedChainId;
  readonly checks: readonly PreflightCheck[];
  readonly denialRuleIds: readonly PreflightRuleId[];
}

const sameAddress = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
const nonZeroAddress = (value: Address) => isAddress(value) && !sameAddress(value, zeroAddress);
const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const withinUint = (value: unknown, max = UINT256_MAX): value is bigint => typeof value === 'bigint' && value >= 0n && value <= max;
const exactBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

function check(ruleId: PreflightRuleId, label: string, status: CheckStatus, reason: string): PreflightCheck {
  return { ruleId, label, status, reason };
}

export function preflightPayment(intent: PaymentIntent, context: PreflightContext): PreflightDecision {
  const checks: PreflightCheck[] = [];
  const supportedChain = isSupportedChainId(intent.chainId);
  checks.push(check('BAPG-CHAIN-001', 'Base chain', supportedChain ? 'pass' : 'deny', supportedChain ? 'Supported Base chain.' : 'Only Base and Base Sepolia are supported.'));

  const inputsValid = nonZeroAddress(intent.owner) && nonZeroAddress(intent.caller) && nonZeroAddress(intent.merchant)
    && withinUint(intent.amount) && intent.amount > 0n
    && withinUint(intent.now, UINT64_MAX)
    && isHex(intent.externalReference, { strict: true }) && intent.externalReference.length === 66
    && !/^0x0{64}$/i.test(intent.externalReference);
  checks.push(check('BAPG-INPUT-001', 'Request', inputsValid ? 'pass' : 'deny', inputsValid ? 'Request fields are well formed.' : 'An address, amount, or reference is malformed.'));
  const merchantIsExternal = nonZeroAddress(intent.owner) && nonZeroAddress(intent.merchant) && !sameAddress(intent.owner, intent.merchant);
  checks.push(check('BAPG-SELF-001', 'External merchant', merchantIsExternal ? 'pass' : 'deny', merchantIsExternal ? 'Merchant differs from the policy owner.' : 'Owner cannot pay itself through the guard.'));

  const policy = context.policy;
  if (!policy) {
    checks.push(check('BAPG-POLICY-001', 'Policy', 'indeterminate', 'Policy state was not provided.'));
    checks.push(check('BAPG-AGENT-001', 'Agent', 'indeterminate', 'Agent cannot be checked without policy state.'));
    checks.push(check('BAPG-AMOUNT-001', 'Payment limit', 'indeterminate', 'Limit cannot be checked without policy state.'));
    checks.push(check('BAPG-DAILY-001', 'Daily limit', 'indeterminate', 'Spend cannot be checked without policy state.'));
    checks.push(check('BAPG-EXPIRY-001', 'Expiry', 'indeterminate', 'Expiry cannot be checked without policy state.'));
  } else {
    const policyShapeValid = nonZeroAddress(policy.agent)
      && withinUint(policy.perPaymentLimit) && policy.perPaymentLimit > 0n
      && withinUint(policy.dailyLimit) && policy.dailyLimit >= policy.perPaymentLimit
      && withinUint(policy.expiresAt, UINT64_MAX)
      && withinUint(policy.revision, UINT64_MAX) && policy.revision > 0n
      && exactBoolean(policy.paused) && exactBoolean(policy.revoked);
    const policyActive = policyShapeValid && !policy.paused && !policy.revoked;
    const policyReason = !policyShapeValid
      ? 'Policy state is malformed.'
      : policy.revoked
        ? 'Policy is revoked.'
        : policy.paused
          ? 'Policy is paused.'
          : 'Policy is active.';
    checks.push(check('BAPG-POLICY-001', 'Policy', policyActive ? 'pass' : 'deny', policyReason));
    const correctAgent = nonZeroAddress(policy.agent) && sameAddress(intent.caller, policy.agent);
    checks.push(check('BAPG-AGENT-001', 'Agent', correctAgent ? 'pass' : 'deny', correctAgent ? 'Caller matches the configured agent.' : 'Caller is not the configured agent.'));
    const withinPaymentLimit = withinUint(intent.amount) && withinUint(policy.perPaymentLimit) && intent.amount > 0n && intent.amount <= policy.perPaymentLimit;
    checks.push(check('BAPG-AMOUNT-001', 'Payment limit', withinPaymentLimit ? 'pass' : 'deny', withinPaymentLimit ? 'Amount is within the per-payment limit.' : 'Amount exceeds the per-payment limit.'));
    if (context.spentToday === undefined) {
      checks.push(check('BAPG-DAILY-001', 'Daily limit', 'indeterminate', 'Current daily spend was not provided.'));
    } else {
      const spendValid = withinUint(context.spentToday);
      const withinDailyLimit = spendValid && withinUint(policy.dailyLimit) && withinUint(intent.amount) && context.spentToday <= policy.dailyLimit && intent.amount <= policy.dailyLimit - context.spentToday;
      checks.push(check('BAPG-DAILY-001', 'Daily limit', withinDailyLimit ? 'pass' : 'deny', withinDailyLimit ? 'Amount is within the remaining daily limit.' : 'Amount exceeds the remaining daily limit.'));
    }
    const notExpired = withinUint(intent.now, UINT64_MAX) && withinUint(policy.expiresAt, UINT64_MAX) && intent.now < policy.expiresAt;
    checks.push(check('BAPG-EXPIRY-001', 'Expiry', notExpired ? 'pass' : 'deny', notExpired ? 'Policy has not expired.' : 'Policy is expired.'));
  }

  if (!exactBoolean(context.merchantAllowed)) {
    checks.push(check('BAPG-MERCHANT-001', 'Merchant', 'indeterminate', context.merchantAllowed === undefined ? 'Merchant permission was not provided.' : 'Merchant permission is malformed.'));
  } else {
    checks.push(check('BAPG-MERCHANT-001', 'Merchant', context.merchantAllowed ? 'pass' : 'deny', context.merchantAllowed ? 'Merchant is allowlisted.' : 'Merchant is not allowlisted.'));
  }

  if (!exactBoolean(context.referenceUsed)) {
    checks.push(check('BAPG-REPLAY-001', 'Replay', 'indeterminate', context.referenceUsed === undefined ? 'Reference state was not provided.' : 'Reference state is malformed.'));
  } else {
    checks.push(check('BAPG-REPLAY-001', 'Replay', context.referenceUsed ? 'deny' : 'pass', context.referenceUsed ? 'Reference was already used.' : 'Reference has not been used.'));
  }

  const denialRuleIds = checks.filter(({ status }) => status !== 'pass').map(({ ruleId }) => ruleId);
  return {
    decision: denialRuleIds.length === 0 ? 'allow' : 'deny',
    chainId: supportedChain ? intent.chainId : undefined,
    checks,
    denialRuleIds,
  };
}

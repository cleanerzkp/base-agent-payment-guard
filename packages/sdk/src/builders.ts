import type { Address, Hex } from 'viem';
import { encodeFunctionData, getAddress, isAddress, isHex, zeroAddress } from 'viem';
import { baseAgentPaymentGuardAbi, erc20ApproveAbi } from './abi.js';
import { isSupportedChainId, type SupportedChainId } from './chains.js';

export interface ContractCall {
  readonly chainId: SupportedChainId;
  readonly to: Address;
  readonly data: Hex;
  readonly value: 0n;
}

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const isUint = (value: unknown, max = UINT256_MAX): value is bigint => typeof value === 'bigint' && value >= 0n && value <= max;

function target(chainId: number, contract: Address): { chainId: SupportedChainId; to: Address } {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}. Only Base (8453) and Base Sepolia (84532) are allowed.`);
  if (!isAddress(contract) || contract.toLowerCase() === zeroAddress) throw new Error('Contract address is invalid.');
  return { chainId, to: getAddress(contract) };
}

function call(chainId: number, contract: Address, data: Hex): ContractCall {
  return { ...target(chainId, contract), data, value: 0n };
}

export function buildConfigurePolicy(params: { chainId: number; guard: Address; agent: Address; perPaymentLimit: bigint; dailyLimit: bigint; expiresAt: bigint }): ContractCall {
  if (!isAddress(params.agent) || params.agent.toLowerCase() === zeroAddress) throw new Error('Agent address is invalid.');
  if (!isUint(params.perPaymentLimit) || params.perPaymentLimit <= 0n
    || !isUint(params.dailyLimit) || params.dailyLimit < params.perPaymentLimit
    || !isUint(params.expiresAt, UINT64_MAX) || params.expiresAt <= 0n) throw new Error('Policy limits or expiry are invalid. They must be exact bigint values within their Solidity widths.');
  return call(params.chainId, params.guard, encodeFunctionData({ abi: baseAgentPaymentGuardAbi, functionName: 'configurePolicy', args: [params.agent, params.perPaymentLimit, params.dailyLimit, params.expiresAt] }));
}

export function buildSetMerchant(params: { chainId: number; guard: Address; owner: Address; merchant: Address; allowed: boolean }): ContractCall {
  if (!isAddress(params.owner) || params.owner.toLowerCase() === zeroAddress || !isAddress(params.merchant) || params.merchant.toLowerCase() === zeroAddress || params.owner.toLowerCase() === params.merchant.toLowerCase()) throw new Error('Owner and merchant must be distinct nonzero addresses.');
  return call(params.chainId, params.guard, encodeFunctionData({ abi: baseAgentPaymentGuardAbi, functionName: 'setMerchant', args: [params.merchant, params.allowed] }));
}

export function buildSetPolicyPaused(params: { chainId: number; guard: Address; paused: boolean }): ContractCall {
  return call(params.chainId, params.guard, encodeFunctionData({ abi: baseAgentPaymentGuardAbi, functionName: 'setPolicyPaused', args: [params.paused] }));
}

export function buildRevokePolicy(params: { chainId: number; guard: Address }): ContractCall {
  return call(params.chainId, params.guard, encodeFunctionData({ abi: baseAgentPaymentGuardAbi, functionName: 'revokePolicy' }));
}

export function buildApproveStablecoin(params: { chainId: number; token: Address; guard: Address; amount: bigint }): ContractCall {
  if (!isAddress(params.guard) || params.guard.toLowerCase() === zeroAddress) throw new Error('Guard address is invalid.');
  if (!isUint(params.amount)) throw new Error('Approval amount must be an exact uint256 bigint. Zero is allowed to revoke an allowance.');
  return call(params.chainId, params.token, encodeFunctionData({ abi: erc20ApproveAbi, functionName: 'approve', args: [params.guard, params.amount] }));
}

export function buildExecutePayment(params: { chainId: number; guard: Address; owner: Address; merchant: Address; amount: bigint; externalReference: Hex }): ContractCall {
  if (!isAddress(params.owner) || params.owner.toLowerCase() === zeroAddress || !isAddress(params.merchant) || params.merchant.toLowerCase() === zeroAddress || params.owner.toLowerCase() === params.merchant.toLowerCase()) throw new Error('Owner and merchant must be distinct nonzero addresses.');
  if (!isUint(params.amount) || params.amount <= 0n) throw new Error('Payment amount must be a positive uint256 bigint.');
  if (!isHex(params.externalReference, { strict: true }) || params.externalReference.length !== 66 || /^0x0{64}$/i.test(params.externalReference)) throw new Error('External reference must be nonzero bytes32.');
  return call(params.chainId, params.guard, encodeFunctionData({ abi: baseAgentPaymentGuardAbi, functionName: 'executePayment', args: [params.owner, params.merchant, params.amount, params.externalReference] }));
}

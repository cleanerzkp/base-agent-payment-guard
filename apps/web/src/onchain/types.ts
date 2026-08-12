import type { Address, Hex } from 'viem';
import type { GuardPolicy, ReceiptEvidenceClient } from '@base-agent-payment-guard/sdk';
import type { DeploymentClient } from './deployment';

export interface PublicRpcClient extends DeploymentClient, ReceiptEvidenceClient {
  readPolicy(owner: Address, blockNumber: bigint): Promise<GuardPolicy>;
  readMerchantAllowed(owner: Address, merchant: Address, blockNumber: bigint): Promise<boolean>;
  readReferenceUsed(owner: Address, reference: Hex, blockNumber: bigint): Promise<boolean>;
  readDailySpend(owner: Address, blockNumber: bigint): Promise<{ readonly day: bigint; readonly spent: bigint }>;
  readAllowance(owner: Address, spender: Address, blockNumber: bigint): Promise<bigint>;
  simulateTransaction(request: { readonly account: Address; readonly chainId: 84532; readonly to: Address; readonly data: Hex; readonly value: 0n }, blockNumber: bigint): Promise<void>;
}

import { base, baseSepolia } from 'viem/chains';

export const SUPPORTED_CHAIN_IDS = [base.id, baseSepolia.id] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export const BASE_CHAINS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
} as const;

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.some((supported) => supported === chainId);
}

export function getBaseChain(chainId: number) {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chain ${chainId}. Only Base (8453) and Base Sepolia (84532) are allowed.`);
  }

  return BASE_CHAINS[chainId];
}

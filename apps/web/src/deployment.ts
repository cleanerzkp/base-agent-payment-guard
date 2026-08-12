import type { Address, Hex } from 'viem';

export interface BaseSepoliaDeployment {
  readonly chainId: 84532;
  readonly guard: Address;
  readonly stablecoin: Address;
  readonly runtimeCodeHash: Hex;
  readonly builderCode: 'bc_xiu880fh';
}

export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const BASE_SEPOLIA_GUARD_ADDRESS = '0x048eAF1596492cd29378fF240841b8ec32db50eA' as const;
export const BASE_SEPOLIA_USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
export const BASE_SEPOLIA_RUNTIME_CODE_HASH = '0x743bcd90e5a4a27d3c8b3569bac8ff5eeb8d0d4a52436c11b24352162e167b86' as const;
export const BASE_BUILDER_CODE = 'bc_xiu880fh' as const;

export const BASE_SEPOLIA_DEPLOYMENT: BaseSepoliaDeployment = Object.freeze({
  chainId: BASE_SEPOLIA_CHAIN_ID,
  guard: BASE_SEPOLIA_GUARD_ADDRESS,
  stablecoin: BASE_SEPOLIA_USDC_ADDRESS,
  runtimeCodeHash: BASE_SEPOLIA_RUNTIME_CODE_HASH,
  builderCode: BASE_BUILDER_CODE,
});

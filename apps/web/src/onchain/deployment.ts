import { getAddress, type Address, type Hex } from 'viem';
import { BASE_SEPOLIA_DEPLOYMENT, type BaseSepoliaDeployment } from '../deployment';
import { OnchainError } from './errors';

export interface BlockSnapshot {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

export interface CodeIdentity {
  readonly exists: boolean;
  readonly hash: Hex;
}

export interface DeploymentVerification extends BaseSepoliaDeployment {
  readonly block: BlockSnapshot;
}

export interface DeploymentClient {
  getChainId(): Promise<number>;
  getLatestBlock(): Promise<BlockSnapshot>;
  getBlock(blockNumber: bigint): Promise<BlockSnapshot>;
  getCodeIdentity(address: Address, blockNumber: bigint): Promise<CodeIdentity>;
  readStablecoin(blockNumber: bigint): Promise<Address>;
}

const sameHex = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export async function verifyBaseSepoliaDeployment(client: DeploymentClient): Promise<DeploymentVerification> {
  try {
    if (await client.getChainId() !== BASE_SEPOLIA_DEPLOYMENT.chainId) {
      throw new OnchainError('DEPLOYMENT_INVALID', 'The independent RPC is not Base Sepolia.');
    }

    const block = await client.getLatestBlock();
    const [guardCode, stablecoin] = await Promise.all([
      client.getCodeIdentity(BASE_SEPOLIA_DEPLOYMENT.guard, block.number),
      client.readStablecoin(block.number),
    ]);
    if (!guardCode.exists || !sameHex(guardCode.hash, BASE_SEPOLIA_DEPLOYMENT.runtimeCodeHash)) {
      throw new OnchainError('DEPLOYMENT_INVALID', 'The pinned guard runtime code does not match the reviewed deployment.');
    }
    if (getAddress(stablecoin) !== BASE_SEPOLIA_DEPLOYMENT.stablecoin) {
      throw new OnchainError('DEPLOYMENT_INVALID', 'The guard stablecoin does not match canonical Base Sepolia USDC.');
    }
    const tokenCode = await client.getCodeIdentity(BASE_SEPOLIA_DEPLOYMENT.stablecoin, block.number);
    if (!tokenCode.exists) {
      throw new OnchainError('DEPLOYMENT_INVALID', 'Canonical Base Sepolia USDC has no runtime code at the snapshot block.');
    }

    const canonicalBlock = await client.getBlock(block.number);
    if (!sameHex(canonicalBlock.hash, block.hash) || canonicalBlock.timestamp !== block.timestamp) {
      throw new OnchainError('SNAPSHOT_STALE', 'The independent RPC snapshot changed during verification.');
    }
    return Object.freeze({ ...BASE_SEPOLIA_DEPLOYMENT, block: Object.freeze(block) });
  } catch (error) {
    if (error instanceof OnchainError) throw error;
    throw new OnchainError('DEPLOYMENT_INVALID', 'The reviewed Base Sepolia deployment could not be verified.');
  }
}

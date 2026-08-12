import { createWalletClient, custom, getAddress, numberToHex, type Address, type EIP1193Provider } from 'viem';
import { base, baseSepolia } from 'viem/chains';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export interface ConnectedWallet {
  readonly account: Address;
  readonly chainId: 8453 | 84532;
}

export async function connectInjectedWallet(guardAddress: Address): Promise<ConnectedWallet> {
  if (!guardAddress) throw new Error('Guard contract is not configured.');
  const provider = window.ethereum;
  if (!provider) throw new Error('No injected wallet was found.');
  const chainHex = await provider.request({ method: 'eth_chainId' });
  const chainId = Number(chainHex);
  if (chainId !== base.id && chainId !== baseSepolia.id) {
    throw new Error('Switch your wallet to Base or Base Sepolia.');
  }
  const [account] = await provider.request({ method: 'eth_requestAccounts' }) as string[];
  if (!account) throw new Error('The wallet did not provide an account.');
  const chain = chainId === base.id ? base : baseSepolia;
  const client = createWalletClient({ chain, transport: custom(provider) });
  const walletChainId = await client.getChainId();
  if (walletChainId !== chainId) throw new Error('Wallet chain changed during connection.');
  return { account: getAddress(account), chainId };
}

export async function requestBaseChain(chainId: 8453 | 84532): Promise<void> {
  if (!window.ethereum) throw new Error('No injected wallet was found.');
  await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] });
}

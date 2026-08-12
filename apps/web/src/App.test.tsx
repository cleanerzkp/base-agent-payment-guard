import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { WalletPreparedOperation, WalletWorkbenchAdapter, WalletWorkbenchState } from './components/WalletWorkbench';

afterEach(cleanup);

const OWNER = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const GUARD = '0x048eAF1596492cd29378fF240841b8ec32db50eA';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BUILDER_CODE = 'bc_xiu880fh';
const BUILDER_SUFFIX = '0x62635f78697538383066680b0080218021802180218021802180218021';
const FINAL_CALLDATA = `0x12345678${BUILDER_SUFFIX.slice(2)}`;

function walletAdapter(overrides: Partial<WalletWorkbenchState> = {}) {
  let state: WalletWorkbenchState = {
    connected: true,
    builderCodeConfigured: true,
    writesEnabled: true,
    chainName: 'Base Sepolia',
    guardAddress: GUARD,
    tokenAddress: USDC,
    deploymentVerified: true,
    session: { account: OWNER, chainId: 84532, role: 'unknown' },
    ...overrides,
  };
  const listeners = new Set<(next: WalletWorkbenchState) => void>();
  const prepared: WalletPreparedOperation = {
    id: 'prepared-1',
    action: 'configure',
    title: 'Configure policy',
    chainId: 84532,
    guardAddress: GUARD,
    tokenAddress: USDC,
    signer: OWNER,
    requiredRole: 'owner',
    transactionCount: 1,
    builderCode: BUILDER_CODE,
    attributionSuffix: BUILDER_SUFFIX,
    calldata: FINAL_CALLDATA,
    details: [
      { label: 'Agent', value: AGENT },
      { label: 'Per-payment limit', value: '25.00 USDC' },
      { label: 'Daily limit', value: '100.00 USDC' },
      { label: 'Expiry', value: '2030-05-25T23:59:00Z' },
    ],
  };
  const adapter: WalletWorkbenchAdapter = {
    getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    connect: vi.fn(async () => undefined),
    prepare: vi.fn(async () => prepared),
    confirm: vi.fn(async () => ({ action: prepared.action, status: 'confirmed' as const, transactionHash: `0x${'ab'.repeat(32)}`, message: 'Transaction confirmed on Base Sepolia.' })),
  };
  return {
    adapter,
    emit(next: WalletWorkbenchState) {
      state = next;
      listeners.forEach((listener) => listener(state));
    },
    state: () => state,
  };
}

async function openWallet(user: ReturnType<typeof userEvent.setup>, adapter: WalletWorkbenchAdapter) {
  render(<App walletAdapter={adapter} />);
  await user.click(screen.getByRole('button', { name: 'Base Sepolia wallet' }));
}

describe('Base Agent Payment Guard demo', () => {
  it('labels synthetic mode and the public testnet proof of concept truthfully', () => {
    render(<App />);
    expect(screen.getByText(/Synthetic local mode/)).toHaveTextContent('No wallet transaction · Unaudited');
    expect(screen.getByText(/Public Base Sepolia testnet proof of concept/)).toHaveTextContent('Never paste a private key');
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('denies a payment over its limit without a wallet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText('Payment amount'));
    await user.type(screen.getByLabelText('Payment amount'), '75');
    await user.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByRole('heading', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByText('The policy would stop this payment.')).toBeInTheDocument();
  });

  it('handles malformed values as a fail-closed result', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByRole('heading', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByText(/valid nonzero EVM addresses/)).toBeInTheDocument();
  });

  it('keeps the decision and evidence bound to the last submitted snapshot', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '0x4444444444444444444444444444444444444444' } });
    expect(screen.getByLabelText('Simulation evidence')).toHaveTextContent('0x3333333333333333333333333333333333333333');
    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByLabelText('Simulation evidence')).toHaveTextContent('0x4444444444444444444444444444444444444444');
  });

  it('shows Base Sepolia status and disables writes without Builder Code or connection', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter({ connected: false, builderCodeConfigured: false, writesEnabled: false, session: undefined });
    await openWallet(user, harness.adapter);
    expect(screen.getByLabelText('Base Sepolia wallet workbench')).toHaveTextContent('Testnet deployment');
    expect(screen.getByText('Unaudited')).toBeInTheDocument();
    expect(screen.getByText(/Builder Code required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review configure policy/ })).toBeDisabled();
  });

  it('fails safely when no injected wallet is present', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Base Sepolia wallet' }));
    await user.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No injected wallet was found.');
    expect(screen.getByRole('button', { name: /Review configure policy/ })).toBeDisabled();
  });

  it('prepares visible transaction details before an explicit signature request', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter();
    await openWallet(user, harness.adapter);
    await user.click(screen.getByRole('button', { name: /Review configure policy/ }));
    expect(harness.adapter.prepare).toHaveBeenCalledTimes(1);
    expect(harness.adapter.confirm).not.toHaveBeenCalled();
    const details = screen.getByLabelText('Prepared transaction details');
    expect(details).toHaveTextContent('84532 · Base Sepolia');
    expect(details).toHaveTextContent(GUARD);
    expect(details).toHaveTextContent(USDC);
    expect(details).toHaveTextContent(OWNER);
    expect(details).toHaveTextContent('owner');
    expect(details).toHaveTextContent(BUILDER_CODE);
    expect(details).toHaveTextContent(BUILDER_SUFFIX);
    expect(details).toHaveTextContent(FINAL_CALLDATA);
    expect(details).toHaveTextContent('Wallet-managed; this app does not set or retry it');
    expect(details).toHaveTextContent('25.00 USDC');
    expect(details).toHaveTextContent('100.00 USDC');
    expect(details).toHaveTextContent('2030-05-25T23:59:00Z');
    await user.click(screen.getByRole('button', { name: 'Request one signature' }));
    expect(harness.adapter.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('confirmed')).toBeInTheDocument();
  });

  it('reports review cancellation separately from a reverted transaction', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter();
    await openWallet(user, harness.adapter);
    await user.click(screen.getByRole('button', { name: /Review configure policy/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('cancelled')).toBeInTheDocument();
    expect(screen.getByText('Transaction cancelled. Nothing was sent.')).toBeInTheDocument();
    expect(screen.queryByText('reverted')).not.toBeInTheDocument();
    expect(harness.adapter.confirm).not.toHaveBeenCalled();
  });

  it('invalidates prepared and result data when the account or chain changes', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter();
    await openWallet(user, harness.adapter);
    await user.click(screen.getByRole('button', { name: /Review configure policy/ }));
    expect(screen.getByLabelText('Prepared transaction details')).toBeInTheDocument();
    harness.emit({ ...harness.state(), session: { account: AGENT, chainId: 84532, role: 'unknown' } });
    expect(await screen.findByText(/wallet account or chain changed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Prepared transaction details')).not.toBeInTheDocument();
  });

  it('fails closed and displays preparation errors without opening a wallet request', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter();
    vi.mocked(harness.adapter.prepare).mockRejectedValueOnce(new Error('Fresh policy snapshot no longer matches.'));
    await openWallet(user, harness.adapter);
    await user.click(screen.getByRole('button', { name: /Review configure policy/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fresh policy snapshot no longer matches.');
    expect(harness.adapter.confirm).not.toHaveBeenCalled();
  });

  it('distinguishes submitted status and warns when only one revocation is complete', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter();
    const revoke: WalletPreparedOperation = {
      id: 'revoke-policy', action: 'revokePolicy', title: 'Revoke policy', chainId: 84532,
      guardAddress: GUARD, tokenAddress: USDC, signer: OWNER, requiredRole: 'owner', transactionCount: 1,
      builderCode: BUILDER_CODE, attributionSuffix: BUILDER_SUFFIX, calldata: FINAL_CALLDATA, details: [],
    };
    vi.mocked(harness.adapter.prepare).mockResolvedValueOnce(revoke);
    vi.mocked(harness.adapter.confirm).mockResolvedValueOnce({ action: 'revokePolicy', status: 'confirmed', message: 'Policy revocation confirmed.' });
    await openWallet(user, harness.adapter);
    await user.selectOptions(screen.getByLabelText('Wallet action'), 'revokePolicy');
    await user.click(screen.getByRole('button', { name: /Review revoke policy/ }));
    await user.click(screen.getByRole('button', { name: 'Request one signature' }));
    expect(screen.getByText(/Partial revocation/).closest('p')).toHaveTextContent('revoke the USDC allowance separately');

    vi.mocked(harness.adapter.prepare).mockResolvedValueOnce({ ...revoke, id: 'pause', action: 'pause', title: 'Pause policy' });
    vi.mocked(harness.adapter.confirm).mockResolvedValueOnce({ action: 'pause', status: 'submitted', transactionHash: `0x${'cd'.repeat(32)}`, message: 'Transaction submitted; waiting for confirmation.' });
    await user.selectOptions(screen.getByLabelText('Wallet action'), 'pause');
    await user.click(screen.getByRole('button', { name: /Review pause policy/ }));
    await user.click(screen.getByRole('button', { name: 'Request one signature' }));
    expect(screen.getByText('submitted')).toBeInTheDocument();
    expect(screen.getByText(`0x${'cd'.repeat(32)}`)).toBeInTheDocument();
  });

  it('generates an opaque bytes32 reference and does not collect invoice text', async () => {
    const user = userEvent.setup();
    const harness = walletAdapter({ session: { account: AGENT, chainId: 84532, role: 'unknown' } });
    await openWallet(user, harness.adapter);
    await user.selectOptions(screen.getByLabelText('Wallet action'), 'execute');
    const reference = screen.getByText(/^0x[0-9a-f]{64}$/i);
    expect(reference).toBeInTheDocument();
    expect(screen.queryByLabelText('Single-use reference')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });
});

import { useEffect, useMemo, useState } from 'react';
import { Field, Toggle } from './components/Field';
import { ShieldIcon, WalletIcon } from './components/Icons';
import { ResultPanel } from './components/ResultPanel';
import { createWalletWorkbenchAdapter, WalletWorkbench, type WalletWorkbenchAdapter, type WalletWorkbenchState } from './components/WalletWorkbench';
import { BASE_SEPOLIA_GUARD_ADDRESS, BASE_SEPOLIA_USDC_ADDRESS } from './deployment';
import { INITIAL_FIELDS, runSimulation, type SimulatorFields } from './model';
import { createBrowserWalletAdapter, type TransactionCoordinator } from './onchain';

interface SubmittedSimulation {
  readonly fields: SimulatorFields;
  readonly result: ReturnType<typeof runSimulation>;
}

const initialResult: SubmittedSimulation = { fields: INITIAL_FIELDS, result: runSimulation(INITIAL_FIELDS) };

function createDeferredWalletAdapter(): WalletWorkbenchAdapter & { dispose: () => void } {
  let coordinator: TransactionCoordinator | undefined;
  let delegate: WalletWorkbenchAdapter | undefined;
  let state: WalletWorkbenchState = {
    connected: false,
    builderCodeConfigured: true,
    writesEnabled: false,
    disabledReason: 'Connect an injected wallet to verify the Base Sepolia deployment.',
    chainName: 'Base Sepolia',
    guardAddress: BASE_SEPOLIA_GUARD_ADDRESS,
    tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
    deploymentVerified: false,
  };
  const listeners = new Set<(next: WalletWorkbenchState) => void>();
  let unsubscribe: (() => void) | undefined;

  const ensureDelegate = () => {
    if (delegate) return delegate;
    coordinator = createBrowserWalletAdapter();
    delegate = createWalletWorkbenchAdapter(coordinator);
    unsubscribe = delegate.subscribe((next) => {
      state = next;
      listeners.forEach((listener) => listener(state));
    });
    return delegate;
  };

  return {
    getState: () => delegate?.getState() ?? state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    connect: async () => { await ensureDelegate().connect(); },
    prepare: async (action, values) => {
      if (!delegate) throw new Error('Connect and verify the wallet before preparing a transaction.');
      return delegate.prepare(action, values);
    },
    confirm: async (prepared) => {
      if (!delegate) throw new Error('Connect and verify the wallet before requesting a signature.');
      return delegate.confirm(prepared);
    },
    dispose: () => { unsubscribe?.(); coordinator?.dispose(); listeners.clear(); },
  };
}

interface AppProps {
  walletAdapter?: WalletWorkbenchAdapter;
}

export function App({ walletAdapter }: AppProps) {
  const [fields, setFields] = useState<SimulatorFields>(INITIAL_FIELDS);
  const [submitted, setSubmitted] = useState(initialResult);
  const [mode, setMode] = useState<'simulate' | 'wallet'>('simulate');
  const defaultWalletAdapter = useMemo(() => walletAdapter ? undefined : createDeferredWalletAdapter(), [walletAdapter]);
  const activeWalletAdapter = walletAdapter ?? defaultWalletAdapter!;

  useEffect(() => () => defaultWalletAdapter?.dispose(), [defaultWalletAdapter]);

  const update = <K extends keyof SimulatorFields>(key: K, value: SimulatorFields[K]) => setFields((current) => ({ ...current, [key]: value }));

  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="#simulator" aria-label="Base Agent Payment Guard home"><ShieldIcon /><span>Base Agent Payment Guard</span></a>
        <a className="security-link" href="#security-notes">Read security notes <span aria-hidden="true">↗</span></a>
      </header>
      <main>
        <section className="intro" id="simulator">
          <h1>Delegate payments. Keep the limits.</h1>
          <p>Set the agent, merchant, amount and daily ceiling before any transaction is signed.</p>
          <div className="local-status">{mode === 'simulate' ? 'Synthetic local mode' : 'Base Sepolia'} <b>·</b> {mode === 'simulate' ? 'No wallet transaction' : 'Testnet only'} <b>·</b> Unaudited</div>
        </section>
        <div className="mode-tabs" aria-label="Interaction mode">
          <button type="button" className={mode === 'simulate' ? 'active' : ''} aria-pressed={mode === 'simulate'} onClick={() => setMode('simulate')}>Simulate</button>
          <button type="button" className={mode === 'wallet' ? 'active' : ''} aria-pressed={mode === 'wallet'} onClick={() => setMode('wallet')}><WalletIcon />Base Sepolia wallet</button>
        </div>
        {mode === 'simulate' ? <div className="workspace">
          <form className="policy-form" onSubmit={(event) => { event.preventDefault(); setSubmitted({ fields: { ...fields }, result: runSimulation(fields) }); }}>
            <Field label="Agent" value={fields.agent} onChange={(value) => update('agent', value)} />
            <Field label="Merchant" value={fields.merchant} onChange={(value) => update('merchant', value)} />
            <Field label="Payment amount" value={fields.amount} onChange={(value) => update('amount', value)} type="number" step="0.01" suffix="USDC" />
            <Field label="Per-payment limit" value={fields.perPaymentLimit} onChange={(value) => update('perPaymentLimit', value)} type="number" step="0.01" suffix="USDC" />
            <Field label="Daily limit" value={fields.dailyLimit} onChange={(value) => update('dailyLimit', value)} type="number" step="0.01" suffix="USDC" />
            <Field label="Spent today" value={fields.spentToday} onChange={(value) => update('spentToday', value)} type="number" step="0.01" suffix="USDC" />
            <Field label="Policy expiry" value={fields.expiresAt} onChange={(value) => update('expiresAt', value)} type="datetime-local" />
            <Field label="Reference" value={fields.reference} onChange={(value) => update('reference', value)} />
            <div className="toggles">
              <Toggle label="Merchant allowlist" description="Only the listed merchant is allowed." checked={fields.merchantAllowed} onChange={(checked) => update('merchantAllowed', checked)} />
              <Toggle label="Policy paused" description="A paused policy denies every payment." checked={fields.paused} onChange={(checked) => update('paused', checked)} />
              <Toggle label="Reference already used" description="Model replay protection for this reference." checked={fields.referenceUsed} onChange={(checked) => update('referenceUsed', checked)} />
            </div>
            <button className="run-button" type="submit">Run preflight</button>
          </form>
          <div><ResultPanel result={submitted.result} fields={submitted.fields} /></div>
        </div> : <WalletWorkbench adapter={activeWalletAdapter} />}
      </main>
      <footer><ShieldIcon /> Public Base Sepolia testnet proof of concept. Never paste a private key.</footer>
    </div>
  );
}

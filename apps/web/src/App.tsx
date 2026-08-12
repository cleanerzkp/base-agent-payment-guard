import { useState } from 'react';
import type { Address } from 'viem';
import { Field, Toggle } from './components/Field';
import { ShieldIcon, WalletIcon } from './components/Icons';
import { ResultPanel } from './components/ResultPanel';
import { configuredGuardAddress, INITIAL_FIELDS, runSimulation, type SimulatorFields } from './model';

interface SubmittedSimulation {
  readonly fields: SimulatorFields;
  readonly result: ReturnType<typeof runSimulation>;
}

const initialResult: SubmittedSimulation = { fields: INITIAL_FIELDS, result: runSimulation(INITIAL_FIELDS) };

export function App() {
  const [fields, setFields] = useState<SimulatorFields>(INITIAL_FIELDS);
  const [submitted, setSubmitted] = useState(initialResult);
  const [walletMessage, setWalletMessage] = useState('');
  const guardAddress: Address | undefined = configuredGuardAddress(import.meta.env.VITE_GUARD_ADDRESS);

  const update = <K extends keyof SimulatorFields>(key: K, value: SimulatorFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const connect = async () => {
    if (!guardAddress) {
      setWalletMessage('Wallet mode is unavailable until VITE_GUARD_ADDRESS contains a valid deployment address.');
      return;
    }
    try {
      const { connectInjectedWallet } = await import('./wallet');
      const connected = await connectInjectedWallet(guardAddress);
      setWalletMessage(`Connected on chain ${connected.chainId}. No transaction was requested.`);
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : 'Wallet connection failed.');
    }
  };

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
          <div className="local-status">Local simulation <b>·</b> Not deployed <b>·</b> Unaudited</div>
          {walletMessage ? <p className="wallet-message" role="status">{walletMessage}</p> : null}
        </section>
        <div className="workspace">
          <form className="policy-form" onSubmit={(event) => { event.preventDefault(); setSubmitted({ fields: { ...fields }, result: runSimulation(fields) }); }}>
            <div className="mode-tabs" aria-label="Interaction tools">
              <span className="active">Simulate</span>
              <button type="button" onClick={connect}><WalletIcon />Wallet check</button>
            </div>
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
        </div>
      </main>
      <footer><ShieldIcon /> Local proof of concept. Never paste a private key.</footer>
    </div>
  );
}

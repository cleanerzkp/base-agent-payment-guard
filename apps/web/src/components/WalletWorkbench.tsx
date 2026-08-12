import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatUnits, getAddress, isAddress, isHex, parseUnits, zeroAddress } from 'viem';
import { BASE_BUILDER_CODE, BASE_SEPOLIA_GUARD_ADDRESS, BASE_SEPOLIA_USDC_ADDRESS } from '../deployment';
import { BASE_BUILDER_CODE_SUFFIX, type CoordinatorState, type PreparedOperation, type TransactionCoordinator } from '../onchain';

export type WalletAction =
  | 'configure'
  | 'allowMerchant'
  | 'approve'
  | 'pause'
  | 'unpause'
  | 'revokePolicy'
  | 'revokeAllowance'
  | 'execute';

export interface WalletSessionView {
  readonly account: string;
  readonly chainId: number;
  readonly role: 'unknown';
}

export interface WalletWorkbenchState {
  readonly connected: boolean;
  readonly builderCodeConfigured: boolean;
  readonly writesEnabled: boolean;
  readonly disabledReason?: string;
  readonly session?: WalletSessionView;
  readonly chainName: string;
  readonly guardAddress: string;
  readonly tokenAddress: string;
  readonly deploymentVerified: boolean;
}

export interface WalletFormValues {
  readonly owner: string;
  readonly agent: string;
  readonly merchant: string;
  readonly amount: string;
  readonly perPaymentLimit: string;
  readonly dailyLimit: string;
  readonly expiresAt: string;
  readonly reference: string;
}

export interface WalletPreparedOperation {
  readonly id: string;
  readonly action: WalletAction;
  readonly title: string;
  readonly chainId: number;
  readonly guardAddress: string;
  readonly tokenAddress: string;
  readonly signer: string;
  readonly requiredRole: 'owner' | 'agent';
  readonly transactionCount: 1;
  readonly builderCode: string;
  readonly attributionSuffix: string;
  readonly calldata: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

export interface WalletOperationResult {
  readonly action: WalletAction;
  readonly status: 'submitted' | 'confirmed' | 'reverted' | 'cancelled';
  readonly transactionHash?: string;
  readonly message: string;
  readonly next?: WalletPreparedOperation;
}

export interface WalletWorkbenchAdapter {
  readonly getState: () => WalletWorkbenchState;
  readonly subscribe: (listener: (state: WalletWorkbenchState) => void) => () => void;
  readonly connect: () => Promise<void>;
  readonly prepare: (action: WalletAction, values: WalletFormValues) => Promise<WalletPreparedOperation>;
  readonly confirm: (prepared: WalletPreparedOperation) => Promise<WalletOperationResult>;
}

const asAddress = (value: string, label: string) => {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error(`${label} must be a valid nonzero address.`);
  return getAddress(value);
};

const usdcAmount = (value: string, label: string, allowZero = false) => {
  let amount: bigint;
  try { amount = parseUnits(value, 6); } catch { throw new Error(`${label} must be an exact USDC amount with at most six decimal places.`); }
  if (amount < 0n || (!allowZero && amount === 0n)) throw new Error(`${label} must be greater than zero.`);
  return amount;
};

const expirySeconds = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Policy expiry is invalid.');
  return BigInt(Math.floor(timestamp / 1_000));
};

const opaqueReference = (value: string) => {
  if (!isHex(value, { strict: true }) || value.length !== 66 || /^0x0{64}$/i.test(value)) throw new Error('Generate a valid nonzero bytes32 reference.');
  return value;
};

const exactUsdc = (value: bigint) => `${formatUnits(value, 6)} USDC (${value.toString()} base units)`;

const exactTimestamp = (value: bigint) => {
  const date = new Date(Number(value) * 1_000);
  const readable = Number.isNaN(date.getTime()) ? 'Outside browser date range' : date.toISOString();
  return `${readable} (${value.toString()} Unix seconds)`;
};

function coordinatorState(state: CoordinatorState): WalletWorkbenchState {
  const ready = state.status === 'ready';
  return {
    connected: ready,
    builderCodeConfigured: ready ? state.writesEnabled : true,
    writesEnabled: state.writesEnabled,
    ...(state.reason ? { disabledReason: state.reason } : {}),
    ...(ready ? { session: { account: state.session.account, chainId: state.session.chainId, role: 'unknown' as const } } : {}),
    chainName: 'Base Sepolia',
    guardAddress: ready ? state.session.deployment.guard : BASE_SEPOLIA_GUARD_ADDRESS,
    tokenAddress: ready ? state.session.deployment.stablecoin : BASE_SEPOLIA_USDC_ADDRESS,
    deploymentVerified: ready,
  };
}

function transactionDetails(action: WalletAction, fields: WalletFormValues, operation: PreparedOperation) {
  const common = [
    { label: 'Transaction target', value: operation.request.to },
    { label: 'Snapshot block', value: operation.snapshot.number.toString() },
    { label: 'Prepared until', value: new Date(operation.expiresAt).toISOString() },
  ];
  if (action === 'configure') return [
    { label: 'Agent', value: fields.agent },
    { label: 'Per-payment limit', value: `${fields.perPaymentLimit} USDC` },
    { label: 'Daily limit', value: `${fields.dailyLimit} USDC` },
    { label: 'Expiry', value: new Date(fields.expiresAt).toISOString() },
    ...common,
  ];
  if (action === 'allowMerchant') return [{ label: 'Merchant', value: fields.merchant }, { label: 'Permission', value: 'Allowed' }, ...common];
  if (action === 'approve') return [
    { label: 'Exact bounded allowance', value: `${formatUnits(operation.approval?.desiredAmount ?? 0n, 6)} USDC` },
    { label: 'Approval step', value: operation.approval?.step === 'zero' ? 'Reset existing allowance to zero first' : 'Set exact allowance' },
    ...common,
  ];
  if (action === 'revokeAllowance') return [{ label: 'Exact allowance', value: '0 USDC' }, ...common];
  if (action === 'pause' || action === 'unpause') return [{ label: 'Policy state', value: action === 'pause' ? 'Paused' : 'Active' }, ...common];
  if (action === 'revokePolicy') return [{ label: 'Policy state', value: 'Revoked' }, ...common];
  return [
    { label: 'Policy owner', value: fields.owner },
    { label: 'Merchant', value: fields.merchant },
    { label: 'Payment amount', value: `${fields.amount} USDC` },
    { label: 'Opaque reference', value: fields.reference },
    { label: 'Snapshot policy agent', value: operation.payment?.state.policy.agent ?? 'Unavailable' },
    { label: 'Snapshot per-payment limit', value: operation.payment ? exactUsdc(operation.payment.state.policy.perPaymentLimit) : 'Unavailable' },
    { label: 'Snapshot daily limit', value: operation.payment ? exactUsdc(operation.payment.state.policy.dailyLimit) : 'Unavailable' },
    { label: 'Snapshot daily spend', value: operation.payment ? exactUsdc(operation.payment.state.dailySpend.spent) : 'Unavailable' },
    { label: 'Snapshot expiry', value: operation.payment ? exactTimestamp(operation.payment.state.policy.expiresAt) : 'Unavailable' },
    { label: 'Snapshot merchant permission', value: operation.payment?.state.merchantAllowed ? 'Allowed' : 'Not allowed' },
    { label: 'Snapshot reference used', value: operation.payment?.state.referenceUsed ? 'Yes' : 'No' },
    { label: 'Snapshot policy paused', value: operation.payment?.state.policy.paused ? 'Yes' : 'No' },
    { label: 'Snapshot policy revoked', value: operation.payment?.state.policy.revoked ? 'Yes' : 'No' },
    { label: 'Snapshot policy revision', value: operation.payment?.state.policy.revision.toString() ?? 'Unavailable' },
    ...common,
  ];
}

export function createWalletWorkbenchAdapter(coordinator: TransactionCoordinator): WalletWorkbenchAdapter {
  const pending = new Map<string, { readonly operation: PreparedOperation; readonly action: WalletAction }>();
  return {
    getState: () => coordinatorState(coordinator.getState()),
    subscribe: (listener) => coordinator.subscribe((state) => listener(coordinatorState(state))),
    connect: async () => { await coordinator.connect(); },
    prepare: async (action, fields) => {
      let operation: PreparedOperation;
      if (action === 'configure') operation = await coordinator.prepareConfigure({
        agent: asAddress(fields.agent, 'Agent'),
        perPaymentLimit: usdcAmount(fields.perPaymentLimit, 'Per-payment limit'),
        dailyLimit: usdcAmount(fields.dailyLimit, 'Daily limit'),
        expiresAt: expirySeconds(fields.expiresAt),
      });
      else if (action === 'allowMerchant') operation = await coordinator.prepareSetMerchant({ merchant: asAddress(fields.merchant, 'Merchant'), allowed: true });
      else if (action === 'approve') operation = await coordinator.prepareApprove({ amount: usdcAmount(fields.amount, 'Exact allowance') });
      else if (action === 'pause' || action === 'unpause') operation = await coordinator.preparePause({ paused: action === 'pause' });
      else if (action === 'revokePolicy') operation = await coordinator.prepareRevoke();
      else if (action === 'revokeAllowance') operation = await coordinator.prepareApprove({ amount: 0n });
      else operation = await coordinator.prepareExecute({
        owner: asAddress(fields.owner, 'Policy owner'),
        merchant: asAddress(fields.merchant, 'Merchant'),
        amount: usdcAmount(fields.amount, 'Payment amount'),
        externalReference: opaqueReference(fields.reference),
      });

      pending.clear();
      pending.set(operation.id, { operation, action });
      return {
        id: operation.id,
        action,
        title: ACTION_LABELS[action],
        chainId: operation.chainId,
        guardAddress: BASE_SEPOLIA_GUARD_ADDRESS,
        tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
        signer: operation.account,
        requiredRole: operation.role,
        transactionCount: 1,
        builderCode: BASE_BUILDER_CODE,
        attributionSuffix: BASE_BUILDER_CODE_SUFFIX,
        calldata: operation.request.data,
        details: transactionDetails(action, fields, operation),
      };
    },
    confirm: async (prepared) => {
      const stored = pending.get(prepared.id);
      if (!stored || stored.action !== prepared.action) throw new Error('The prepared transaction is stale. Prepare it again.');
      pending.delete(prepared.id);
      const result = await coordinator.confirm(stored.operation, { approved: true });
      if (result.status === 'cancelled') return { action: prepared.action, status: 'cancelled', message: 'Transaction cancelled. Nothing was sent.' };
      const zeroFirst = stored.operation.approval?.step === 'zero' && result.followUp;
      return {
        action: prepared.action,
        status: 'submitted',
        transactionHash: result.transactionHash,
        message: zeroFirst
          ? 'Zero-allowance transaction submitted. Wait for confirmation, then prepare the exact bounded allowance again.'
          : 'Transaction submitted to Base Sepolia. Confirmation is not yet verified.',
      };
    },
  };
}

interface WalletWorkbenchProps {
  adapter: WalletWorkbenchAdapter;
}

const INITIAL_WALLET_FIELDS: WalletFormValues = {
  owner: '',
  agent: '',
  merchant: '',
  amount: '5.00',
  perPaymentLimit: '25.00',
  dailyLimit: '100.00',
  expiresAt: '2030-05-25T23:59',
  reference: '',
};

const generateReference = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const ACTION_LABELS: Readonly<Record<WalletAction, string>> = {
  configure: 'Configure policy',
  allowMerchant: 'Allow merchant',
  approve: 'Approve bounded USDC',
  pause: 'Pause policy',
  unpause: 'Unpause policy',
  revokePolicy: 'Revoke policy',
  revokeAllowance: 'Revoke USDC allowance',
  execute: 'Execute payment',
};

const OWNER_ACTIONS: readonly WalletAction[] = ['configure', 'allowMerchant', 'approve', 'pause', 'unpause', 'revokePolicy', 'revokeAllowance'];

const shortAddress = (value: string) => value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value || '—';
const identity = (state: WalletWorkbenchState) => state.session ? `${state.session.chainId}:${state.session.account.toLowerCase()}` : 'disconnected';

function OperationFields({ action, fields, onChange }: { action: WalletAction; fields: WalletFormValues; onChange: (key: keyof WalletFormValues, value: string) => void }) {
  const input = (key: keyof WalletFormValues, label: string, type: 'text' | 'number' | 'datetime-local' = 'text', suffix?: string) => (
    <label className="wallet-field">
      <span>{label}</span>
      <span className="wallet-input-wrap">
        <input aria-label={label} type={type} step={type === 'number' ? '0.01' : undefined} value={fields[key]} onChange={(event) => onChange(key, event.target.value)} autoComplete="off" spellCheck={false} />
        {suffix ? <b>{suffix}</b> : null}
      </span>
    </label>
  );

  if (action === 'configure') return <>{input('agent', 'Agent address')}{input('perPaymentLimit', 'Per-payment limit', 'number', 'USDC')}{input('dailyLimit', 'Daily limit', 'number', 'USDC')}{input('expiresAt', 'Policy expiry', 'datetime-local')}</>;
  if (action === 'allowMerchant') return <>{input('merchant', 'Merchant address')}</>;
  if (action === 'approve') return <>{input('amount', 'Exact allowance', 'number', 'USDC')}</>;
  if (action === 'execute') return <>{input('owner', 'Policy owner')}{input('merchant', 'Merchant address')}{input('amount', 'Payment amount', 'number', 'USDC')}</>;
  return null;
}

export function WalletWorkbench({ adapter }: WalletWorkbenchProps) {
  const [adapterState, setAdapterState] = useState<WalletWorkbenchState>(() => adapter.getState());
  const [action, setAction] = useState<WalletAction>('configure');
  const [fields, setFields] = useState<WalletFormValues>(() => ({ ...INITIAL_WALLET_FIELDS, reference: generateReference() }));
  const [prepared, setPrepared] = useState<WalletPreparedOperation>();
  const [result, setResult] = useState<WalletOperationResult>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revocation, setRevocation] = useState({ policy: false, allowance: false });
  const previousIdentity = useRef(identity(adapterState));

  useEffect(() => {
    setAdapterState(adapter.getState());
    return adapter.subscribe(setAdapterState);
  }, [adapter]);

  useEffect(() => {
    const nextIdentity = identity(adapterState);
    if (previousIdentity.current !== nextIdentity) {
      setPrepared(undefined);
      setResult(undefined);
      setRevocation({ policy: false, allowance: false });
      setMessage(previousIdentity.current === 'disconnected' ? '' : 'The wallet account or chain changed. Prepare the transaction again.');
      previousIdentity.current = nextIdentity;
    }
  }, [adapterState]);

  const update = (key: keyof WalletFormValues, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setPrepared(undefined);
    setResult(undefined);
  };

  const selectAction = (next: WalletAction) => {
    setAction(next);
    setPrepared(undefined);
    setResult(undefined);
    setMessage('');
  };

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      await adapter.connect();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection failed.');
    } finally {
      setBusy(false);
    }
  };

  const prepare = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setResult(undefined);
    try {
      const next = await adapter.prepare(action, fields);
      if (next.transactionCount !== 1) throw new Error('Safety check failed: each approval must contain exactly one transaction.');
      setPrepared(next);
    } catch (error) {
      setPrepared(undefined);
      setMessage(error instanceof Error ? error.message : 'Transaction preparation failed.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!prepared) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await adapter.confirm(prepared);
      setResult(next);
      if (next.next && next.next.transactionCount !== 1) throw new Error('Safety check failed: the next approval must contain exactly one transaction.');
      setPrepared(next.next);
      if (next.status === 'confirmed' && next.action === 'revokePolicy') setRevocation((current) => ({ ...current, policy: true }));
      if (next.status === 'confirmed' && next.action === 'revokeAllowance') setRevocation((current) => ({ ...current, allowance: true }));
    } catch (error) {
      setResult(undefined);
      setMessage(error instanceof Error ? error.message : 'The wallet request failed. No confirmed transaction is shown.');
      setPrepared(undefined);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!prepared) return;
    setResult({ action: prepared.action, status: 'cancelled', message: 'Transaction cancelled. Nothing was sent.' });
    setPrepared(undefined);
    setMessage('');
  };

  const policyRevoked = revocation.policy;
  const allowanceRevoked = revocation.allowance;
  const isOwnerAction = OWNER_ACTIONS.includes(action);
  const canPrepare = adapterState.connected && adapterState.writesEnabled && !busy;

  return (
    <section className="wallet-workbench" id="security-notes" aria-label="Base Sepolia wallet workbench">
      <div className="wallet-network-banner">
        <div><strong>Base Sepolia</strong><span>Testnet deployment</span><span>Unaudited</span></div>
        <p>Builder Code {adapterState.builderCodeConfigured ? 'configured' : 'missing'} · No real funds · No automatic transactions.</p>
      </div>

      <div className="wallet-identity" aria-label="Wallet transaction domain">
        <dl>
          <div><dt>Chain</dt><dd>{adapterState.chainName} · 84532</dd></div>
          <div><dt>Guard</dt><dd title={adapterState.guardAddress}>{shortAddress(adapterState.guardAddress)}</dd></div>
          <div><dt>Token</dt><dd title={adapterState.tokenAddress}>USDC · {shortAddress(adapterState.tokenAddress)}</dd></div>
          <div><dt>Signer</dt><dd title={adapterState.session?.account}>{shortAddress(adapterState.session?.account ?? '')}</dd></div>
          <div><dt>Role</dt><dd>{adapterState.session ? 'Resolved per action' : 'Not connected'}</dd></div>
        </dl>
        <button className="connect-button" type="button" onClick={connect} disabled={busy}>{adapterState.connected ? 'Reconnect wallet' : 'Connect wallet'}</button>
      </div>

      {!adapterState.deploymentVerified && adapterState.disabledReason?.toLowerCase().includes('failed') ? <p className="wallet-alert error" role="alert">The configured deployment could not be verified. Wallet writes are disabled.</p> : null}
      {!adapterState.builderCodeConfigured ? <p className="wallet-alert" role="status"><strong>Builder Code required.</strong> Transactions stay disabled until the public app config includes a valid Base Builder Code.</p> : null}
      {adapterState.disabledReason ? <p className="wallet-alert" role="status">{adapterState.disabledReason}</p> : null}
      {message ? <p className="wallet-alert error" role="alert">{message}</p> : null}

      <div className="wallet-grid">
        <form className="wallet-operation" onSubmit={prepare}>
          <div className="wallet-action-heading">
            <div><h2>Prepare one transaction</h2><p>Choose an action, then review every field before opening your wallet.</p></div>
            <span>{isOwnerAction ? 'Owner' : 'Agent'} signature</span>
          </div>
          <label className="wallet-field action-select"><span>Action</span><select aria-label="Wallet action" value={action} onChange={(event) => selectAction(event.target.value as WalletAction)}>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <OperationFields action={action} fields={fields} onChange={update} />
          {action === 'execute' ? <div className="generated-reference"><span><strong>Generated reference</strong><code>{fields.reference}</code></span><button type="button" onClick={() => update('reference', generateReference())}>Regenerate</button></div> : null}
          <div className="one-transaction-note"><strong>One click, one transaction.</strong><span>Preparing never requests a signature.</span></div>
          <button className="run-button" type="submit" disabled={!canPrepare}>{busy ? 'Working…' : `Review ${ACTION_LABELS[action].toLowerCase()}`}</button>
        </form>

        <section className="transaction-review" aria-labelledby="transaction-review-title">
          <h2 id="transaction-review-title">Review before signature</h2>
          {prepared ? (
            <>
              <div className="review-status"><span>Prepared</span><strong>{prepared.title}</strong><small>No wallet request has been made.</small></div>
              <dl aria-label="Prepared transaction details">
                <div><dt>Chain</dt><dd>{prepared.chainId} · Base Sepolia</dd></div>
                <div><dt>Guard</dt><dd>{prepared.guardAddress}</dd></div>
                <div><dt>Token</dt><dd>{prepared.tokenAddress}</dd></div>
                <div><dt>Signer</dt><dd>{prepared.signer}</dd></div>
                <div><dt>Required role</dt><dd>{prepared.requiredRole}</dd></div>
                <div><dt>Builder Code</dt><dd><code>{prepared.builderCode}</code></dd></div>
                <div><dt>ERC-8021 suffix</dt><dd><code>{prepared.attributionSuffix}</code></dd></div>
                <div><dt>Final calldata</dt><dd><code>{prepared.calldata}</code></dd></div>
                <div><dt>Nonce</dt><dd>Wallet-managed; this app does not set or retry it</dd></div>
                {prepared.details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
              </dl>
              <div className="review-actions">
                <button type="button" className="secondary-button" onClick={cancel} disabled={busy}>Cancel</button>
                <button type="button" className="sign-button" onClick={confirm} disabled={busy || !adapterState.writesEnabled}>Request one signature</button>
              </div>
            </>
          ) : <div className="review-empty"><strong>Nothing prepared</strong><p>Connect the correct role, choose one action, and prepare it. The exact transaction domain and values will appear here.</p></div>}

          {result ? <div className={`transaction-result ${result.status}`} role="status"><span>{result.status}</span><strong>{result.message}</strong>{result.transactionHash ? <code>{result.transactionHash}</code> : null}</div> : null}
          {policyRevoked !== allowanceRevoked ? <p className="partial-revoke" role="status"><strong>Partial revocation.</strong> {policyRevoked ? 'Policy revoked; revoke the USDC allowance separately.' : 'Allowance revoked; revoke the policy separately.'}</p> : null}
        </section>
      </div>
    </section>
  );
}

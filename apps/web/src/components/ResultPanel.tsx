import { formatUnits } from 'viem';
import type { SimulationResult } from '../model';
import type { SimulatorFields } from '../model';
import { CheckIcon, XIcon } from './Icons';

interface ResultPanelProps {
  result: SimulationResult;
  fields: SimulatorFields;
}

const shortHash = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-10)}`;
export function ResultPanel({ result, fields }: ResultPanelProps) {
  if (!result.ok) {
    return (
      <section className="result-panel" aria-live="polite" aria-labelledby="decision-heading">
        <h2 className="panel-title" id="decision-heading">Preflight decision</h2>
        <div className="decision denied"><span className="decision-icon"><XIcon /></span><div><h2>Denied</h2><p>{result.message}</p></div></div>
        <p className="result-empty">Correct the invalid input, then run the local preflight again.</p>
      </section>
    );
  }
  const allowed = result.decision.decision === 'allow';
  const visibleChecks = result.decision.checks;
  return (
    <section className="result-panel" aria-live="polite" aria-labelledby="decision-heading">
      <h2 className="panel-title" id="decision-heading">Preflight decision</h2>
      <div className={`decision ${allowed ? 'allowed' : 'denied'}`}>
        <span className="decision-icon">{allowed ? <CheckIcon /> : <XIcon />}</span>
        <div><h2>{allowed ? 'Allowed' : 'Denied'}</h2><p>{allowed ? 'Every supplied policy check passed.' : 'The policy would stop this payment.'}</p></div>
      </div>
      <div className="checks">
        <ul>{visibleChecks.map((item) => (
          <li key={item.ruleId} title={`${item.ruleId}: ${item.reason}`}>
            <span className={`check-mark ${item.status}`} aria-label={item.status}>{item.status === 'pass' ? <CheckIcon /> : <XIcon />}</span>
            <span>{item.label}</span><small>{item.status === 'pass' ? 'Pass' : item.status === 'indeterminate' ? 'Unknown' : 'Denied'}</small>
          </li>
        ))}</ul>
      </div>
      <div className="enforcement" id="security-notes">
        <h3>What the contract enforces</h3>
        <dl>
          <div><dt>Allowed merchant</dt><dd>Only the specified merchant can receive payments.</dd></div>
          <div><dt>Per-payment cap</dt><dd>Each payment stays at or below its configured limit.</dd></div>
          <div><dt>Daily ceiling</dt><dd>Total daily spend cannot exceed the policy ceiling.</dd></div>
          <div><dt>Single-use reference</dt><dd>Each reference can settle only one payment.</dd></div>
        </dl>
      </div>
      <div className="evidence" id="receipt">
        <h3>Evidence <span>(simulation output)</span></h3>
        <pre aria-label="Simulation evidence"><code>{[
          `chainId:     8453 (Base)`,
          `agent:       ${fields.agent}`,
          `merchant:    ${fields.merchant}`,
          `amount:      ${formatUnits(result.amount, 6)} USDC`,
          `reference:   ${fields.reference || '—'}`,
          `hash:        ${shortHash(result.referenceHash)}`,
          `evaluatedAt: ${result.evaluatedAt}`,
          `utcDay:      ${result.day}`,
          `policyExpiry:${result.expiresAt}`,
        ].join('\n')}</code></pre>
      </div>
    </section>
  );
}

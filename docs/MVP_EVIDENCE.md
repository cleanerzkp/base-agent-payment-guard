# MVP evidence

Status date: 2026-08-12

This file records observed local evidence. It does not claim public release,
deployment, audit, users, volume, revenue, Builder Code, or grant eligibility.

## Environment

- macOS arm64
- Node.js 24.15.0
- npm 11.17.0
- Foundry 1.5.1
- Solidity 0.8.28
- Wallet credentials, RPC secrets, deployments, and funds: none

## Contract evidence

- Base mainnet and Base Sepolia deployment gates.
- Immutable contract-code token check.
- Owner policy, revision-scoped merchant permissions, pause, revoke, and agent
  authorization.
- Per-payment, owner-global daily, expiry, replay, self-payment, malformed
  request, and reconfiguration checks.
- Checks-effects-interactions, reentrancy blocking, and defensive ERC-20 return
  handling.
- Deterministic receipt emission.
- Fresh-context review closed the direct self-payment metric-integrity gap and
  added policy-rotation replay and daily-spend regression cases.

Observed local contract result before final handoff: 22 tests passed, zero
failed; format passed; runtime size 4,610 bytes. Re-run the commands in README
after any change and update this count only from observed output.

## SDK and web evidence

- Exact-chain Base and Base Sepolia policy.
- Fail-closed pure preflight with stable Rule IDs.
- Typed transaction builders without private-key inputs.
- Trusted-RPC receipt verification and domain-bound aggregate helpers.
- Responsive, local-only policy simulator with truthful unaudited and
  undeployed state.
- Optional injected-wallet readiness check that requests no transaction.
- Clean dependency install from the committed lock with lifecycle scripts
  disabled.
- Strict runtime-type, uint-width, address, reference, receipt-origin, receipt-ID,
  transaction-success, block-provenance, confirmation-depth, and metric-domain
  validation at the SDK boundary.

Observed result for this updated repository snapshot: exact locked `npm ci`
completed, then `npm run check:all` passed with 34 SDK tests, 5 web tests, both
TypeScript typechecks and production builds, 22 Solidity tests, Solidity format,
offline contract build, and contract size checks. Previously recorded browser
checks passed for the allowed path, self-payment denial, invalid-expiry failure,
and visible Rule ID diagnostics. At 390 by 844 CSS pixels, document width
remained 390 pixels and the primary button measured 52 pixels. The final console
contained zero errors and zero warnings.

Accepted screenshots:

- [`mvp-desktop.png`](mvp-desktop.png), 1536 by 1024 CSS pixels.
- [`mvp-mobile.png`](mvp-mobile.png), 390 by 844 CSS pixels.

## Dependency and CI evidence

- Exact direct dependency versions and committed npm lockfile.
- npm lifecycle scripts disabled by default.
- Local registry audit reported zero known vulnerabilities at the observation
  time.
- CI actions are pinned to immutable commits.
- CI separately runs TypeScript and Foundry gates.
- Exact locked `npm ci` and `npm run check:all` completed for this updated
  repository snapshot.
- `npm audit --audit-level=high` reported zero vulnerabilities at the
  observation time.

## Independent review

A fresh-context review reproduced and closed malformed scalar coercion, unsafe
caller-supplied state handling, self-payment metrics, stale UI evidence, hidden
denials, and mobile overflow. A later publication review found that structurally
valid decoded logs could enter aggregate metrics without successful transaction,
block-provenance, or confirmation evidence. The updated SDK closes that finding
by requiring verifier-produced receipts bound to an explicit chain and guard
domain. The exact locked completion gates passed after remediation.

## Explicit limits

- The receipt verifier trusts its chain-pinned RPC. It does not prove
  receipt-trie inclusion or consensus finality cryptographically.
- Accepted receipt evidence supports contract-execution metrics, not unique
  people, independent merchant control, revenue, organic demand, or arm's-length
  commerce.
- A standard, non-rebasing, non-fee-on-transfer stablecoin is assumed.
- No independent audit or stateful invariant-fuzz campaign has been completed.
- No Base or Coinbase team has reviewed or endorsed the project.
- No live Google Form was authenticated or submitted.

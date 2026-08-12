# MVP evidence

Status date: 2026-08-12

This file records observed repository, Base Sepolia, and public static-host
evidence. It does not claim a successful wallet transaction, audit, users,
volume, revenue, Builder Code attribution, grant eligibility, or Base
endorsement.

## Environment

- macOS arm64
- Node.js 24.15.0
- npm 11.17.0
- Foundry 1.5.1
- Solidity 0.8.28
- No wallet credential, RPC secret, seed phrase, private key, or keystore is
  stored in the repository

## Base Sepolia deployment evidence

- Chain ID: `84532`
- Guard: `0x048eAF1596492cd29378fF240841b8ec32db50eA`
- Immutable token: canonical Base Sepolia USDC at
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Deployment transaction:
  `0xd65799f594885c690443a15511ae585a0d1df111980fad5f9f0ac95c49539751`
- Deployment block: `45395858`
- Runtime code size: 4,610 bytes
- Source verification: Sourcify exact match
- Machine-readable evidence: [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json)

The deployment used Base Sepolia test ETH and testnet USDC only. It does not
prove that the browser app is publicly hosted, that an owner policy or payment
was executed, or that the project has a user.

## Builder Code evidence

- Public Builder Code: `bc_xiu880fh`
- Registration state: obtained for the dedicated project wallet on 2026-08-12
- App integration: observed in reviewed source and automated wallet-review tests
- Attributed Base Sepolia transaction: not yet observed

The code is public ERC-8021 attribution metadata. It is not a credential and
does not prove a transaction, user, impact, endorsement, or award.

## Public browser release evidence

- Production URL: <https://base-agent-payment-guard.vercel.app>
- Vercel deployment: `dpl_3gqP92qf2hA38PpEq7LJ3sdUmgMj`
- Reviewed implementation commit: `25e7194807cee180fcd5afca0fc53544f7c8634f`
- Deployment state: `READY`, production target
- Public HTML SHA-256:
  `eb6f865b75e43dc9c4ebbbfe360d3e6368b5e2725e3d5f75fc335064994c62c5`
- Public main JavaScript SHA-256:
  `0f545c5036bc32713347f781b63c2c2ec426696c1bf49084f6c3c7022b155b02`
- Public CSS SHA-256:
  `9f012258dee5c199b9937232281d0119b0fa2ba93c8f7e61b2df44f3f0fb47bf`
- The three public hashes matched the local reviewed production build.
- CSP, permissions policy, no-referrer, nosniff, frame denial, and HSTS were
  observed on the public response.
- Desktop and 390-by-844 browser checks passed with zero console messages.
- Before explicit wallet connection, the page made only seven same-origin
  static requests. With no injected wallet, Connect failed safely without an
  RPC or transaction request.

No wallet was injected during the initial public QA pass. That pass therefore
does not claim a successful onchain read, simulation, signature, receipt, user,
or attributed transaction.

A separate public QA pass injected a synthetic refusal-only EOA provider with
no key. It verified the pinned guard code, immutable token, and Base Sepolia
chain through `https://sepolia.base.org`, prepared a configure-policy request,
displayed the exact ERC-8021 suffix and final calldata, simulated at a fresh
block, and reached the single signature boundary. The synthetic provider then
returned user rejection; the page reported that no transaction was sent.
No signature, hash, receipt, state change, user, or attribution is claimed.

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

Observed local contract result before final handoff: 28 tests passed, zero
failed, including three 256-run fuzz properties; format passed; runtime size
4,610 bytes. Re-run the commands in README
after any change and update this count only from observed output.

## SDK and web evidence

- Exact-chain Base and Base Sepolia policy.
- Fail-closed pure preflight with stable Rule IDs.
- Typed transaction builders without private-key inputs.
- Trusted-RPC receipt verification and domain-bound aggregate helpers.
- Responsive policy simulator with a verified testnet contract boundary and
  truthful unaudited state.
- Injected-wallet workbench for explicit Base Sepolia testnet writes. It
  verifies the pinned deployment, reviews exact calldata and attribution,
  simulates at a fresh block, and never retries a send.
- The public wallet workbench is not proof of a successful transaction. That
  requires separate user authorization and onchain evidence.
- Clean dependency install from the committed lock with lifecycle scripts
  disabled.
- Strict runtime-type, uint-width, address, reference, receipt-origin, receipt-ID,
  transaction-success, block-provenance, confirmation-depth, and metric-domain
  validation at the SDK boundary.

Observed result for this updated repository snapshot: exact locked `npm ci`
completed, then `npm run check:all` passed with 34 SDK tests, 40 web tests, both
TypeScript typechecks and production builds, 28 Solidity tests, Solidity format,
offline contract build, and contract size checks. Previously recorded browser
checks passed for the allowed path, self-payment denial, invalid-expiry failure,
and visible Rule ID diagnostics. At 390 by 844 CSS pixels, document width did
not exceed the viewport. The public browser console contained zero errors and
zero warnings.

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
- The official Base Grant nomination form is authenticated through Base's
  funding documentation and Base Grants article, but it has not been submitted.
- The separate pasted up-to-$5,000 live-product form remains unauthenticated.

# Security policy and threat model

## Overview

Base Agent Payment Guard is a non-custodial payment-policy proof of concept for
Base. A token owner grants a standard ERC-20 allowance to the guard and assigns
an agent. The agent can transfer the configured token only to owner-approved
merchants and only within owner-defined per-payment, daily, expiry, pause, and
replay limits. The repository also contains a TypeScript SDK and browser demo.

The primary assets are owner token balances and allowances, policy integrity,
receipt integrity, transaction attribution, user addresses, and the accuracy
of displayed or aggregated activity. The MVP is not audited and must not be
used with real funds.

## Threat Model, Trust Boundaries, and Assumptions

### Actors and boundaries

- The owner controls policy configuration, merchant authorization, revocation,
  token allowance, and the wallet that signs those changes.
- The agent wallet is untrusted beyond the narrow authority encoded in the
  owner's active policy. Compromise of the agent must not permit an arbitrary
  recipient, token, call, amount, or replay.
- Merchant addresses are untrusted. The contract transfers only the immutable
  configured ERC-20 token and does not call merchant code.
- The configured token contract is an operator-controlled deployment input.
  The design assumes a standard, non-rebasing, non-fee-on-transfer ERC-20 such
  as the canonical USDC deployment for the selected Base network.
- Wallet providers, RPC responses, browser extensions, environment variables,
  and user-entered addresses are outside the repository trust boundary.
- SDK and web preflight results are advisory. The contract is the enforcement
  boundary. A compromised UI must not bypass contract checks.
- Base block timestamps and chain identity are consensus inputs. Daily limits
  use UTC-like timestamp buckets and tolerate normal timestamp variation.
- Developers and deployers control build dependencies, contract address
  configuration, token address configuration, and release artifacts.

### Invariants

- Deployment succeeds only on chain IDs 8453 or 84532.
- The token is immutable and must contain contract code at deployment.
- Only an owner can configure that owner's agent policy and merchant set.
- Only the configured agent can pay under an active, unexpired policy.
- A payment must be nonzero, within its per-payment and daily limits, and sent
  to an allowed nonzero merchant that is not the owner.
- A nonzero external reference is single-use for an owner across all policy
  revisions and agent rotations.
- Same-day spend is owner-global across policy revisions. Reconfiguration does
  not reset the daily ceiling.
- Spend and replay state update before the ERC-20 call; reentrancy is blocked.
- Failed transfers revert all spend and replay changes.
- The contract has no privileged administrator, upgrade hook, custody path,
  arbitrary call primitive, or private-key handling.
- Onchain counts and volume are derived only from SDK verifier output for an
  explicit chain and guard domain. The verifier requires a successful trusted
  RPC transaction receipt, matching transaction and block provenance, a
  non-removed guard event, and caller-selected confirmation depth.
- SDK receipt verification is not a cryptographic receipt-trie inclusion proof
  or a consensus-finality proof. It trusts the configured RPC for chain
  identity, transaction receipt, block hash, log contents, and head height.
  Confirmation depth is evidence from that RPC, not independent finality.
- Verifier branding and in-process identity prevent accidental aggregation of
  raw, copied, or deserialized logs. They do not defend against malicious code
  in the same JavaScript process or a dishonest RPC. Persist raw evidence and
  reverify it after process boundaries. Use a chain-pinned RPC and an
  independently reviewed indexer or proof-verifying client for higher-assurance
  reporting.
- Accepted logs support execution metrics, not unique-user, independent-merchant,
  revenue, or organic-demand claims. External reporting must disclose its RPC
  source, confirmation rule, exclusions, and same-controller or Sybil limits.

## Attack Surface, Mitigations, and Attacker Stories

### Contract surface

An attacker may compromise an agent and attempt to pay an unapproved merchant,
exceed a limit, pay after expiry or revocation, or reuse a reference. Contract
authorization, allowlisting, amount checks, daily accounting, expiry, pause,
and reference state must reject each attempt.

A malicious or nonstandard token may return false, return malformed data,
reenter, take a transfer fee, rebase, or misreport balances. Low-level return
validation and reentrancy protection address only some of these behaviors. The
MVP assumes a standard immutable stablecoin and does not claim compatibility
with arbitrary tokens.

An owner may accidentally approve too much or configure the wrong agent or
merchant. Direct owner-to-owner receipts are rejected, but independently
controlled-looking addresses can still share one real controller. Receipt logs
therefore prove contract execution, not unique humans or arm's-length commerce.
The contract cannot recover an owner's wallet. The UI must show the
network, contract, token, addresses, limits, expiry, and approval before a
signature. Owners must be able to revoke the policy and token allowance.

### SDK and web surface

Attacker-controlled values include addresses, amounts, timestamps, references,
RPC data, chain IDs, receipt logs, browser provider events, and environment
configuration. Parsers and transaction builders must validate these values,
fail closed on unsupported chains or malformed data, and avoid number coercion
for token quantities. Receipt aggregation accepts only immutable verifier output
from the expected chain and guard domain. The app must never request a seed
phrase or accept a raw private key.

Pure preflight trusts its caller-supplied policy, `merchantAllowed`,
`spentToday`, `referenceUsed`, and `now` values. Well-formed values can still be
stale or come from different blocks. The current Base Sepolia payment flow reads
the policy, merchant permission, spend, replay state, and block timestamp at one
consistent block. Before each payment signature, it repeats those state reads at
a fresh verified block and simulates the exact final call. Approval writes also
re-read the allowance when the operation relies on its observed value. Every
write rechecks the wallet account, wallet chain, and verified deployment, then
simulates its exact Builder-Code-suffixed calldata at the fresh block. Owner
policy writes rely on that fresh exact-call simulation instead of unrelated
policy reads. A revert after simulation remains an expected race and must fail
closed.

The browser is exposed to dependency compromise, XSS, malicious extensions,
wallet phishing, stale contract configuration, and RPC inconsistency. The MVP
does not include a backend or secrets. The static-host policy permits only
same-origin resources and Base's official Sepolia RPC, denies framing and
plugins, and disables unused browser capabilities. This policy does not make
the app audited or production-safe. A production release still needs a
dependency review, verified artifact provenance, contract-address pinning,
independent audit, and deployment monitoring.

The injected provider is a local browser-extension boundary. It does not need
an outbound origin in `connect-src`. If a later wallet connector, analytics
provider, font, image host, or RPC is added, keep it blocked until its exact
origin, data flow, and failure behavior are reviewed. Do not weaken the policy
with wildcard origins or `unsafe-eval`.

### Developer and release surface

CI, package registries, lockfiles, deployment scripts, and environment files
are developer-controlled but supply-chain sensitive. Exact dependency pins,
committed locks, secret-free tests, and reproducible build gates reduce risk.
`vercel.json` produces only static assets. It defines no server function,
analytics integration, build-time environment input, or secret. The guard
address is public, hard-pinned in source, and must match the reviewed deployment
manifest before each release.
The registered ERC-8021 Builder Code `bc_xiu880fh` is public attribution
metadata, not a credential. Claim source integration only after the exact data
suffix appears in the reviewed transaction intent. Claim an attributed Base
Sepolia transaction only after it is observed onchain.
Deployment and verification remain manual, separately authorized actions.
The Base Sepolia deployment script rejects every other chain and token, and it
contains no signer input or secret-loading path. Supply its signer only through
Foundry's encrypted-account or hardware-wallet boundary. Never pass a raw key
or seed phrase through the CLI, environment, repository, or chat. Foundry
broadcast artifacts are ignored by Git and are not deployment evidence until
their transaction and onchain results are checked independently.
The injected-wallet workbench can submit real Base Sepolia testnet writes after
explicit review. It uses chain-specific deployment metadata, verifies contract
bytecode and the immutable token through the independent public RPC, and
invalidates prepared operations on account or chain changes. The review shows
the exact Builder Code, ERC-8021 suffix, and final calldata. Immediately before
each wallet request, the coordinator rechecks the account and chain. It rechecks
the allowance for approval operations and all payment-authority state for
payment operations, where those writes rely on the observed state. It verifies
the deployment and simulates the exact final calldata at a fresh block for every
write. The app intentionally omits the nonce from `eth_sendTransaction`; the
wallet manages it, and the coordinator never retries a send.

Out of scope for this MVP are wallet-provider compromise, Base consensus
failure, canonical stablecoin insolvency or blacklist behavior, phishing outside
the app, and recovery of compromised owner keys. These risks must still be
disclosed to production users.

## Severity Calibration (Critical, High, Medium, Low)

- Critical: an agent or external caller can transfer an owner's approved token
  to an arbitrary recipient, bypass all limits, change another owner's policy,
  or trigger arbitrary external calls.
- High: replay, daily-limit accounting, expiry, revocation, or reentrancy can
  cause a material unauthorized transfer; the UI silently targets the wrong
  verified contract or chain.
- Medium: malformed RPC or log data creates incorrect receipts or metrics; a
  configuration error causes a transaction to revert or materially misleads a
  signer before the wallet confirmation.
- Low: diagnostics leak non-secret public addresses, metrics omit a documented
  edge case, or local developer tooling fails without affecting signed calls.

## Reporting

Do not disclose wallet secrets in an issue. When the repository is public, use
GitHub private vulnerability reporting under **Security > Advisories > Report a
vulnerability**. Do not open a public issue for an unpatched vulnerability. If
private reporting is not enabled, keep the finding local and contact the
repository owner through a private GitHub channel. Do not test against
third-party deployments without written authorization.

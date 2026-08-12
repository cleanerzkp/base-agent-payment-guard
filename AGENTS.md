# Base Agent Payment Guard engineering guide

This repository is an independent Base-only product. Do not copy code, data,
schemas, branding, secrets, or credentials from any unrelated employer,
client, or third-party repository.

## Product scope

Build a non-custodial payment guard for Base agents. A wallet owner defines an
agent, merchant allowlist, per-payment limit, daily limit, and expiry. The agent
can transfer only the configured stablecoin from the owner to an allowed
merchant. Each successful payment emits a replay-resistant receipt.

## Security invariants

- Support only Base mainnet (`8453`) and Base Sepolia (`84532`).
- Never store, request, log, or bundle private keys or seed phrases.
- Never expose arbitrary target calls or arbitrary calldata execution.
- Only the owner can create, change, pause, or revoke the owner's policy.
- Only the configured agent can execute a payment.
- Fail closed for expired, paused, unallowlisted, over-limit, replayed, or
  malformed requests.
- Update spend and replay state before the token transfer; protect reentrancy.
- Treat the configured token as an immutable, standard ERC-20 stablecoin.
- Do not claim audit, production safety, mainnet deployment, users, revenue,
  grant eligibility, or Base endorsement without evidence.

## Public seams and completion gates

- Solidity contract ABI and emitted receipt events.
- TypeScript SDK pure preflight and typed transaction builders.
- Standard web app demo with synthetic local mode and injected-wallet mode.
- `forge test` must pass.
- SDK and web unit tests must pass.
- Type checks and production builds must pass.
- A repository-scoped threat model must describe assumptions and residual risk.

Preserve unrelated work. Use exact package versions and committed lockfiles.

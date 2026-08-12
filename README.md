# Base Agent Payment Guard

Base Agent Payment Guard is an independent, Base-only proof of concept for
bounded agentic stablecoin payments. A wallet owner chooses an agent, allowed
merchants, a per-payment limit, a daily limit, and an expiry. The contract
enforces that policy and emits a replay-resistant receipt for every payment.

The project is non-custodial. It does not request or store private keys. It
does not expose arbitrary contract calls. Tokens move directly from the owner
to an allowed merchant through a standard ERC-20 allowance.

## Status

This repository is a local MVP. It is not deployed, audited, endorsed by Base,
or used in production. It has no reported users, transaction volume, revenue,
Builder Code, or grant award. Do not use it with real funds.

## Surfaces

- Solidity policy and receipt contract for Base mainnet and Base Sepolia.
- TypeScript SDK for fail-closed preflight, typed contract requests, trusted-RPC
  receipt verification, and domain-bound aggregate metrics.
- Standard React web app with a synthetic no-wallet simulator and optional
  injected-wallet readiness check. The MVP does not request transactions.

The pure preflight accepts caller-supplied policy and chain state. It does not
prove that those values came from one block or remain current. Any future wallet
write flow must read policy, merchant permission, spend, replay state, and the
block timestamp at one consistent block. It must then simulate the exact
encoded call immediately before requesting a signature.

The receipt verifier requires an explicit Base chain, guard address,
transaction hash, log index, and confirmation threshold. It accepts metrics
only from verifier-created objects. Verification trusts the configured RPC for
chain identity, receipt status, block hash, logs, and head height. It is not a
cryptographic receipt-inclusion or consensus-finality proof. See
[`SECURITY.md`](SECURITY.md) for the complete trust model.

## Local verification

Prerequisites:

- Node.js 24 and npm 11
- Foundry 1.5 or later

```bash
npm ci
npm run check:all
```

Start the local browser demo:

```bash
npm run dev --workspace @base-agent-payment-guard/web
```

No command in this repository needs a wallet secret. The committed `.npmrc`
disables dependency lifecycle scripts and the lockfile pins resolved packages.

## Grant path

This is not yet eligible for a live-product grant form. See
[`docs/GRANT_READINESS.md`](docs/GRANT_READINESS.md) for the evidence gates and
[`docs/GRANT_APPLICATION_DRAFT.md`](docs/GRANT_APPLICATION_DRAFT.md) for a
truthful, non-submittable draft.

## Security

Read [`SECURITY.md`](SECURITY.md) before integration. The contract is an
unaudited proof of concept. Restrict all testing to synthetic tokens and local
or explicitly approved test environments.

## Independence

This project was created in a clean repository. It does not contain unrelated
employer, client, or third-party code or data.

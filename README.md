# Base Agent Payment Guard

Base Agent Payment Guard is an independent, Base-only proof of concept for
bounded agentic stablecoin payments. A wallet owner chooses an agent, allowed
merchants, a per-payment limit, a daily limit, and an expiry. The contract
enforces that policy and emits a replay-resistant receipt for every payment.

The project is non-custodial. It does not request or store private keys. It
does not expose arbitrary contract calls. Tokens move directly from the owner
to an allowed merchant through a standard ERC-20 allowance.

## Status

This repository is an MVP with one Base Sepolia testnet deployment. It is not
audited, endorsed by Base, production-ready, or used with real funds or users.
It has no reported users,
transaction volume, revenue, attributed Builder Code transaction, or grant
award. The public Builder Code `bc_xiu880fh` is integrated into the wallet
transaction intent, but no attributed transaction has been observed. Do not use
this project with real funds.

The public testnet app is
<https://base-agent-payment-guard.vercel.app>. It provides the synthetic
simulator and the reviewed Base Sepolia wallet workbench. The public release is
testnet-only and does not prove a successful wallet transaction or user.

The reviewed testnet deployment is
[`0x048eAF1596492cd29378fF240841b8ec32db50eA`](https://sepolia.basescan.org/address/0x048eAF1596492cd29378fF240841b8ec32db50eA).
It was deployed from commit `69b8eaa` in
[transaction `0xd657…9751`](https://sepolia.basescan.org/tx/0xd65799f594885c690443a15511ae585a0d1df111980fad5f9f0ac95c49539751),
binds canonical Base Sepolia USDC, and has an exact-match Sourcify verification.
The machine-readable evidence is in
[`deployments/base-sepolia.json`](deployments/base-sepolia.json).

## Surfaces

- Solidity policy and receipt contract for Base mainnet and Base Sepolia.
- TypeScript SDK for fail-closed preflight, typed contract requests, trusted-RPC
  receipt verification, and domain-bound aggregate metrics.
- Standard React web app with a synthetic simulator and an injected-wallet
  boundary. The public Base Sepolia wallet workbench displays exact transaction
  intent, simulates before each transaction-send request, and never retries a
  send.

The pure preflight accepts caller-supplied policy and chain state. It does not
prove that those values came from one block or remain current. Any future wallet
write integration must preserve the current coordinator's rules. Payment state
is read at one consistent block and repeated when the payment is confirmed.
Every write rechecks the wallet account, chain, and verified deployment, then
simulates its exact Builder-Code-suffixed calldata at a fresh block before the
wallet request.

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

## Base Sepolia deployment boundary

The deployment script targets only Base Sepolia (`84532`) and only Circle's
canonical Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
It fails before broadcast on any other chain or token. This is testnet USDC, not
mainnet USDC, and it has no real-funds guarantee.

The script never reads or accepts a private key. Use a Foundry encrypted account
or hardware wallet. Do not pass `--private-key`, a seed phrase, or key material
through an environment variable, shell argument, repository file, or chat.

Set only non-secret deployment values:

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_ADDRESS="0xYourPublicDeployerAddress"
export FOUNDRY_ACCOUNT="your-local-encrypted-account-name"
```

Simulate against Base Sepolia before any signature:

```bash
forge script script/DeployBaseSepolia.s.sol:DeployBaseSepolia \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS"
```

After reviewing the simulation, broadcast with an encrypted Foundry account:

```bash
forge script script/DeployBaseSepolia.s.sol:DeployBaseSepolia \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --account "$FOUNDRY_ACCOUNT" \
  --broadcast
```

For a Ledger hardware wallet, replace the account option with `--ledger`. Keep
the explicit `--sender` value and confirm chain `84532`, the contract creation,
and the immutable USDC address on the device before signing.

Verify the deployed source without an explorer API key:

```bash
export GUARD_ADDRESS="0xDeployedGuardAddress"
export BASE_SEPOLIA_USDC="0x036CbD53842c5426634e7929541eC2318f3dCF7e"

forge verify-contract \
  --chain 84532 \
  --verifier sourcify \
  "$GUARD_ADDRESS" \
  contracts/BaseAgentPaymentGuard.sol:BaseAgentPaymentGuard

cast chain-id --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  "$GUARD_ADDRESS" \
  "stablecoin()(address)"
```

Deployment does not make the MVP audited or production-ready. Use only Base
Sepolia test assets. Record the transaction hash, deployed address, source
verification URL, signer address, chain ID, and immutable token only after each
item is observed independently.

## Grant path

The official Base Builder Grant nomination accepts projects that are live on
Base testnet and describes retroactive grants of 1-5 ETH. This project has the
verified testnet contract and public app, but it is not nomination-ready until
it also has a one-minute demo, the required project and builder social profiles,
and the user's review of the form terms. The separate pasted up-to-$5,000
live-product form has not been authenticated from an official source and is not
the active path. See
[`docs/GRANT_READINESS.md`](docs/GRANT_READINESS.md) for the evidence gates and
[`docs/GRANT_APPLICATION_DRAFT.md`](docs/GRANT_APPLICATION_DRAFT.md) for a
truthful, non-submittable draft.

## Static hosting

[`vercel.json`](vercel.json) defines a secret-free static Vercel build and
security headers for the browser app. It permits browser connections only to
the same origin and Base's official Sepolia RPC. It does not add analytics,
server functions, wallet credentials, or a deployment claim.

The reviewed Base Sepolia deployment identity is hard-pinned in the web source.
The static build needs no environment variable.

Production URL: <https://base-agent-payment-guard.vercel.app>

Read [`docs/STATIC_HOSTING.md`](docs/STATIC_HOSTING.md) before publishing. A
hosting dashboard must not contain a private key, seed phrase, wallet password,
RPC credential, or deployer keystore.

## Security

Read [`SECURITY.md`](SECURITY.md) before integration. The contract is an
unaudited proof of concept. Restrict all testing to synthetic tokens and local
or explicitly approved test environments.

## Independence

This project was created in a clean repository. It does not contain unrelated
employer, client, or third-party code or data.

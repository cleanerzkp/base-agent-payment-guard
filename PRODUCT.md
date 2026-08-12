# Product specification

## One-line pitch

Base Agent Payment Guard lets a wallet owner delegate tightly limited USDC
payments to an agent while retaining merchant, amount, daily, expiry, pause,
and replay controls on Base.

## MVP flows

1. An owner configures one agent with a per-payment limit, daily limit, and
   expiry.
2. The owner allowlists one or more merchant addresses.
3. The owner approves the immutable stablecoin token for the guard contract.
4. The agent submits a payment with a unique external reference hash.
5. The contract checks every policy condition and transfers tokens directly
   from owner to merchant.
6. The contract emits a deterministic payment receipt for indexing and grant
   impact measurement.
7. The web app provides a synthetic policy simulator and an injected-wallet
   boundary for the verified Base Sepolia deployment.
8. The wallet workbench reads one consistent onchain snapshot, simulates the
   exact request at a fresh verified block, displays its full signing intent,
   and asks the wallet to sign only after explicit confirmation.

## Public seams

- `BaseAgentPaymentGuard`: contract policy, merchant, payment, and receipt API.
- `@base-agent-payment-guard/sdk`: pure preflight, ABI transaction builders,
  trusted-RPC receipt verification, and domain-bound aggregate metrics.
- `@base-agent-payment-guard/web`: browser simulator and injected-wallet
  boundary. The reviewed public testnet host is
  <https://base-agent-payment-guard.vercel.app>.

## Explicit non-goals

- Custody, private-key management, hosted signing, arbitrary contract calls,
  swaps, bridging, offchain merchant discovery, and unattended mainnet bots.
- Claiming x402 protocol compliance before a separate conformance review.
- Claiming cryptographic receipt inclusion or consensus finality from trusted
  RPC receipt verification and confirmation depth.
- Deploying or fabricating adoption evidence as part of the local MVP.

## Grant gate

The official 1-5 ETH Builder Grant nomination explicitly accepts a Base testnet
project. The verified Sepolia contract satisfies that onchain selection, and a
privacy-reviewed 31-second demo is published with the v0.1.0 release. The
nomination still needs project and builder X and Farcaster profiles, a truthful
case of at most 150 words, and explicit review of the form's media license and
privacy terms. The public
Builder Code `bc_xiu880fh` is registered and integrated into wallet transaction
intents, but an attributed transaction remains pending. Mainnet, usage, and
revenue can strengthen later evidence, but the official nomination form does
not list them as required fields.

The separate pasted up-to-$5,000 live-product intake remains unauthenticated.
Do not submit it or reuse its stronger live-product claims without a verified
official source and observed usage evidence.

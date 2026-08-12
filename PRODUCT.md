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
7. The web app provides a no-wallet policy simulator. Its optional injected
   wallet check confirms a supported account/network only; it never requests a
   transaction in this MVP.

## Public seams

- `BaseAgentPaymentGuard`: contract policy, merchant, payment, and receipt API.
- `@base-agent-payment-guard/sdk`: pure preflight, ABI transaction builders,
  trusted-RPC receipt verification, and domain-bound aggregate metrics.
- `@base-agent-payment-guard/web`: browser demo and optional wallet-readiness
  check. Transaction signing is a future, separately reviewed surface.

## Explicit non-goals

- Custody, private-key management, hosted signing, arbitrary contract calls,
  swaps, bridging, offchain merchant discovery, and unattended mainnet bots.
- Claiming x402 protocol compliance before a separate conformance review.
- Claiming cryptographic receipt inclusion or consensus finality from trusted
  RPC receipt verification and confirmation depth.
- Deploying or fabricating adoption evidence as part of the local MVP.

## Grant gate

The local MVP is not eligible for the pasted live-product intake. Eligibility
requires a public product, verified Base mainnet contract, Builder Code, Loom,
real users, measured usage and volume, revenue truth, and a defensible
Base-exclusive operating statement.

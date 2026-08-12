# Web design reference

The accepted implementation reference was generated on 2026-08-12 with the
built-in image generation tool:

`design/base-agent-payment-guard-concept.png`

## Locked direction

- Complete 1440px desktop product surface, not a marketing landing page.
- True pale cool-gray background, white work surfaces, deep ink text, Base-blue
  action and focus, and restrained green for an allowed decision.
- Quiet header; open two-column workbench; form on the left; decision, contract
  enforcement, and evidence rail on the right.
- Fine rules, 0-8px radii, minimal shadows, neo-grotesk content, monospace
  addresses and evidence, deliberate small labels.
- No fake usage, charts, prices, history, testimonials, decorative glow,
  gradients, bento grid, or private-key fields.

## Above-the-fold copy lock

- Base Agent Payment Guard
- Read security notes
- Delegate payments. Keep the limits.
- Set the agent, merchant, amount and daily ceiling before any transaction is signed.
- Local simulation · Not deployed · Unaudited
- Simulate
- Wallet
- Agent
- Merchant
- Payment amount
- Per-payment limit
- Spent today
- Daily limit
- Policy expiry
- Reference
- Run preflight
- Preflight decision
- Allowed
- Base network
- Merchant allowed
- Within payment limit
- Within daily limit
- Reference unused
- What the contract enforces
- Allowed merchant
- Per-payment cap
- Daily ceiling
- Single-use reference
- Local proof of concept. Never paste a private key.

Visible implementation deviations require a written reason in the fidelity
ledger. The concept is a design reference only; no part of the PNG ships as UI.

## Fidelity ledger

- The implementation preserves the two-column workbench, restrained Base-blue
  palette, pale background, compact labels, decision rail, evidence block, and
  safety footer.
- The control says `Wallet check`, not `Wallet`. This makes its informational,
  transaction-free behavior explicit.
- Merchant permission, pause, and replay toggles appear below the core form.
  They make the contract's denial paths testable without weakening the open
  desktop composition.
- Mobile uses one column and keeps the primary control at least 52px high. This
  is an intentional responsive adaptation of the desktop reference.
- The generated image remains a non-shipping reference asset. The application
  uses semantic HTML and CSS, not rasterized interface content.

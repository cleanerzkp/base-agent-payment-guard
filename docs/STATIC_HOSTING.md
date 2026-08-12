# Static hosting runbook

Status date: 2026-08-12

The preparation steps in this runbook do not prove that a public deployment
exists. Record a URL only after the deployed artifact and response headers are
observed independently. The production evidence below records that separate
verification.

## Why Vercel

The app is a Vite single-page build with no backend. GitHub Pages can host its
files, but the repository has no committed subpath build and GitHub Pages does
not provide repository-controlled response headers. Vercel can use the root
[`vercel.json`](../vercel.json) to build the existing workspace and attach the
required security headers. Do not add a GitHub Pages workflow until both the
project subpath and equivalent header enforcement have an explicit design.

## Build contract

- Install command: `npm ci`
- Build command: `npm run build --workspace @base-agent-payment-guard/sdk && npm run build --workspace @base-agent-payment-guard/web`
- Output directory: `apps/web/dist`
- Framework preset: Other
- Node.js: repository `engines` range, Node 24

The reviewed Base Sepolia deployment identity is hard-pinned in the web source.
The build needs no environment variable. Do not add a private key, seed phrase,
wallet password, keystore, authenticated RPC URL, analytics key, or unrelated
environment variable to the hosting project.

The registered Builder Code `bc_xiu880fh` is public, but it is not a hosting
setting. The reviewed transaction coordinator appends its ERC-8021 suffix, and
the review displays the exact code, suffix, and final calldata before signing.

## Network policy

The committed content security policy permits:

- scripts, styles, fonts, and other static assets from the same origin;
- the data-URL favicon;
- browser connections to the same origin and `https://sepolia.base.org`.

The injected wallet communicates through `window.ethereum`; it does not need a
remote origin in the page policy. Wildcard origins, `unsafe-eval`, inline
scripts, third-party analytics, embedded frames, and arbitrary RPC hosts remain
blocked. Review and narrow the policy before adding any new provider.

## Manual publication gate

1. Import `cleanerzkp/base-agent-payment-guard` into a new Vercel project.
2. Confirm the production branch and commit selected for release.
3. Confirm the commands and output directory above match `vercel.json`.
4. Confirm that the hosting project has no environment variables.
5. Build a preview. Do not promote it yet.
6. Run the repository quality gate against the same commit.
7. Compare the preview's displayed chain, guard, and USDC addresses with
   [`../deployments/base-sepolia.json`](../deployments/base-sepolia.json).
8. Confirm the wallet surface requests Base Sepolia and shows the full
   transaction intent before any signature.
9. Confirm the preview contains no analytics request, secret, source map with a
   secret, or unreviewed remote origin.
10. Inspect response headers before promoting the preview.
11. Promote only after an explicit publication decision.

## Post-deploy evidence

Observed production evidence:

- Public URL: <https://base-agent-payment-guard.vercel.app>
- Vercel deployment ID: `dpl_3gqP92qf2hA38PpEq7LJ3sdUmgMj`
- Reviewed implementation commit:
  `25e7194807cee180fcd5afca0fc53544f7c8634f`
- Build result: `READY`; exact SDK-then-web build completed on Node 24
- Public HTML, main JavaScript, and CSS SHA-256 values matched the local build
- CSP response header: observed and equal to `vercel.json`
- `X-Frame-Options: DENY`: observed
- `X-Content-Type-Options: nosniff`: observed
- Public guard address: matched
  `0x048eAF1596492cd29378fF240841b8ec32db50eA`
- Base Sepolia chain: displayed as `84532`
- Browser console: zero errors and zero warnings
- Public network before Connect: seven same-origin static requests only
- Real-wallet workbench evidence: not executed. The initial no-wallet QA failed
  safely before RPC. A separate refusal-only synthetic EOA pass verified the
  deployment, prepared exact calldata, simulated it, and rejected at the
  signature boundary without sending
- Builder Code integration: observed in reviewed source and automated tests for
  public code `bc_xiu880fh`
- Attributed Base Sepolia transaction: **MISSING**
- Signed Base Sepolia transaction: **MISSING; not required for static hosting**

The public app and contract remain unaudited testnet software even after every
hosting check passes. Never use real funds.

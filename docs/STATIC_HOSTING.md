# Static hosting runbook

Status date: 2026-08-12

This runbook prepares a static Vercel release. It does not prove that a public
deployment exists. Record a URL only after the deployed artifact and response
headers are observed independently.

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

Replace each placeholder only with observed evidence:

- Public URL: **MISSING**
- Vercel deployment ID: **MISSING**
- Released Git commit: **MISSING**
- Build result: **MISSING**
- CSP response header: **MISSING**
- `X-Frame-Options: DENY`: **MISSING**
- `X-Content-Type-Options: nosniff`: **MISSING**
- Public guard address match: **MISSING**
- Base Sepolia chain match: **MISSING**
- Browser console errors: **MISSING**
- Wallet-workbench read and simulation evidence: **MISSING**
- Builder Code integration: **OBSERVED IN REVIEWED SOURCE AND TESTS; first attributed transaction remains missing**
- Attributed Base Sepolia transaction: **MISSING**
- Signed Base Sepolia transaction: **MISSING; not required for static hosting**

The public app and contract remain unaudited testnet software even after every
hosting check passes. Never use real funds.

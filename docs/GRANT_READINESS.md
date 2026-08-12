# Base grant readiness

Status date: 2026-08-12

## Current verdict

Do not submit the pasted up-to-$5,000 live-product form yet. Its exact URL has
not been authenticated through an official Base or Coinbase source, and the
project does not yet have the evidence the form requests.

The current public Base funding documentation describes a different Builder
Grant path: 1-5 ETH, retroactive, for shipped projects. It explicitly welcomes
prototypes in Builder Rewards. The safe sequence is prototype, public release,
real usage, then a retroactive application.

## Evidence matrix

| Form requirement | Current evidence | Gate |
| --- | --- | --- |
| Exclusively building on Base | Clean Base-only repository and design | Keep all deployed product surfaces Base-only |
| Past idea stage | Local contract, SDK, app, and tests when gates pass | Preserve reproducible test and build reports |
| Live product | Missing | Publish an approved production URL |
| Product demo (Loom) | Missing | Record the deployed owner and agent flows |
| Base contract address | Missing | Audit, deploy, verify source on Base mainnet |
| Users, DAU, WAU | Missing | Recruit real pilots and define metric queries |
| All-time and 30-day volume | Missing | Derive from domain-bound verifier output; disclose RPC trust, confirmation, Sybil, and same-controller limits |
| Revenue today | Zero | State zero until actual revenue exists |
| Three-month GTM evidence | Plan only | Secure named pilot commitments and weekly reporting |
| Base Builder Code | Missing | Register the live app on Base.dev and integrate attribution |
| Team and ownership | Solo independent project | Publish ownership and prior-work statement |

## Release sequence

1. Complete local contract, SDK, web, threat model, and automated gates.
2. Obtain an independent smart-contract review before any real-fund use.
3. Create a public repository and tagged release only with explicit approval.
4. Deploy and verify on Base Sepolia with synthetic test assets.
5. Run two external developer pilots and close correctness findings.
6. Register the app on Base.dev and obtain a real Builder Code.
7. Deploy and verify the reviewed contract on Base mainnet.
8. Publish the standard web app and Loom demo.
9. Recruit at least five real pilots and report unrounded usage and volume.
10. Apply to Builder Rewards during prototyping and Builder Grants after impact.

## Stop conditions

Stop before deployment or form submission if the form URL lacks an official
source chain, ownership is disputed, audit findings remain open, metrics cannot
be reproduced, or Base exclusivity is no longer true.

## Official sources

- <https://docs.base.org/get-started/get-funded>
- <https://docs.base.org/apps/builder-codes/builder-codes>
- <https://docs.base.org/apps/growth/rewards>
- <https://blog.base.org/request-for-builders-1>

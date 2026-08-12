# Base grant readiness

Status date: 2026-08-12

## Current verdict

Do not submit yet. Use the official Base Builder Grant nomination path, not the
pasted up-to-$5,000 live-product intake.

Base's current funding documentation describes retroactive Builder Grants of
1-5 ETH. Its official article links to a Coinbase-owned nomination form. That
form explicitly accepts `No - live on Base testnet`, so a mainnet deployment is
not a form prerequisite. It requires a project URL, project and builder X and
Farcaster identities, a grant case of at most 150 words, and a one-minute demo.

The project now has a verified Base Sepolia contract, a reviewed public
browser release, and a privacy-reviewed 31-second demo. The required social
identities and the user's review of the form's license and privacy terms remain
open. The public Builder
Code `bc_xiu880fh` is
registered and integrated into reviewed wallet transaction intents, but its
first attributed transaction remains unobserved. The up-to-$5,000 intake has
not been authenticated through an official Base or Coinbase source and requests
a different live-product evidence set.

## Evidence matrix

| Official nomination requirement | Current evidence | Gate |
| --- | --- | --- |
| Email and nominator name | Personal values intentionally absent from the repository | User supplies them only in the authenticated form |
| Project name | Base Agent Payment Guard | Keep the same name across repository, app, demo, and social profiles |
| Project URL | <https://base-agent-payment-guard.vercel.app> | Satisfied; recheck before nomination |
| Project X | Missing | User creates or confirms the official project profile |
| Project Farcaster/channel | Missing | User creates or confirms the official project channel |
| Builder X | Missing | User confirms the builder profile |
| Builder Farcaster | Missing | User confirms the builder profile |
| Base deployment state | Verified Base Sepolia deployment | Select `No - live on Base testnet`; do not select mainnet |
| Builder Code | Public code `bc_xiu880fh` registered and integrated into reviewed intents | Record the first attributed transaction separately |
| Why it deserves a grant | Truthful draft under 150 words | Recheck against the public release before submission |
| One-minute demo | [Privacy-safe Base Sepolia demo](https://github.com/cleanerzkp/base-agent-payment-guard/releases/download/v0.1.0/base-agent-payment-guard-demo-2026-08-12.webm), 31 seconds | Satisfied; synthetic values only and no signature requested |
| Media license confirmation | Explicit user decision required | User reviews ownership and the non-exclusive, worldwide, irrevocable license before checking |
| Privacy acknowledgement | Explicit user review required | Never enter secrets, account data, passwords, or wallet credentials |

## Release sequence

1. Complete and review the Base Sepolia wallet workbench and automated gates.
   **Complete.**
2. Publish the static browser app with the pinned guard address and security
   headers. **Complete.**
3. Independently verify the public page, headers, artifact hashes, chain,
   contract, and token display. **Complete.** No wallet transaction was used.
4. Create or confirm the required project and builder X and Farcaster profiles.
5. Record a short demo of the observed public release and testnet evidence.
   **Complete.** The 31-second release asset uses synthetic values and requests
   no wallet signature.
6. Recheck the 150-word case against the public state.
7. User reviews the media license, privacy notice, and all identity fields.
8. Submit the official nomination manually and retain the receipt.
9. Continue pilots, Builder Code attribution evidence, and independent contract review
   as post-nomination evidence and mainnet gates.

## Stop conditions

Stop before hosting or nomination if the build contains a secret, the public
artifact differs from the reviewed commit, the contract address or chain is
wrong, ownership of submitted media is disputed, required profiles are not
controlled by the user, or the form is not reached through the official source
chain below.

Do not select `Yes - live on Base mainnet`. Do not claim users, volume, revenue,
audit, Base endorsement, Builder Code, or a public wallet flow without observed
evidence. Do not accept the media license on the user's behalf.

## Official sources

- <https://docs.base.org/get-started/get-funded>
- <https://paragraph.com/@grants.base.eth/calling-based-builders>
- <https://docs.google.com/forms/d/e/1FAIpQLSfXuEzmiAzRhie_z9raFCF1BXweXgVt18o-DvBuRRgyTygL2A/viewform>

The first source describes the current 1-5 ETH retroactive program. The second
is the Base Grants article linked by the official documentation. The third is
the nomination form linked by that article and identifies itself as created
inside Coinbase.

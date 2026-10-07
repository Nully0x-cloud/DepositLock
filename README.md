# DepositLock

Rental deposit protection. Tenants and landlords fund a deposit into a neutral
on-chain agreement where neither party can move the funds alone. Release
happens only through an agreed settlement; a challenged deduction freezes the
funds with no resolution path in this MVP.

**Hackathon MVP — Solana Devnet only, test token only.** Disputes remain
locked and unresolved. This is not production or legal deposit protection.

## What it does

1. Landlord signs in with a wallet, creates a property and tenancy, shares an invitation.
2. Tenant signs in, accepts, and funds the exact deposit into a PDA-controlled vault.
3. The tenancy becomes **Protected** once the server verifies the chain state.
4. Both sides attach move-in / move-out photo evidence to a shared record.
5. The landlord proposes a full return or an evidenced deduction.
6. The tenant approves (atomic payout, tenancy closes) or challenges (funds stay locked, tenancy disputed).
7. Timeline and notifications reflect every trusted outcome.

## Architecture

- Next.js App Router + TypeScript, Tailwind v4, Lucide icons.
- Solana program (Anchor): deposit agreement PDA, PDA-signed vault, settlement
  proposal PDA with version + terms-hash binding.
- Supabase Postgres as the verified mirror: RLS everywhere, service-role RPCs
  for lifecycle writes, private Storage bucket for evidence.
- Program ID (Devnet): `FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY`
- Settlement asset: test-only 6-decimal SPL mint shown as test USDC. Not a real stablecoin.

## Tech stack

- Next.js, React, TypeScript, Tailwind CSS
- `@solana/web3.js`, wallet adapters, Anchor/LiteSVM tests
- Supabase (Postgres, Auth SIWS, Storage), pgTAP, Vitest, ESLint

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:start
npm run db:reset
npx supabase status -o env   # local API URL + keys for .env.local
npm run dev                  # http://localhost:3000
```

## Supabase setup

- Local: `supabase/config.toml` (DB 54322, API 54321), migrations in
  `supabase/migrations`, seed in `supabase/seed.sql`.
- Private evidence bucket `tenancy-evidence` (JPG/PNG/WEBP, 10 MB max,
  tenancy-scoped paths, participant-only Storage policies).
- Hosted: apply migrations with `supabase db push`, then run the pgTAP suite
  against the hosted URL. Never point demo/E2E scripts at hosted data.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | public | `devnet` (only transactable cluster) |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | public | optional RPC override |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API URL (validated, no credentials in URL) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | RLS-bound public key |
| `NEXT_PUBLIC_SITE_URL` | public | canonical origin for SIWS |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | service client for verified RPCs/storage; never `NEXT_PUBLIC_`, never committed |

## Anchor setup

- Rust pinned by `rust-toolchain.toml`, Anchor CLI `1.2.1` per `Anchor.toml`.
- `anchor test` runs the LiteSVM suite (no local validator; `skip_local_validator = true`).
- `scripts/devnet-bootstrap.sh` builds and upgrades the existing program ID;
  needs a funded Devnet deployer key under gitignored `.keys/`.

## Test commands

```bash
npm run lint
npx tsc --noEmit
npm test                          # Vitest
npm run test:db                   # pgTAP, local
npm run test:siws                 # local SIWS verification
npm run test:storage              # local Storage RLS integration (needs local keys)
anchor test                       # Anchor/LiteSVM
npm run build
npm run devnet:settlement-e2e     # Devnet full-return, deduction, dispute (local Supabase + app)
```

## Demo flow

```bash
npm run db:reset
DEMO_CONFIRM=local-demo E2E_SUPABASE_URL=http://127.0.0.1:54321 \
  E2E_SUPABASE_SERVICE_ROLE_KEY=<local-service-key> npm run demo:fixtures
```

Creates local-only fixtures: protected tenancy, agreed-deduction closed
tenancy (1,800 deposit → 1,650 tenant / 150 landlord), and a disputed
tenancy with funds locked. No keys committed; reset with `npm run db:reset`.
Do not run fixtures or reset scripts against hosted projects.

Demo wallets obtain Devnet SOL via `solana airdrop` and test tokens from the
CLI-held mint authority (`scripts/devnet-bootstrap.sh`, `.keys/` ignored).

## Security model

- RLS + Storage policies enforce participant-only access; anon sees nothing.
- Evidence metadata is append-only; recorded files cannot be deleted.
- Activity/notifications are written only by trusted DB triggers and
  service-role RPCs; clients can only read and mark their own notifications read.
- Settlement/deduction/dispute writes require chain verification first.
- Closed tenancies are immutable; disputed funds have no release path.

## Known limitations

- Devnet only; test token only; no mainnet.
- No arbitration, mediation, or admin release; disputes stay locked.
- No rent payments, messaging, analytics, KYC, or email/push notifications.
- Wallet-based identity only; demo-focused MVP.

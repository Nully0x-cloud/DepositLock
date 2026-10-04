# DepositLock

Rental deposit protection. Tenants and landlords fund a deposit into a neutral
on-chain mechanism where neither party can move the funds alone.

**Phase 1** — foundation, design system, routing, responsive layout, reusable UI
primitives and a polished static landing page / app shell.

**Phase 2 (current)** — Solana wallet connection on devnet, a custom
DepositLock-styled wallet dialog, a locally persisted profile, the
profile / create identity states, and the wallet guard components. No Supabase,
Anchor, deposits, settlement, evidence or deductions yet.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Lucide React icons
- `@solana/web3.js` + `@solana/wallet-adapter-react` (Phantom, Solflare, Backpack)
- Vitest

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional environment (defaults to devnet with the public RPC endpoint):

```bash
cp .env.example .env.local
```

| Variable                          | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SOLANA_CLUSTER`      | `devnet` (default), `testnet`, `mainnet-beta`  |
| `NEXT_PUBLIC_SOLANA_RPC_URL`      | Override the RPC endpoint for the cluster      |

Checks:

```bash
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npm test           # vitest
npm run build      # production build (also prerenders all routes)
npm start          # serve the production build
```

## Routes

| Route                      | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `/`                        | Landing page                                       |
| `/app`                     | Authenticated shell — overview                     |
| `/app/tenancies`           | My Tenancies (mock data, filters)                  |
| `/app/tenancies/[id]`      | Static tenancy record                              |
| `/app/create`              | Create Tenancy shell + identity requirement block  |
| `/app/profile`             | Profile: create / view / edit, wallet card, roles  |

## Wallet & profile

- Wallets are wired through `src/providers/solana-provider.tsx`, mounted only by
  the `/app` layout — the landing page ships no wallet code.
- The dialog in `src/components/wallet/wallet-modal.tsx` replaces the default
  adapter modal and keeps the DepositLock visual system.
- Connection problems are reduced to calm copy by
  `src/lib/solana/wallet-identity.ts`; raw adapter errors never reach the UI.
- The profile lives in `src/lib/profile/` behind a repository interface that
  starts on `localStorage` and moves to Supabase in Phase 3 unchanged.
- **Profiles carry no role.** Roles are tenancy-specific and derived from
  tenancy relationships.

## Project structure

```
src/
  app/                  # App Router routes + root layout, globals, not-found
  components/
    app/                # App-only composites (page header, filters, explorer)
    layout/             # Container, brand, site header/footer, app shell/sidebar
    landing/            # Landing page sections
    profile/            # Profile form + profile page view
    tenancy/            # Tenancy record building blocks + creation view
    ui/                 # Button, badge, card, section heading, empty state
    wallet/             # Wallet dialog, header control, guards, icon
  data/                 # Typed mock data layer (swap for Supabase/API later)
  hooks/                # use-profile, use-wallet-identity, guards
  lib/
    profile/            # Types-backed store, storage, validation
    solana/             # Cluster config, explorer links, wallet identity
  providers/            # Solana + wallet session + profile providers
  types/                # Shared types
public/
  properties/           # Property imagery
  evidence/             # Move-in evidence imagery
```

## Design system

- Surfaces: warm cream `#F5F2EA`, sand `#ECE7DC`, parchment cards
- Primary: deep forest `#173D2D`, secondary moss `#315C46`
- Text: charcoal `#1E211F`
- Type: Geist (UI/body) + Fraunces (editorial display)
- Recurring motif: the **Protected Tenancy Record** lifecycle
  (Agreement → Protected → Move-In → Active → Move-Out → Released)

## Phases

- **Phase 1:** foundation, design system, landing, app shell, mock data
- **Phase 2 (this):** wallet connect/disconnect, wallet dialog, local profile,
  identity states, devnet config, tests
- **Phase 3+:** tenancy creation, Supabase data layer, Anchor settlement,
  evidence uploads, deductions, disputes, notifications

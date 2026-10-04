# DepositLock

Rental deposit protection. Tenants and landlords fund a deposit into a neutral
on-chain mechanism where neither party can move the funds alone.

**Phase 1** — foundation, design system, routing, responsive layout, reusable UI
primitives and a polished static landing page / app shell. No blockchain, Supabase
or authentication logic yet.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Lucide React icons

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Checks:

```bash
npm run lint       # eslint
npx tsc --noEmit   # typecheck
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
| `/app/create`              | Create Tenancy route shell (4 planned stages)      |
| `/app/profile`             | Profile placeholder                                |

## Project structure

```
src/
  app/                  # App Router routes + root layout, globals, not-found
  components/
    app/                # App-only composites (page header, filters, explorer)
    layout/             # Container, brand, site header/footer, app shell/sidebar
    landing/            # Landing page sections
    tenancy/            # Tenancy record building blocks
    ui/                 # Button, badge, card, section heading, empty state
  data/                 # Typed mock data layer (swap for Supabase/API later)
  lib/                  # Utilities + navigation config
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

- **Phase 1 (this):** foundation, design system, landing, app shell, mock data
- **Phase 2+:** tenancy creation, wallet integration, Solana settlement,
  Supabase data layer, evidence uploads, deductions, disputes, notifications

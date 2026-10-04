# DepositLock

Rental deposit protection. Tenants and landlords fund a deposit into a neutral
on-chain mechanism where neither party can move the funds alone.

**Phase 1** - foundation, design system, routing, responsive layout, reusable UI
primitives and a polished static landing page / app shell.

**Phase 2** - Solana wallet connection on devnet, a custom
DepositLock-styled wallet dialog, a locally persisted profile, the
profile / create identity states, and the wallet guard components.

**Phase 3A (current)** - the complete local-only Supabase backend: schema,
migrations, seed data, row level security, typed repositories, generated
database types and a pgTAP test suite. No remote project, no login, no
committed secrets; the UI is unchanged on purpose (see
[Local database](#local-database-phase-3a)).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Lucide React icons
- `@solana/web3.js` + `@supabase/supabase-js`
- Supabase CLI (local stack, migrations, pgTAP)
- Vitest + pgTAP

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
| `NEXT_PUBLIC_SUPABASE_URL`        | Local stack URL from `npx supabase status`     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Public, RLS-constrained anon key               |

Checks:

```bash
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npm test           # vitest
npm run test:db    # pgTAP against the local database
npm run build      # production build (also prerenders all routes)
npm start          # serve the production build
```

## Local database (Phase 3A)

Everything runs on this machine. There is no remote project, no account, no
project ref and no committed secret: the stack, its keys and its data live in
Docker and reset on demand.

```bash
npm run db:start   # start the local stack (first run pulls images)
npm run db:reset   # drop, recreate, apply migrations, load the seed
npm run db:test    # pgTAP suites in supabase/tests/*.sql
npm run db:types   # regenerate src/types/database.generated.ts from the DB
npm run db:status  # URLs and keys
npm run db:stop    # stop the stack
```

`npx supabase status` prints the local URL and keys; they belong in
`.env.local`, which is gitignored. `.env.example` documents every variable with
placeholders only.

| Path                                       | Contents                                       |
| ------------------------------------------ | ---------------------------------------------- |
| `supabase/config.toml`                     | Local project config (DB 54322, API 54321)     |
| `supabase/migrations/*_initial_schema.sql` | Schema, triggers, RLS, privileges, view        |
| `supabase/seed.sql`                        | One coherent story: two tenancies, four people |
| `supabase/tests/*.sql`                     | pgTAP: schema, access, constraints (96 tests)  |

Design decisions worth knowing before editing:

- **Statuses and categories are `text` + CHECK constraints**, not PG enums, so
  a value can be added by an ordinary migration instead of an enum rewrite.
- **Money is `numeric(12,2)`**; PostgREST decodes it to a JS `number`, which is
  what the repositories expose.
- **Every id is a UUID**, every timestamp `timestamptz`.
- **`tenancy_participants` is derived**, never hand-written: a SECURITY
  DEFINER trigger mirrors `landlord_profile_id` / `tenant_profile_id` into a
  role graph, and a guard rejects any row that disagrees with the contract.
  Roles are therefore tenancy-scoped; there is no `role` column on `profiles`.
- **Evidence links to a deduction through a composite foreign key**
  `(deduction_id, tenancy_id)`, which keeps evidence on its own tenancy at the
  database level.
- **A dispute always comes from a challenged deduction** (`deduction_id` is
  `NOT NULL`), with a partial unique index allowing one active dispute per
  deduction.
- **`settlements`, `activity_events` and `notifications` have no client write
  path**: privileges revoke client `insert`/`update`/`delete` where the service
  layer will own the write in a later phase. Clients can read them, and can
  append activity or mark their own notifications read where that is the whole
  point.

### How identity is simulated

RLS resolves `auth.uid()` from the JWT `sub` claim. The pgTAP suites set
`request.jwt.claims` and `set local role authenticated` - the exact code path
PostgREST uses in production - so policies, triggers and revoked privileges all
run for real. `authenticated` owns nothing, which is what makes the assertions
meaningful; no test grants itself extra rights.

One PostgreSQL detail matters when writing new tests: **`RETURNING` rows are
subject to the table's SELECT policy**, so inserting a tenancy and returning it
fails until its `tenancy_participants` row exists. The suites use a helper that
runs the statement without `RETURNING` for that case.

### Why the UI still shows local data

Phase 3A ships no sign-in, so `auth.uid()` is `null` in the browser and every
policy correctly returns nothing. Rather than fake a session, `/app/tenancies`
and `/app/profile` keep their Phase 1/2 behaviour: the profile persists to
`localStorage` behind the same repository interface, and
`src/lib/profile/profile-service.ts` mirrors it to Supabase only when the
stack is configured and a wallet is bound - with the local record staying
authoritative. The data layer itself is proven by the repository unit tests and
the pgTAP suite instead. Phase 3B adds the authenticated session and flips the
seam.



| Route                      | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `/`                        | Landing page                                       |
| `/app`                     | Authenticated shell - overview                     |
| `/app/tenancies`           | My Tenancies (mock data, filters)                  |
| `/app/tenancies/[id]`      | Static tenancy record                              |
| `/app/create`              | Create Tenancy shell + identity requirement block  |
| `/app/profile`             | Profile: create / view / edit, wallet card, roles  |

## Wallet & profile

- Wallets are wired through `src/providers/solana-provider.tsx`, mounted only by
  the `/app` layout - the landing page ships no wallet code.
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
    db/                 # Supabase clients, error mapping, typed repositories
    profile/            # Types-backed store, storage, validation, remote seam
    solana/             # Cluster config, explorer links, wallet identity
  providers/            # Solana + wallet session + profile providers
  types/                # Shared types + generated database schema
public/
  properties/           # Property imagery
  evidence/             # Move-in evidence imagery
supabase/
  config.toml           # Local stack configuration
  migrations/           # Ordered schema migrations
  seed.sql              # Coherent local story
  tests/                # pgTAP access + constraint suites
```

## Design system

- Surfaces: warm cream `#F5F2EA`, sand `#ECE7DC`, parchment cards
- Primary: deep forest `#173D2D`, secondary moss `#315C46`
- Text: charcoal `#1E211F`
- Type: Geist (UI/body) + Fraunces (editorial display)
- Recurring motif: the **Protected Tenancy Record** lifecycle
  (Agreement -> Protected -> Move-In -> Active -> Move-Out -> Released)

## Phases

- **Phase 1:** foundation, design system, landing, app shell, mock data
- **Phase 2:** wallet connect/disconnect, wallet dialog, local profile,
  identity states, devnet config, tests
- **Phase 3A (this):** local Supabase schema, migrations, seed, RLS, typed
  repositories, generated types, pgTAP suite
- **Phase 3+:** authenticated session, tenancy creation against Supabase,
  Anchor settlement, evidence uploads, deductions, disputes, notifications

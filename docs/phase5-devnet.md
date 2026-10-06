# Phase 5 Devnet deployment

DepositLock Phase 5 uses a test-only classic SPL mint displayed in the app as **test USDC** (6 decimals). It is not an official stablecoin. The program is deployed to Solana Devnet; Supabase stores only server-reconciled chain state.

## Toolchain

The deployment was built and tested with:

- Ubuntu 26.04 under WSL 2
- Rust/Cargo 1.99.0
- Agave Solana CLI 4.3.0
- Anchor CLI 1.2.1
- SPL Token CLI 5.6.1
- Node.js 24.21.0

The Rust/Anchor versions are pinned by `rust-toolchain.toml` and `Anchor.toml`. Generated Anchor build products are in the ignored `target/` directory.

## Deploy and initialize

From the WSL repository path (`/mnt/c/Users/okuma/Desktop/depositlock`), make sure `.keys/deployer.json` is funded with at least 1.5 Devnet SOL (2 SOL is recommended), then run:

```bash
chmod +x scripts/devnet-bootstrap.sh
scripts/devnet-bootstrap.sh
```

The script builds and deploys `target/deploy/deposit_lock.so`, creates `.keys/mint.json` if needed, creates the six-decimal mint, records its public address in `src/lib/solana/deployment.ts`, and runs `scripts/devnet-init-config.mjs`. The deployer and mint-authority secret keypairs remain under ignored `.keys/`.

The config initializer is safe to rerun: it verifies that an existing config PDA has the expected mint and decimals before returning success.

## Local Supabase + Devnet end-to-end check

The E2E creates real SIWS landlord and tenant identities in **local Supabase only**, creates and accepts a tenancy invitation, funds the Devnet vault, calls the real reconciliation route, and checks the resulting deposit record, protected tenancy status, and activity event.

1. Start the local Supabase stack and reset it to the committed migrations/seeds:

   ```powershell
   npm run db:start
   npm run db:reset
   npx supabase status -o env
   ```

2. In the PowerShell session that will run the Next server, set `NEXT_PUBLIC_SUPABASE_URL` to the local `API_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the local `PUBLISHABLE_KEY` (or `ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` to the local `SERVICE_ROLE_KEY`. Also set `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`. Start `npm run dev` in that session. Do not use hosted Supabase keys for this E2E.

3. In another PowerShell session, set `E2E_SUPABASE_URL=http://127.0.0.1:54321`, `E2E_SUPABASE_ANON_KEY` to the same local publishable/anon key, and `E2E_APP_URL=http://localhost:3000`. Run:

   ```powershell
   npm run devnet:e2e
   ```

The E2E requires `.keys/deployer.json`, `.keys/mint.json`, a deployed/configured program, enough SOL in the deployer for test-wallet fees, and the mint address committed in `deployment.ts`. It creates `.keys/e2e-landlord.json` and `.keys/e2e-tenant.json` on first run. Afterward, reset local Supabase before final database gates so E2E identities do not affect seed-shape assertions.

## Client/server configuration

`src/lib/solana/config.ts` is the single cluster/RPC/commitment source. Deposit transactions and reconciliation are Devnet-only. `src/lib/solana/deployment.ts` is the single committed program/mint address source. The service-role key is read only by `src/lib/db/service-client.ts` and must remain server-only in `.env.local` or the deployment environment.

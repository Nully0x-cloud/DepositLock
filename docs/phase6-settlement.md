# Phase 6 — mutually agreed settlement

Phase 6 extends the Phase 5 Devnet program with full-return proposals, agreed deductions, atomic tenant approval/payout, and an on-chain dispute freeze. It does not add arbitration or an administrator release path.

## Compatibility and account state

- The existing `DepositAgreement` fields and offsets are unchanged.
- Existing status discriminants remain `Initialized=0`, `Funded=1`, `Closed=2`; `SettlementProposed=3` and `Disputed=4` are appended.
- A new `SettlementProposal` PDA uses seeds `[b"settlement", agreement_pubkey]`. It stores the terms, proposer, monotonically increasing proposal version, terms hash, response state, and final payouts.
- The Devnet program ID remains `FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY`. Existing funded agreements stay readable and can initialize the new proposal PDA after upgrade.

## State transitions

1. Landlord starts move-out review off chain after the server re-reads a funded agreement.
2. Landlord creates the proposal PDA once, then proposes either a full return (`landlord_amount = 0`) or an integer-unit deduction. The program derives the tenant share and binds the proposal version and terms hash.
3. Before tenant response, landlord may withdraw. A replacement increments the on-chain version; old signed withdrawals, approvals, and challenges are rejected unless their version and terms hash match the current proposal.
4. Tenant approval and both token transfers occur atomically. The agreement becomes Closed only after the vault is emptied.
5. Tenant challenge is allowed only for a partial-deduction proposal. It changes the agreement to Disputed and transfers no tokens. No arbitration or release action is available in Phase 6.

Settlement uses canonical recipient ATAs. The tenant pays any rent needed to create a missing recipient ATA in the approval transaction. If unsolicited classic SPL tokens were sent directly to the vault, the agreed landlord amount remains fixed and the excess is returned to the tenant. The agreement records the actual final payout split, requires the vault to be emptied, then closes the empty vault ATA and returns its rent to the tenant so no later token dust can reach the historical vault.

## Database and reconciliation

`settlement_proposals` stores the versioned, service-reconciled proposal history; existing `deductions`, `disputes`, and `settlements` remain the application concepts. Clients may read these records but cannot write deduction responses, disputes, settlements, tenancy lifecycle state, or proposal mirrors directly. The API re-reads the agreement/proposal PDAs and vault before invoking narrowly scoped service-role RPCs.

`settlements.surplus_amount` records unsolicited tokens beyond the original protected deposit. `settlement_proposals` retains exact final base-unit payouts; the settlement payout/surplus columns use six decimal places so they can mirror the configured test mint without losing sub-cent token units.

## Verification and Devnet E2E

Upgrade the existing program ID with `scripts/devnet-bootstrap.sh` after funding the deployer with at least 2.25 Devnet SOL; the buffer upload and program-data extension temporarily require more than the original Phase 5 deployment. The script uses a gitignored buffer keypair and keeps the upgrade authority out of logs.

Run `anchor test` for the LiteSVM adversarial suite, then the existing lint/type/unit/database/SIWS/build gates. `npm run devnet:settlement-e2e` exercises full return, partial deduction, and disputed freeze against Devnet with local Supabase. Start the app server using local Supabase URL/anon/service-role keys and `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`; see `docs/phase5-devnet.md` for local setup. E2E disputes intentionally remain locked, and irreversible Devnet transactions are not “cleaned up.”

Settlement signers and the upgrade authority are Devnet keypairs under ignored `.keys/`. Do not expose or commit them.

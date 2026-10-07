//! DepositLock — protected rental deposit vault.
//!
//! One on-chain Deposit Agreement per accepted tenancy. The agreement PDA is
//! the authority of a deterministic token vault. Phase 5 allows exact tenant
//! funding; Phase 6 adds landlord proposals plus tenant-approved atomic
//! settlement. A challenged agreement remains frozen with funds in its vault.
//!
//! Authorization model (see Phase 5 report):
//! - `initialize_deposit` is signed by the landlord only (Option B). The
//!   tenant consents later by signing `fund_deposit`, which validates the
//!   signer against the stored tenant and displays every term first.
//! - The accepted mint is not embedded in the program: a deployment-specific
//!   `DepositLockConfig` PDA records it, and the application independently
//!   cross-checks the mint it expects.

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY");

#[program]
pub mod deposit_lock {
    use super::*;

    /// One-time deployment configuration: records the accepted mint.
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handle_initialize_config(ctx)
    }

    /// Creates the Deposit Agreement PDA and its vault for a tenancy.
    pub fn initialize_deposit(
        ctx: Context<InitializeDeposit>,
        tenancy_id: [u8; 16],
        required_amount: u64,
    ) -> Result<()> {
        instructions::initialize_deposit::handle_initialize_deposit(
            ctx,
            tenancy_id,
            required_amount,
        )
    }

    /// The tenant funds the exact required amount into the PDA-controlled vault.
    pub fn fund_deposit(ctx: Context<FundDeposit>, amount: u64) -> Result<()> {
        instructions::fund_deposit::handle_fund_deposit(ctx, amount)
    }

    /// Allocates the one settlement-proposal PDA attached to this agreement.
    pub fn initialize_settlement_proposal(
        ctx: Context<InitializeSettlementProposal>,
    ) -> Result<()> {
        instructions::initialize_settlement_proposal::handle_initialize_settlement_proposal(ctx)
    }

    /// The landlord proposes a full return (`landlord_amount = 0`) or deduction.
    pub fn propose_settlement(
        ctx: Context<ProposeSettlement>,
        landlord_amount: u64,
        expected_proposal_version: u64,
        terms_hash: [u8; 32],
    ) -> Result<()> {
        instructions::propose_settlement::handle_propose_settlement(
            ctx,
            landlord_amount,
            expected_proposal_version,
            terms_hash,
        )
    }

    /// The landlord may withdraw only an unanswered proposal.
    pub fn withdraw_settlement_proposal(
        ctx: Context<WithdrawSettlementProposal>,
        expected_proposal_version: u64,
        expected_terms_hash: [u8; 32],
    ) -> Result<()> {
        instructions::withdraw_settlement_proposal::handle_withdraw_settlement_proposal(
            ctx,
            expected_proposal_version,
            expected_terms_hash,
        )
    }

    /// Tenant approval and exact PDA-signed payouts execute atomically.
    pub fn approve_settlement(
        ctx: Context<ApproveSettlement>,
        expected_proposal_version: u64,
        expected_terms_hash: [u8; 32],
    ) -> Result<()> {
        instructions::approve_settlement::handle_approve_settlement(
            ctx,
            expected_proposal_version,
            expected_terms_hash,
        )
    }

    /// Tenant challenge freezes the agreement without moving tokens.
    pub fn challenge_settlement(
        ctx: Context<ChallengeSettlement>,
        expected_proposal_version: u64,
        expected_terms_hash: [u8; 32],
    ) -> Result<()> {
        instructions::challenge_settlement::handle_challenge_settlement(
            ctx,
            expected_proposal_version,
            expected_terms_hash,
        )
    }
}

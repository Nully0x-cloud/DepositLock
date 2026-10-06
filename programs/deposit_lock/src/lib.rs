//! DepositLock — protected rental deposit vault.
//!
//! One on-chain Deposit Agreement per accepted tenancy. The agreement PDA is
//! the authority of a deterministic token vault; the tenant funds the exact
//! required amount once, and from then on no single party (landlord, tenant,
//! operator) can move the funds — Phase 5 intentionally ships **no**
//! withdrawal instruction at all.
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
        instructions::initialize_deposit::handle_initialize_deposit(ctx, tenancy_id, required_amount)
    }

    /// The tenant funds the exact required amount into the PDA-controlled vault.
    pub fn fund_deposit(ctx: Context<FundDeposit>, amount: u64) -> Result<()> {
        instructions::fund_deposit::handle_fund_deposit(ctx, amount)
    }
}

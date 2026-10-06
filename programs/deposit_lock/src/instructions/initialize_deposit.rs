use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{AGREEMENT_VERSION, CONFIG_SEED, DEPOSIT_SEED};
use crate::error::DepositLockError;
use crate::state::{AgreementStatus, DepositAgreement, DepositLockConfig};

/// Creates the Deposit Agreement PDA and its vault for one tenancy.
///
/// Authorization: the landlord signs alone (Option B). The tenant is recorded
/// but never signs here — they consent later by signing `fund_deposit`, after
/// seeing every term. A third party can only burn an agreement by
/// initializing it with themselves as landlord: the application and the
/// reconciliation server both compare the on-chain landlord/tenant/mint/
/// amount against Supabase under RLS before any money or status moves.
#[derive(Accounts)]
#[instruction(tenancy_id: [u8; 16])]
pub struct InitializeDeposit<'info> {
    /// The landlord — the initializer becomes the agreement's landlord.
    #[account(mut)]
    pub landlord: Signer<'info>,

    /// CHECK: recorded as the agreement's tenant. Never signs here; this
    /// stored address is enforced at funding. Must be a system-owned key
    /// (a wallet), so a program address can never be recorded as tenant.
    #[account(
        constraint = tenant.key() != landlord.key() @ DepositLockError::InvalidParticipant,
        constraint = tenant.owner == &system_program::ID @ DepositLockError::InvalidParticipant,
    )]
    pub tenant: UncheckedAccount<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DepositLockConfig>,

    #[account(
        constraint = mint.key() == config.allowed_mint @ DepositLockError::InvalidMint,
        constraint = mint.decimals == config.allowed_decimals @ DepositLockError::InvalidDecimals,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = landlord,
        space = 8 + DepositAgreement::INIT_SPACE,
        seeds = [DEPOSIT_SEED, &tenancy_id],
        bump
    )]
    pub agreement: Account<'info, DepositAgreement>,

    /// Deterministic vault: the ATA of the agreement PDA for the accepted
    /// mint. Its authority is the agreement itself, so only program rules
    /// can ever move tokens out.
    #[account(
        init,
        payer = landlord,
        associated_token::mint = mint,
        associated_token::authority = agreement,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_deposit(
    ctx: Context<InitializeDeposit>,
    tenancy_id: [u8; 16],
    required_amount: u64,
) -> Result<()> {
    require!(required_amount > 0, DepositLockError::InvalidAmount);

    let clock = Clock::get()?;
    ctx.accounts.agreement.set_inner(DepositAgreement {
        version: AGREEMENT_VERSION,
        bump: ctx.bumps.agreement,
        status: AgreementStatus::Initialized,
        tenancy_id,
        landlord: ctx.accounts.landlord.key(),
        tenant: ctx.accounts.tenant.key(),
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key(),
        required_amount,
        deposited_amount: 0,
        created_at: clock.unix_timestamp,
        funded_at: 0,
    });
    Ok(())
}

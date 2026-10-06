use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::DEPOSIT_SEED;
use crate::error::DepositLockError;
use crate::state::{AgreementStatus, DepositAgreement};

/// The tenant funds the exact required deposit into the vault.
///
/// Rules (all enforced here):
/// 1. the signer is the stored tenant,
/// 2. the agreement is still `Initialized`,
/// 3. the mint is the agreement's mint,
/// 4. the source is the tenant's canonical token account for that mint,
/// 5. the vault is this agreement's canonical vault,
/// 6. `amount` equals the required amount exactly (no partial funding),
/// 7. the tenant actually holds that amount,
/// 8. the transfer is `TransferChecked` authorized by the tenant's own
///    signature (the source account's real authority),
/// 9. the agreement transitions to `Funded` — once, never twice.
#[derive(Accounts)]
pub struct FundDeposit<'info> {
    /// The tenant — the only wallet allowed to fund. They sign this
    /// transaction, which is exactly the authority the token transfer needs
    /// to move funds out of their own token account into the vault.
    #[account(mut)]
    pub tenant: Signer<'info>,

    #[account(
        mut,
        seeds = [DEPOSIT_SEED, &agreement.tenancy_id],
        bump = agreement.bump,
    )]
    pub agreement: Account<'info, DepositAgreement>,

    #[account(address = agreement.mint @ DepositLockError::InvalidMint)]
    pub mint: Account<'info, Mint>,

    /// The tenant's token account holding the funds to deposit.
    #[account(
        mut,
        constraint = source.owner == tenant.key() @ DepositLockError::InvalidSourceAccount,
        constraint = source.mint == agreement.mint @ DepositLockError::InvalidMint,
        address = get_associated_token_address(&tenant.key(), &agreement.mint) @ DepositLockError::InvalidSourceAccount,
    )]
    pub source: Account<'info, TokenAccount>,

    /// The agreement's vault — the canonical ATA of the agreement PDA.
    #[account(
        mut,
        constraint = vault.key() == agreement.vault @ DepositLockError::InvalidVault,
        address = get_associated_token_address(&agreement.key(), &agreement.mint) @ DepositLockError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_fund_deposit(ctx: Context<FundDeposit>, amount: u64) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.agreement.tenant,
        ctx.accounts.tenant.key(),
        DepositLockError::UnauthorizedTenant
    );

    match ctx.accounts.agreement.status {
        AgreementStatus::Initialized => {}
        AgreementStatus::Funded => return err!(DepositLockError::AlreadyFunded),
        AgreementStatus::Closed => return err!(DepositLockError::InvalidStatus),
    }

    require!(
        amount == ctx.accounts.agreement.required_amount,
        DepositLockError::AmountMismatch
    );
    require!(
        ctx.accounts.source.amount >= amount,
        DepositLockError::InsufficientFunds
    );

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.tenant.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let agreement = &mut ctx.accounts.agreement;
    agreement.deposited_amount = amount;
    agreement.status = AgreementStatus::Funded;
    agreement.funded_at = Clock::get()?.unix_timestamp;
    Ok(())
}

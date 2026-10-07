use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{DEPOSIT_SEED, SETTLEMENT_SEED};
use crate::error::DepositLockError;
use crate::state::{
    AgreementStatus, DepositAgreement, SettlementProposal, SettlementProposalStatus, SettlementType,
};

#[derive(Accounts)]
pub struct ApproveSettlement<'info> {
    /// The only party who can approve — and the payer for a missing landlord ATA.
    #[account(mut)]
    pub tenant: Signer<'info>,

    /// CHECK: constrained to the landlord stored in the agreement and only
    /// used as the canonical ATA owner/transfer destination.
    #[account(address = agreement.landlord @ DepositLockError::InvalidRecipient)]
    pub landlord: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [DEPOSIT_SEED, agreement.tenancy_id.as_ref()],
        bump = agreement.bump,
        has_one = tenant @ DepositLockError::UnauthorizedTenant,
        has_one = landlord @ DepositLockError::InvalidRecipient,
    )]
    pub agreement: Account<'info, DepositAgreement>,

    #[account(
        mut,
        seeds = [SETTLEMENT_SEED, agreement.key().as_ref()],
        bump = settlement.bump,
        has_one = agreement @ DepositLockError::InvalidSettlementProposal,
        constraint = settlement.tenant == tenant.key() @ DepositLockError::UnauthorizedTenant,
        constraint = settlement.landlord == landlord.key() @ DepositLockError::InvalidRecipient,
    )]
    pub settlement: Account<'info, SettlementProposal>,

    #[account(address = agreement.mint @ DepositLockError::InvalidMint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        address = agreement.vault @ DepositLockError::InvalidVault,
        constraint = vault.owner == agreement.key() @ DepositLockError::InvalidVault,
        constraint = vault.mint == agreement.mint @ DepositLockError::InvalidMint,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = tenant,
        associated_token::mint = mint,
        associated_token::authority = tenant,
    )]
    pub tenant_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = tenant,
        associated_token::mint = mint,
        associated_token::authority = landlord,
    )]
    pub landlord_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_approve_settlement(
    ctx: Context<ApproveSettlement>,
    expected_proposal_version: u64,
    expected_terms_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.agreement.status == AgreementStatus::SettlementProposed
            && ctx.accounts.settlement.status == SettlementProposalStatus::Active,
        DepositLockError::NoActiveSettlement
    );
    require!(
        ctx.accounts.settlement.proposal_version > 0,
        DepositLockError::InvalidSettlementProposal
    );
    require!(
        ctx.accounts.settlement.proposer == ctx.accounts.agreement.landlord,
        DepositLockError::UnauthorizedLandlord
    );
    require_eq!(
        ctx.accounts.settlement.proposal_version,
        expected_proposal_version,
        DepositLockError::InvalidSettlementProposal
    );
    require!(
        ctx.accounts.settlement.terms_hash == expected_terms_hash,
        DepositLockError::InvalidSettlementProposal
    );

    let total = ctx
        .accounts
        .settlement
        .tenant_amount
        .checked_add(ctx.accounts.settlement.landlord_amount)
        .ok_or_else(|| error!(DepositLockError::InvalidSettlementAmounts))?;
    require!(
        total == ctx.accounts.agreement.deposited_amount,
        DepositLockError::InvalidSettlementAmounts
    );
    require!(
        match ctx.accounts.settlement.proposal_type {
            SettlementType::FullReturn => ctx.accounts.settlement.landlord_amount == 0,
            SettlementType::PartialDeduction => ctx.accounts.settlement.landlord_amount > 0,
        },
        DepositLockError::InvalidSettlementAmounts
    );
    let vault_amount = ctx.accounts.vault.amount;
    require!(
        vault_amount >= ctx.accounts.agreement.deposited_amount,
        DepositLockError::VaultBalanceMismatch
    );

    let landlord_amount = ctx.accounts.settlement.landlord_amount;
    let tenant_amount = vault_amount
        .checked_sub(landlord_amount)
        .ok_or_else(|| error!(DepositLockError::InvalidSettlementAmounts))?;
    require!(
        tenant_amount >= ctx.accounts.settlement.tenant_amount,
        DepositLockError::InvalidSettlementAmounts
    );
    let decimals = ctx.accounts.mint.decimals;
    let tenancy_id = ctx.accounts.agreement.tenancy_id;
    let bump = [ctx.accounts.agreement.bump];
    let signer_seeds: &[&[u8]] = &[DEPOSIT_SEED, tenancy_id.as_ref(), &bump];
    let signer = &[signer_seeds];

    if landlord_amount > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.landlord_token_account.to_account_info(),
                    authority: ctx.accounts.agreement.to_account_info(),
                },
                signer,
            ),
            landlord_amount,
            decimals,
        )?;
    }

    if tenant_amount > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.tenant_token_account.to_account_info(),
                    authority: ctx.accounts.agreement.to_account_info(),
                },
                signer,
            ),
            tenant_amount,
            decimals,
        )?;
    }

    ctx.accounts.vault.reload()?;
    require_eq!(
        ctx.accounts.vault.amount,
        0,
        DepositLockError::VaultBalanceMismatch
    );

    // Close the empty vault to return its rent to the tenant and prevent
    // unsolicited tokens from being deposited into a historical vault.
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.tenant.to_account_info(),
            authority: ctx.accounts.agreement.to_account_info(),
        },
        signer,
    ))?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.settlement.status = SettlementProposalStatus::Executed;
    ctx.accounts.settlement.responded_at = now;
    ctx.accounts.settlement.settled_tenant_amount = tenant_amount;
    ctx.accounts.settlement.settled_landlord_amount = landlord_amount;
    ctx.accounts.agreement.status = AgreementStatus::Closed;
    Ok(())
}

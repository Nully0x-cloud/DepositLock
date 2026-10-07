use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::constants::{DEPOSIT_SEED, SETTLEMENT_SEED};
use crate::error::DepositLockError;
use crate::state::{
    AgreementStatus, DepositAgreement, SettlementProposal, SettlementProposalStatus, SettlementType,
};

#[derive(Accounts)]
pub struct ProposeSettlement<'info> {
    pub landlord: Signer<'info>,

    #[account(
        mut,
        seeds = [DEPOSIT_SEED, agreement.tenancy_id.as_ref()],
        bump = agreement.bump,
        has_one = landlord @ DepositLockError::UnauthorizedLandlord,
    )]
    pub agreement: Account<'info, DepositAgreement>,

    #[account(
        mut,
        seeds = [SETTLEMENT_SEED, agreement.key().as_ref()],
        bump = settlement.bump,
        has_one = agreement @ DepositLockError::InvalidSettlementProposal,
    )]
    pub settlement: Account<'info, SettlementProposal>,

    #[account(address = agreement.mint @ DepositLockError::InvalidMint)]
    pub mint: Account<'info, Mint>,

    #[account(
        address = agreement.vault @ DepositLockError::InvalidVault,
        constraint = vault.owner == agreement.key() @ DepositLockError::InvalidVault,
        constraint = vault.mint == agreement.mint @ DepositLockError::InvalidMint,
    )]
    pub vault: Account<'info, TokenAccount>,
}

/// `landlord_amount = 0` is the full-return path. Any positive amount is an
/// agreed-deduction proposal, including a 100% deduction (tenant approval is
/// still mandatory). The tenant share is derived on chain.
pub fn handle_propose_settlement(
    ctx: Context<ProposeSettlement>,
    landlord_amount: u64,
    expected_proposal_version: u64,
    terms_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.agreement.status == AgreementStatus::Funded,
        DepositLockError::InvalidSettlementState
    );
    require!(
        ctx.accounts.settlement.status == SettlementProposalStatus::Draft
            || ctx.accounts.settlement.status == SettlementProposalStatus::Withdrawn,
        DepositLockError::InvalidSettlementState
    );

    let funded_amount = ctx.accounts.agreement.deposited_amount;
    require!(funded_amount > 0, DepositLockError::InvalidAmount);
    require!(
        landlord_amount <= funded_amount,
        DepositLockError::InvalidSettlementAmounts
    );
    require!(
        ctx.accounts.mint.decimals >= 2,
        DepositLockError::InvalidSettlementAmounts
    );
    let minor_unit = 10u64
        .checked_pow(u32::from(ctx.accounts.mint.decimals - 2))
        .ok_or_else(|| error!(DepositLockError::InvalidSettlementAmounts))?;
    require!(
        landlord_amount % minor_unit == 0,
        DepositLockError::InvalidSettlementAmounts
    );
    require!(
        ctx.accounts.vault.amount >= funded_amount,
        DepositLockError::VaultBalanceMismatch
    );
    let tenant_amount = funded_amount
        .checked_sub(landlord_amount)
        .ok_or_else(|| error!(DepositLockError::InvalidSettlementAmounts))?;
    let proposal_version = ctx
        .accounts
        .settlement
        .proposal_version
        .checked_add(1)
        .ok_or_else(|| error!(DepositLockError::ProposalVersionOverflow))?;
    require_eq!(
        proposal_version,
        expected_proposal_version,
        DepositLockError::InvalidSettlementProposal
    );
    let now = Clock::get()?.unix_timestamp;

    let settlement = &mut ctx.accounts.settlement;
    settlement.proposer = ctx.accounts.landlord.key();
    settlement.proposal_type = if landlord_amount == 0 {
        SettlementType::FullReturn
    } else {
        SettlementType::PartialDeduction
    };
    settlement.status = SettlementProposalStatus::Active;
    settlement.landlord_amount = landlord_amount;
    settlement.tenant_amount = tenant_amount;
    settlement.proposal_version = proposal_version;
    settlement.terms_hash = terms_hash;
    settlement.proposed_at = now;
    settlement.responded_at = 0;
    ctx.accounts.agreement.status = AgreementStatus::SettlementProposed;
    Ok(())
}

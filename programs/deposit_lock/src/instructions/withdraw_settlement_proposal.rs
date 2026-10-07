use anchor_lang::prelude::*;

use crate::constants::{DEPOSIT_SEED, SETTLEMENT_SEED};
use crate::error::DepositLockError;
use crate::state::{
    AgreementStatus, DepositAgreement, SettlementProposal, SettlementProposalStatus,
};

#[derive(Accounts)]
pub struct WithdrawSettlementProposal<'info> {
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
}

pub fn handle_withdraw_settlement_proposal(
    ctx: Context<WithdrawSettlementProposal>,
    expected_proposal_version: u64,
    expected_terms_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.agreement.status == AgreementStatus::SettlementProposed
            && ctx.accounts.settlement.status == SettlementProposalStatus::Active,
        DepositLockError::NoActiveSettlement
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
    ctx.accounts.settlement.status = SettlementProposalStatus::Withdrawn;
    ctx.accounts.settlement.responded_at = Clock::get()?.unix_timestamp;
    ctx.accounts.agreement.status = AgreementStatus::Funded;
    Ok(())
}

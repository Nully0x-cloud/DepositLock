use anchor_lang::prelude::*;

use crate::constants::SETTLEMENT_SEED;
use crate::error::DepositLockError;
use crate::state::{
    AgreementStatus, DepositAgreement, SettlementProposal, SettlementProposalStatus, SettlementType,
};

/// Allocates the per-agreement settlement PDA once. The actual proposal is a
/// separate instruction and may reuse this PDA after a landlord withdraws a
/// still-pending proposal.
#[derive(Accounts)]
pub struct InitializeSettlementProposal<'info> {
    #[account(mut)]
    pub landlord: Signer<'info>,

    #[account(
        has_one = landlord @ DepositLockError::UnauthorizedLandlord,
        constraint = agreement.status == AgreementStatus::Funded @ DepositLockError::InvalidSettlementState,
    )]
    pub agreement: Account<'info, DepositAgreement>,

    #[account(
        init,
        payer = landlord,
        space = 8 + SettlementProposal::INIT_SPACE,
        seeds = [SETTLEMENT_SEED, agreement.key().as_ref()],
        bump,
    )]
    pub settlement: Account<'info, SettlementProposal>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_settlement_proposal(
    ctx: Context<InitializeSettlementProposal>,
) -> Result<()> {
    let agreement = &ctx.accounts.agreement;
    ctx.accounts.settlement.set_inner(SettlementProposal {
        version: agreement.version,
        bump: ctx.bumps.settlement,
        agreement: agreement.key(),
        tenancy_id: agreement.tenancy_id,
        landlord: agreement.landlord,
        tenant: agreement.tenant,
        proposer: Pubkey::default(),
        proposal_type: SettlementType::FullReturn,
        status: SettlementProposalStatus::Draft,
        landlord_amount: 0,
        tenant_amount: 0,
        proposal_version: 0,
        terms_hash: [0; 32],
        proposed_at: 0,
        responded_at: 0,
        settled_tenant_amount: 0,
        settled_landlord_amount: 0,
    });
    Ok(())
}

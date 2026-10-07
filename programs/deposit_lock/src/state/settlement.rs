use anchor_lang::prelude::*;

/// The two mutually agreed outcomes supported in Phase 6.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum SettlementType {
    FullReturn,
    PartialDeduction,
}

/// Lifecycle of the one reusable proposal PDA attached to an agreement.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum SettlementProposalStatus {
    Draft,
    Active,
    Withdrawn,
    Challenged,
    Executed,
}

/// On-chain commitment to one landlord-proposed split.
///
/// It is a separate PDA so Phase 5 agreement account bytes and sizes do not
/// change. `proposal_version` increments each time a withdrawn proposal is
/// replaced, preventing approval against stale terms. Reasons and evidence
/// stay in Supabase; `terms_hash` binds the off-chain metadata snapshot.
#[account]
#[derive(InitSpace)]
pub struct SettlementProposal {
    pub version: u8,
    pub bump: u8,
    pub agreement: Pubkey,
    pub tenancy_id: [u8; 16],
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub proposer: Pubkey,
    pub proposal_type: SettlementType,
    pub status: SettlementProposalStatus,
    pub landlord_amount: u64,
    pub tenant_amount: u64,
    pub proposal_version: u64,
    pub terms_hash: [u8; 32],
    pub proposed_at: i64,
    pub responded_at: i64,
    /// Final on-chain payouts after accounting for any tokens donated to the
    /// vault outside the original exact funding transaction.
    pub settled_tenant_amount: u64,
    pub settled_landlord_amount: u64,
}

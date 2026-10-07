use anchor_lang::prelude::*;

#[error_code]
pub enum DepositLockError {
    #[msg("The deposit amount must be greater than zero")]
    InvalidAmount,
    #[msg("The funding amount must exactly match the required deposit")]
    AmountMismatch,
    #[msg("The landlord and the tenant must be different wallets")]
    InvalidParticipant,
    #[msg("That mint is not accepted by this DepositLock deployment")]
    InvalidMint,
    #[msg("The mint decimals do not match this deployment's configuration")]
    InvalidDecimals,
    #[msg("Only the tenant recorded on the agreement may fund it")]
    UnauthorizedTenant,
    #[msg("This deposit has already been funded")]
    AlreadyFunded,
    #[msg("The agreement is not in the state this instruction requires")]
    InvalidStatus,
    #[msg("That vault does not belong to this deposit agreement")]
    InvalidVault,
    #[msg("The source account is not the tenant's token account for this mint")]
    InvalidSourceAccount,
    #[msg("The tenant does not hold enough tokens to fund the deposit")]
    InsufficientFunds,
    #[msg("Only the landlord recorded on this agreement may propose settlement")]
    UnauthorizedLandlord,
    #[msg("This settlement instruction is not valid for the agreement state")]
    InvalidSettlementState,
    #[msg("No active settlement proposal exists")]
    NoActiveSettlement,
    #[msg("The settlement split does not equal the protected deposit")]
    InvalidSettlementAmounts,
    #[msg("The proposal version overflowed")]
    ProposalVersionOverflow,
    #[msg("The proposal PDA does not belong to this agreement")]
    InvalidSettlementProposal,
    #[msg("The vault token balance does not equal the protected deposit")]
    VaultBalanceMismatch,
    #[msg("The settlement recipient token account is invalid")]
    InvalidRecipient,
}

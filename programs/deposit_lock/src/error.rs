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
}

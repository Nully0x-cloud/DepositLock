use anchor_lang::prelude::*;

/// Deployment-specific configuration.
///
/// The accepted mint lives here rather than inside program logic so a
/// deployment can point at an official stablecoin or a clearly-labelled test
/// mint without code changes. Initialized once per deployment.
#[account]
#[derive(InitSpace)]
pub struct DepositLockConfig {
    /// Layout version (`CONFIG_VERSION`).
    pub version: u8,
    /// Canonical bump of this PDA.
    pub bump: u8,
    /// Wallet that initialized the configuration (the deployer).
    pub admin: Pubkey,
    /// The only mint this deployment accepts for deposits.
    pub allowed_mint: Pubkey,
    /// Decimals of `allowed_mint` at configuration time.
    pub allowed_decimals: u8,
    /// Unix timestamp of configuration.
    pub created_at: i64,
}

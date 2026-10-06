use anchor_lang::prelude::*;

/// Lifecycle of a deposit agreement.
///
/// Phase 5 uses `Initialized` and `Funded` only. `Closed` exists so a future
/// release instruction can retire an account without inventing a new
/// discriminant, and disputed/settlement states can be appended later without
/// touching existing fields.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum AgreementStatus {
    Initialized,
    Funded,
    Closed,
}

/// The on-chain deposit agreement for one accepted tenancy.
///
/// Derived from `[b"deposit", tenancy_id_bytes]`; the account is the only
/// authority able to move the vault's tokens (via program invocation), which
/// is what makes the deposit non-custodial for both parties.
#[account]
#[derive(InitSpace)]
pub struct DepositAgreement {
    /// Layout version (`AGREEMENT_VERSION`).
    pub version: u8,
    /// Canonical bump of this PDA.
    pub bump: u8,
    /// Current lifecycle state.
    pub status: AgreementStatus,
    /// Raw 16 bytes of the Supabase tenancy UUID (RFC 4122 byte order).
    pub tenancy_id: [u8; 16],
    /// Wallet that initialized the agreement (the landlord).
    pub landlord: Pubkey,
    /// Wallet allowed to fund the agreement — the stored tenant.
    pub tenant: Pubkey,
    /// The accepted mint for this deployment, copied at initialization.
    pub mint: Pubkey,
    /// The vault token account (ATA of this agreement for `mint`).
    pub vault: Pubkey,
    /// Required deposit, in mint base units. Integer only — never floats.
    pub required_amount: u64,
    /// Amount actually transferred in (equals `required_amount` once funded).
    pub deposited_amount: u64,
    /// Unix timestamp of initialization.
    pub created_at: i64,
    /// Unix timestamp of funding (0 until funded).
    pub funded_at: i64,
}

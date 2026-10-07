/// Seed for the deployment-specific configuration PDA.
pub const CONFIG_SEED: &[u8] = b"depositlock_config";

/// First seed of the Deposit Agreement PDA, followed by the 16 raw bytes of
/// the Supabase tenancy UUID (RFC 4122 byte order, hyphens removed).
pub const DEPOSIT_SEED: &[u8] = b"deposit";

/// Seed for the single settlement-proposal PDA attached to an agreement.
pub const SETTLEMENT_SEED: &[u8] = b"settlement";

/// Version stamped into new accounts so future layouts stay detectable.
pub const AGREEMENT_VERSION: u8 = 1;

/// Version stamped into the configuration account.
pub const CONFIG_VERSION: u8 = 1;

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, CONFIG_VERSION};
use crate::state::DepositLockConfig;

/// One-time, deployment-specific configuration.
///
/// Permissionless first-call by design (a program cannot know its deployer);
/// the deployment script calls it immediately after deploying, and the
/// application independently cross-checks the mint against its own published
/// deployment constants, so a front-run configuration cannot mislead the app.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + DepositLockConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, DepositLockConfig>,

    /// The mint this deployment will accept. Must already exist on-chain.
    pub mint: Account<'info, anchor_spl::token::Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.config.set_inner(DepositLockConfig {
        version: CONFIG_VERSION,
        bump: ctx.bumps.config,
        admin: ctx.accounts.admin.key(),
        allowed_mint: ctx.accounts.mint.key(),
        allowed_decimals: ctx.accounts.mint.decimals,
        created_at: clock.unix_timestamp,
    });
    Ok(())
}

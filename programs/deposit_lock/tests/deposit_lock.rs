//! DepositLock program tests — happy path plus adversarial coverage.
//!
//! Run with `anchor test`: the build step produces
//! `target/deploy/deposit_lock.so`, then `cargo test` executes this suite
//! against the compiled program in LiteSVM. SPL Token and the Associated
//! Token Account program come from LiteSVM's default genesis.

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_instruction},
        AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{
            get_associated_token_address, spl_associated_token_account, ID as ATA_PROGRAM_ID,
        },
        token::{spl_token, ID as TOKEN_PROGRAM_ID},
    },
    deposit_lock::{
        accounts, error::DepositLockError, instruction,
        state::{AgreementStatus, DepositAgreement, DepositLockConfig},
        CONFIG_SEED, DEPOSIT_SEED,
    },
    litesvm::{types::TransactionResult, LiteSVM},
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const DECIMALS: u8 = 6;
/// 1,800.00 tokens in base units — the demo deposit.
const REQUIRED: u64 = 1_800_000_000;
/// A fully funded tenant wallet.
const TENANT_FULL: u64 = 2_000_000_000;
/// A tenant balance that is deliberately too small for `REQUIRED`.
const TENANT_POOR: u64 = 1_000_000;
const SOL: u64 = 1_000_000_000;
/// Generous mint account balance — well above rent for 82 bytes.
const MINT_LAMPORTS: u64 = SOL;
/// SPL mint account size in bytes.
const MINT_LEN: u64 = 82;
const TOKEN_ACCOUNT_LEN: u64 = 165;
const TENANCY_A: [u8; 16] = [1u8; 16];
const TENANCY_B: [u8; 16] = [2u8; 16];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Anchor error codes start at 6000 (verified against the generated IDL);
/// variants map to codes in declaration order.
fn code(error: DepositLockError) -> u32 {
    6000 + error as u32
}

fn expect_custom(result: TransactionResult, expected: u32, context: &str) {
    let failure = match result {
        Ok(_) => {
            panic!("{context}: expected the transaction to fail with custom error {expected}")
        }
        Err(failure) => failure,
    };
    let detail = format!("{:?}", failure.err);
    assert!(
        detail.contains(&format!("Custom({expected})")),
        "{context}: expected custom error {expected}, got {detail}\n--- logs ---\n{}",
        failure.meta.pretty_logs()
    );
}

/// Accept any failure (native program or anchor constraint) and print the
/// logs so the exact error can be tightened after inspection.
fn expect_failure(result: TransactionResult, context: &str) {
    match result {
        Ok(_) => panic!("{context}: expected the transaction to fail"),
        Err(failure) => eprintln!(
            "{context}: failed as expected with {:?}\n--- logs ---\n{}",
            failure.err,
            failure.meta.pretty_logs()
        ),
    }
}

/// Assert the transaction failed AND anchor logged a specific error name
/// (used for native anchor errors such as `ConstraintSeeds`).
fn expect_anchor_error_named(result: TransactionResult, name: &str, context: &str) {
    let failure = match result {
        Ok(_) => {
            panic!("{context}: expected the transaction to fail with anchor error {name}")
        }
        Err(failure) => failure,
    };
    let logs = failure.meta.logs.join("\n");
    assert!(
        logs.contains(&format!("Error Code: {name}")),
        "{context}: expected anchor error named {name}, got {:?}\n--- logs ---\n{logs}",
        failure.err
    );
}

fn send(
    svm: &mut LiteSVM,
    instructions: Vec<Instruction>,
    signers: &[&Keypair],
) -> TransactionResult {
    let blockhash = svm.latest_blockhash();
    let payer = signers[0].pubkey();
    let message = Message::new_with_blockhash(&instructions, Some(&payer), &blockhash);
    let dyn_signers: Vec<&dyn Signer> = signers.iter().map(|k| *k as &dyn Signer).collect();
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &dyn_signers).unwrap();
    svm.send_transaction(tx)
}

fn send_ok(svm: &mut LiteSVM, instructions: Vec<Instruction>, signers: &[&Keypair]) {
    send(svm, instructions, signers)
        .unwrap_or_else(|f| panic!("setup step failed: {}", f.meta.pretty_logs()));
}

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &deposit_lock::id()).0
}

fn agreement_pda(tenancy_id: &[u8; 16]) -> Pubkey {
    Pubkey::find_program_address(&[DEPOSIT_SEED, tenancy_id.as_slice()], &deposit_lock::id()).0
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, decimals: u8) {
    let ix_create = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        MINT_LAMPORTS,
        MINT_LEN,
        &TOKEN_PROGRAM_ID,
    );
    let ix_init = spl_token::instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &mint.pubkey(),
        &payer.pubkey(),
        None,
        decimals,
    )
    .unwrap();
    send_ok(svm, vec![ix_create, ix_init], &[payer, mint]);
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, wallet: Pubkey, mint: Pubkey) {
    let ix =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &payer.pubkey(),
            &wallet,
            &mint,
            &TOKEN_PROGRAM_ID,
        );
    send_ok(svm, vec![ix], &[payer]);
}

fn create_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    keypair: &Keypair,
    owner: Pubkey,
    mint: Pubkey,
) {
    let ix_create = system_instruction::create_account(
        &payer.pubkey(),
        &keypair.pubkey(),
        SOL,
        TOKEN_ACCOUNT_LEN,
        &TOKEN_PROGRAM_ID,
    );
    let ix_init =
        spl_token::instruction::initialize_account3(&TOKEN_PROGRAM_ID, &keypair.pubkey(), &mint, &owner)
            .unwrap();
    send_ok(svm, vec![ix_create, ix_init], &[payer, keypair]);
}

fn mint_tokens(
    svm: &mut LiteSVM,
    authority: &Keypair,
    mint: Pubkey,
    destination: Pubkey,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        &mint,
        &destination,
        &authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    send_ok(svm, vec![ix], &[authority]);
}

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    landlord: Keypair,
    tenant: Keypair,
    outsider: Keypair,
    mint: Keypair,
    other_mint: Keypair,
}

fn env_with(tenant_minted: u64) -> Env {
    let program = deposit_lock::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/deposit_lock.so"
    ));
    svm.add_program(program, bytes).unwrap();

    let admin = Keypair::new();
    let landlord = Keypair::new();
    let tenant = Keypair::new();
    let outsider = Keypair::new();
    let mint = Keypair::new();
    let other_mint = Keypair::new();

    for wallet in [&admin, &landlord, &tenant, &outsider] {
        svm.airdrop(&wallet.pubkey(), 10 * SOL).unwrap();
    }

    // LiteSVM's genesis clock reads 0 — give the program a realistic
    // non-zero timestamp so created_at/funded_at assertions are meaningful.
    let mut clock = svm.get_sysvar::<Clock>();
    if clock.unix_timestamp <= 0 {
        clock.unix_timestamp = 1_760_000_000;
        svm.set_sysvar(&clock);
    }

    create_mint(&mut svm, &admin, &mint, DECIMALS);
    create_mint(&mut svm, &admin, &other_mint, DECIMALS);
    if tenant_minted > 0 {
        create_ata(&mut svm, &tenant, tenant.pubkey(), mint.pubkey());
        let tenant_token_account = get_associated_token_address(&tenant.pubkey(), &mint.pubkey());
        mint_tokens(&mut svm, &admin, mint.pubkey(), tenant_token_account, tenant_minted);
    }

    Env {
        svm,
        admin,
        landlord,
        tenant,
        outsider,
        mint,
        other_mint,
    }
}

fn env() -> Env {
    env_with(TENANT_FULL)
}

fn ix_initialize_config(admin: Pubkey, env: &Env) -> Instruction {
    Instruction {
        program_id: deposit_lock::id(),
        accounts: accounts::InitializeConfig {
            admin,
            config: config_pda(),
            mint: env.mint.pubkey(),
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::InitializeConfig {}.data(),
    }
}

fn ix_initialize_deposit(
    landlord: Pubkey,
    tenant: Pubkey,
    mint: Pubkey,
    tenancy_id: [u8; 16],
    required_amount: u64,
) -> Instruction {
    let agreement = agreement_pda(&tenancy_id);
    Instruction {
        program_id: deposit_lock::id(),
        accounts: accounts::InitializeDeposit {
            landlord,
            tenant,
            config: config_pda(),
            mint,
            agreement,
            vault: get_associated_token_address(&agreement, &mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ATA_PROGRAM_ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::InitializeDeposit {
            tenancy_id,
            required_amount,
        }
        .data(),
    }
}

fn ix_fund(
    tenant: Pubkey,
    tenancy_id: [u8; 16],
    mint: Pubkey,
    source: Pubkey,
    vault: Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: deposit_lock::id(),
        accounts: accounts::FundDeposit {
            tenant,
            agreement: agreement_pda(&tenancy_id),
            mint,
            source,
            vault,
            token_program: TOKEN_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: instruction::FundDeposit { amount }.data(),
    }
}

fn ix_token_transfer(
    source: Pubkey,
    mint: Pubkey,
    destination: Pubkey,
    authority: Pubkey,
    amount: u64,
) -> Instruction {
    spl_token::instruction::transfer_checked(
        &TOKEN_PROGRAM_ID,
        &source,
        &mint,
        &destination,
        &authority,
        &[],
        amount,
        DECIMALS,
    )
    .unwrap()
}

fn init_config_ok(env: &mut Env) {
    let ix = ix_initialize_config(env.admin.pubkey(), env);
    send_ok(&mut env.svm, vec![ix], &[&env.admin]);
}

fn init_deposit_ok(env: &mut Env, tenancy_id: [u8; 16], required_amount: u64) -> Pubkey {
    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.tenant.pubkey(),
        env.mint.pubkey(),
        tenancy_id,
        required_amount,
    );
    send_ok(&mut env.svm, vec![ix], &[&env.landlord]);
    agreement_pda(&tenancy_id)
}

fn fund_ok(env: &mut Env, tenancy_id: [u8; 16], amount: u64) {
    let agreement = agreement_pda(&tenancy_id);
    let state = read_agreement(&env.svm, agreement);
    let ix = ix_fund(
        env.tenant.pubkey(),
        tenancy_id,
        state.mint,
        get_associated_token_address(&env.tenant.pubkey(), &state.mint),
        state.vault,
        amount,
    );
    send_ok(&mut env.svm, vec![ix], &[&env.tenant]);
}

fn read_agreement(svm: &LiteSVM, address: Pubkey) -> DepositAgreement {
    let account = svm.get_account(&address).expect("agreement account missing");
    assert_eq!(
        account.owner,
        deposit_lock::id(),
        "agreement not program-owned"
    );
    let mut data: &[u8] = &account.data;
    DepositAgreement::try_deserialize(&mut data).expect("agreement deserialization failed")
}

fn read_config(svm: &LiteSVM, address: Pubkey) -> DepositLockConfig {
    let account = svm.get_account(&address).expect("config account missing");
    let mut data: &[u8] = &account.data;
    DepositLockConfig::try_deserialize(&mut data).expect("config deserialization failed")
}

/// SPL token account balance: `amount` lives at byte offset 64
/// (mint 32 bytes + owner 32 bytes), u64 little endian.
fn token_balance(svm: &LiteSVM, address: Pubkey) -> u64 {
    let account = svm.get_account(&address).expect("token account missing");
    u64::from_le_bytes(account.data[64..72].try_into().unwrap())
}

/// Directly rewrite agreement state (test-only), simulating corrupted or
/// forged on-chain data that the program must still reject.
fn overwrite_agreement(
    env: &mut Env,
    address: Pubkey,
    mutate: impl FnOnce(&mut DepositAgreement),
) {
    let mut agreement = read_agreement(&env.svm, address);
    mutate(&mut agreement);
    let mut data = Vec::new();
    agreement.try_serialize(&mut data).unwrap();
    let mut account = env.svm.get_account(&address).unwrap();
    account.data = data;
    env.svm.set_account(address.into(), account).unwrap();
}

// ---------------------------------------------------------------------------
// initialize_config
// ---------------------------------------------------------------------------

#[test]
fn config_initialization_records_the_accepted_mint() {
    let mut env = env();
    init_config_ok(&mut env);

    let config = read_config(&env.svm, config_pda());
    assert_eq!(config.version, 1);
    assert_eq!(config.admin, env.admin.pubkey());
    assert_eq!(config.allowed_mint, env.mint.pubkey());
    assert_eq!(config.allowed_decimals, DECIMALS);
    assert!(config.created_at > 0);
    let (address, bump) = Pubkey::find_program_address(&[CONFIG_SEED], &deposit_lock::id());
    assert_eq!(config_pda(), address);
    assert_eq!(config.bump, bump);
}

#[test]
fn config_cannot_be_initialized_twice() {
    let mut env = env();
    init_config_ok(&mut env);

    let ix = ix_initialize_config(env.admin.pubkey(), &env);
    let result = send(&mut env.svm, vec![ix], &[&env.admin]);
    expect_failure(result, "second initialize_config");

    let config = read_config(&env.svm, config_pda());
    assert_eq!(config.admin, env.admin.pubkey(), "existing config overwritten");
    assert_eq!(
        config.allowed_mint,
        env.mint.pubkey(),
        "existing mint overwritten"
    );
}

#[test]
fn permissionless_first_config_records_who_set_it() {
    // By design anyone may run the first initialize_config; the deployment
    // script runs it immediately, and the app independently cross-checks the
    // mint against its published constants so a front-run cannot mislead it.
    let mut env = env();
    let ix = ix_initialize_config(env.outsider.pubkey(), &env);
    let result = send(&mut env.svm, vec![ix], &[&env.outsider]);
    result.expect("permissionless first config should succeed");

    let config = read_config(&env.svm, config_pda());
    assert_eq!(config.admin, env.outsider.pubkey());
    assert_eq!(config.allowed_mint, env.mint.pubkey());
}

// ---------------------------------------------------------------------------
// initialize_deposit
// ---------------------------------------------------------------------------

#[test]
fn deposit_initialization_creates_agreement_and_vault() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.version, 1);
    assert_eq!(state.status, AgreementStatus::Initialized);
    assert_eq!(state.tenancy_id, TENANCY_A);
    assert_eq!(state.landlord, env.landlord.pubkey());
    assert_eq!(state.tenant, env.tenant.pubkey());
    assert_eq!(state.mint, env.mint.pubkey());
    assert_eq!(state.required_amount, REQUIRED);
    assert_eq!(state.deposited_amount, 0);
    assert_eq!(state.funded_at, 0);
    assert!(state.created_at > 0);
    let (_, bump) =
        Pubkey::find_program_address(&[DEPOSIT_SEED, &TENANCY_A], &deposit_lock::id());
    assert_eq!(state.bump, bump);

    let expected_vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    assert_eq!(
        state.vault, expected_vault,
        "vault must be the agreement's ATA"
    );
    let vault = env.svm.get_account(&expected_vault).expect("vault missing");
    assert_eq!(vault.owner, TOKEN_PROGRAM_ID);
    assert_eq!(
        token_balance(&env.svm, expected_vault),
        0,
        "vault must start empty"
    );
}

#[test]
fn deposit_initialization_rejects_landlord_as_tenant() {
    let mut env = env();
    init_config_ok(&mut env);

    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.landlord.pubkey(),
        env.mint.pubkey(),
        TENANCY_A,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_custom(
        result,
        code(DepositLockError::InvalidParticipant),
        "landlord == tenant",
    );
    assert!(env.svm.get_account(&agreement_pda(&TENANCY_A)).is_none());
}

#[test]
fn deposit_initialization_rejects_non_wallet_tenant() {
    let mut env = env();
    init_config_ok(&mut env);

    // The mint account is not system-owned, so it can never be a tenant.
    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.mint.pubkey(),
        env.mint.pubkey(),
        TENANCY_A,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_custom(
        result,
        code(DepositLockError::InvalidParticipant),
        "mint as tenant",
    );
    assert!(env.svm.get_account(&agreement_pda(&TENANCY_A)).is_none());
}

#[test]
fn deposit_initialization_rejects_unknown_mint() {
    let mut env = env();
    init_config_ok(&mut env);

    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.tenant.pubkey(),
        env.other_mint.pubkey(),
        TENANCY_A,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_custom(
        result,
        code(DepositLockError::InvalidMint),
        "non-configured mint",
    );
    assert!(env.svm.get_account(&agreement_pda(&TENANCY_A)).is_none());
}

#[test]
fn deposit_initialization_rejects_zero_amount() {
    let mut env = env();
    init_config_ok(&mut env);

    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.tenant.pubkey(),
        env.mint.pubkey(),
        TENANCY_A,
        0,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_custom(
        result,
        code(DepositLockError::InvalidAmount),
        "required amount zero",
    );
    assert!(env.svm.get_account(&agreement_pda(&TENANCY_A)).is_none());
}

#[test]
fn deposit_initialization_rejects_duplicate_tenancy() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);

    // A different wallet tries to re-initialize the same tenancy with
    // different terms — it must fail AND leave the original state untouched.
    let ix = ix_initialize_deposit(
        env.outsider.pubkey(),
        env.tenant.pubkey(),
        env.mint.pubkey(),
        TENANCY_A,
        999,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.outsider]);
    expect_failure(result, "duplicate initialize_deposit");

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(
        state.landlord,
        env.landlord.pubkey(),
        "agreement was re-initialized"
    );
    assert_eq!(state.required_amount, REQUIRED, "terms were overwritten");
    assert_eq!(state.status, AgreementStatus::Initialized);
}

#[test]
fn deposit_initialization_requires_the_config_account() {
    let mut env = env();
    // No initialize_config has run, so the config PDA does not exist.

    let ix = ix_initialize_deposit(
        env.landlord.pubkey(),
        env.tenant.pubkey(),
        env.mint.pubkey(),
        TENANCY_A,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_anchor_error_named(result, "AccountNotInitialized", "missing config");
}

// ---------------------------------------------------------------------------
// fund_deposit
// ---------------------------------------------------------------------------

#[test]
fn tenant_funds_the_exact_deposit() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    assert_eq!(token_balance(&env.svm, source), TENANT_FULL);
    fund_ok(&mut env, TENANCY_A, REQUIRED);

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Funded);
    assert_eq!(state.deposited_amount, REQUIRED);
    assert!(state.funded_at > 0, "funded_at must be stamped");
    assert_eq!(state.tenant, env.tenant.pubkey());

    assert_eq!(
        token_balance(&env.svm, vault),
        REQUIRED,
        "vault must hold the deposit"
    );
    assert_eq!(
        token_balance(&env.svm, source),
        TENANT_FULL - REQUIRED,
        "tenant wallet must be debited exactly the deposit"
    );
}

#[test]
fn funding_rejects_wrong_amount() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    for amount in [REQUIRED - 1, REQUIRED + 1, 0] {
        let ix = ix_fund(
            env.tenant.pubkey(),
            TENANCY_A,
            env.mint.pubkey(),
            source,
            vault,
            amount,
        );
        let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
        expect_custom(
            result,
            code(DepositLockError::AmountMismatch),
            &format!("amount {amount}"),
        );
        env.svm.expire_blockhash();
    }

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(
        state.status,
        AgreementStatus::Initialized,
        "agreement must stay unfunded"
    );
    assert_eq!(token_balance(&env.svm, vault), 0, "vault must stay empty");
}

#[test]
fn only_the_recorded_tenant_can_fund() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let tenant_source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    // The source address is derived from the *signer*, so the landlord
    // passing the tenant's token account fails the canonical-address check.
    let ix = ix_fund(
        env.landlord.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        tenant_source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_custom(
        result,
        code(DepositLockError::InvalidSourceAccount),
        "landlord funding",
    );
    env.svm.expire_blockhash();

    // An outsider funding with their own token account passes every address
    // constraint (the source is derived from the signer), so the guard that
    // fires is the handler's stored-tenant check: UnauthorizedTenant.
    create_ata(
        &mut env.svm,
        &env.outsider,
        env.outsider.pubkey(),
        env.mint.pubkey(),
    );
    let outsider_source = get_associated_token_address(&env.outsider.pubkey(), &env.mint.pubkey());
    let ix = ix_fund(
        env.outsider.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        outsider_source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.outsider]);
    expect_custom(
        result,
        code(DepositLockError::UnauthorizedTenant),
        "outsider funding",
    );

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Initialized);
    assert_eq!(token_balance(&env.svm, vault), 0);
}

#[test]
fn funding_rejects_wrong_mint() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.other_mint.pubkey(),
        source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(result, code(DepositLockError::InvalidMint), "wrong mint account");
    env.svm.expire_blockhash();

    // A source that belongs to a different mint is rejected as well
    // (source.mint must equal the agreement's mint).
    let other_source = get_associated_token_address(&env.tenant.pubkey(), &env.other_mint.pubkey());
    if env.svm.get_account(&other_source).is_none() {
        create_ata(
            &mut env.svm,
            &env.tenant,
            env.tenant.pubkey(),
            env.other_mint.pubkey(),
        );
    }
    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        other_source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(
        result,
        code(DepositLockError::InvalidMint),
        "source on other mint",
    );
}

#[test]
fn funding_rejects_a_non_canonical_source() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());

    // The tenant spins up a hand-made token account for the same mint — the
    // right owner and mint, but not the canonical ATA for this pair.
    let alt = Keypair::new();
    create_token_account(
        &mut env.svm,
        &env.tenant,
        &alt,
        env.tenant.pubkey(),
        env.mint.pubkey(),
    );

    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        alt.pubkey(),
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(
        result,
        code(DepositLockError::InvalidSourceAccount),
        "non-ATA source",
    );

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Initialized);
}

#[test]
fn funding_rejects_a_foreign_vault() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    // Another wallet's token account for the same mint is not the vault.
    create_ata(&mut env.svm, &env.outsider, env.outsider.pubkey(), env.mint.pubkey());
    let foreign_vault = get_associated_token_address(&env.outsider.pubkey(), &env.mint.pubkey());

    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        source,
        foreign_vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(result, code(DepositLockError::InvalidVault), "foreign vault");
    assert_eq!(
        token_balance(&env.svm, foreign_vault),
        0,
        "foreign vault must stay empty"
    );

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Initialized);
}

#[test]
fn funding_requires_sufficient_balance() {
    let mut env = env_with(TENANT_POOR);
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());

    let balance = token_balance(&env.svm, source);
    assert!(balance < REQUIRED, "tenant must start under-funded");

    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(
        result,
        code(DepositLockError::InsufficientFunds),
        "underfunded tenant",
    );

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Initialized);
    assert_eq!(token_balance(&env.svm, vault), 0);
}

#[test]
fn a_deposit_can_only_be_funded_once() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());

    fund_ok(&mut env, TENANCY_A, REQUIRED);
    let after_first = token_balance(&env.svm, vault);

    env.svm.expire_blockhash();
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());
    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(
        result,
        code(DepositLockError::AlreadyFunded),
        "second funding",
    );

    let state = read_agreement(&env.svm, agreement);
    assert_eq!(state.status, AgreementStatus::Funded);
    assert_eq!(state.deposited_amount, REQUIRED);
    assert_eq!(
        token_balance(&env.svm, vault),
        after_first,
        "double funding must not move extra tokens"
    );
}

// ---------------------------------------------------------------------------
// No single party can move the funded vault
// ---------------------------------------------------------------------------

#[test]
fn vault_authority_is_the_agreement_pda() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    fund_ok(&mut env, TENANCY_A, REQUIRED);

    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let account = env.svm.get_account(&vault).expect("vault missing");
    // SPL token account layout: mint at 0..32, owner (the authority) at 32..64.
    assert_eq!(
        &account.data[32..64],
        agreement.as_ref(),
        "the agreement PDA, not a wallet, must own the vault"
    );
}

#[test]
fn landlord_cannot_drain_the_vault() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    fund_ok(&mut env, TENANCY_A, REQUIRED);

    // Direct token transfer attempted with the landlord's own signature:
    // the token program sees the vault's real authority (the PDA) does not
    // match and refuses. This is the on-chain form of "you cannot withdraw".
    create_ata(&mut env.svm, &env.outsider, env.outsider.pubkey(), env.mint.pubkey());
    let destination = get_associated_token_address(&env.outsider.pubkey(), &env.mint.pubkey());
    let ix = ix_token_transfer(
        vault,
        env.mint.pubkey(),
        destination,
        env.landlord.pubkey(),
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.landlord]);
    expect_failure(result, "landlord draining the vault");

    assert_eq!(
        token_balance(&env.svm, vault),
        REQUIRED,
        "vault must be untouched after the failed drain"
    );
    assert_eq!(token_balance(&env.svm, destination), 0);
}

#[test]
fn tenant_cannot_drain_the_vault_alone() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    fund_ok(&mut env, TENANCY_A, REQUIRED);

    // Same attempt with the tenant's key — also refused: only the program
    // rules (a future settlement instruction, Phase 6) can move these tokens.
    let ix = ix_token_transfer(
        vault,
        env.mint.pubkey(),
        get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey()),
        env.tenant.pubkey(),
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_failure(result, "tenant draining the vault");

    assert_eq!(token_balance(&env.svm, vault), REQUIRED);
}

// ---------------------------------------------------------------------------
// Forged / corrupted state and isolation
// ---------------------------------------------------------------------------

#[test]
fn closed_agreements_cannot_be_funded() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);

    overwrite_agreement(&mut env, agreement, |state| {
        state.status = AgreementStatus::Closed;
    });

    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());
    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_custom(
        result,
        code(DepositLockError::InvalidStatus),
        "funding a closed agreement",
    );
    assert_eq!(token_balance(&env.svm, vault), 0);
}

#[test]
fn forged_tenancy_id_fails_the_pda_check() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);

    // Simulate forged state: the stored tenancy id no longer matches the
    // address the PDA seeds derive, so anchor's seed check must reject it.
    overwrite_agreement(&mut env, agreement, |state| {
        state.tenancy_id = [9u8; 16];
    });

    let vault = get_associated_token_address(&agreement, &env.mint.pubkey());
    let source = get_associated_token_address(&env.tenant.pubkey(), &env.mint.pubkey());
    let ix = ix_fund(
        env.tenant.pubkey(),
        TENANCY_A,
        env.mint.pubkey(),
        source,
        vault,
        REQUIRED,
    );
    let result = send(&mut env.svm, vec![ix], &[&env.tenant]);
    expect_anchor_error_named(result, "ConstraintSeeds", "forged tenancy id");
    assert_eq!(token_balance(&env.svm, vault), 0);
}

#[test]
fn two_tenancies_are_isolated() {
    let mut env = env();
    init_config_ok(&mut env);
    let agreement_a = init_deposit_ok(&mut env, TENANCY_A, REQUIRED);
    fund_ok(&mut env, TENANCY_A, REQUIRED);

    let required_b = 1_200_000_000;
    let agreement_b = init_deposit_ok(&mut env, TENANCY_B, required_b);

    let state_a = read_agreement(&env.svm, agreement_a);
    assert_eq!(state_a.status, AgreementStatus::Funded);
    assert_eq!(state_a.required_amount, REQUIRED);

    let state_b = read_agreement(&env.svm, agreement_b);
    assert_eq!(state_b.status, AgreementStatus::Initialized);
    assert_eq!(state_b.required_amount, required_b);
    assert_eq!(state_b.deposited_amount, 0);
    assert_ne!(state_a.vault, state_b.vault, "vaults must be distinct");

    let vault_a = get_associated_token_address(&agreement_a, &env.mint.pubkey());
    let vault_b = get_associated_token_address(&agreement_b, &env.mint.pubkey());
    assert_eq!(token_balance(&env.svm, vault_a), REQUIRED);
    assert_eq!(token_balance(&env.svm, vault_b), 0);
}

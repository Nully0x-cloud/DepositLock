#!/usr/bin/env bash
set -euo pipefail

# Run from the repository's WSL path after `.keys/deployer.json` has at least
# 2.25 devnet SOL (the Phase 6 binary is larger and an upgrade temporarily
# needs both the buffer rent and the program-data expansion). This deploys the current Anchor binary, creates one
# test-only six-decimal mint, records it in deployment.ts and initializes the
# program config PDA.

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi

if [[ ! -f .keys/deployer.json ]]; then
  echo "Missing .keys/deployer.json" >&2
  exit 1
fi

solana config set --keypair .keys/deployer.json --url devnet >/dev/null

BALANCE="$(solana balance --keypair .keys/deployer.json --url devnet | awk '{print $1}')"
if ! awk -v balance="$BALANCE" 'BEGIN { exit !(balance >= 2.25) }'; then
  echo "Upgrade deployer needs at least 2.25 devnet SOL; current balance: ${BALANCE:-unknown}" >&2
  exit 1
fi

anchor build
if [[ ! -f .keys/deposit_lock-buffer.json ]]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile .keys/deposit_lock-buffer.json
fi
solana program deploy target/deploy/deposit_lock.so \
  --keypair .keys/deployer.json \
  --buffer .keys/deposit_lock-buffer.json \
  --program-id target/deploy/deposit_lock-keypair.json \
  --url devnet

if [[ ! -f .keys/mint.json ]]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile .keys/mint.json
fi

DEPLOYER_ADDRESS="$(solana-keygen pubkey .keys/deployer.json)"
if ! solana account "$(solana-keygen pubkey .keys/mint.json)" --url devnet >/dev/null 2>&1; then
  spl-token create-token --decimals 6 .keys/mint.json \
    --url devnet \
    --fee-payer .keys/deployer.json \
    --mint-authority "$DEPLOYER_ADDRESS"
fi

MINT_ADDRESS="$(solana-keygen pubkey .keys/mint.json)"
sed -i -E "s|export const DEPOSIT_LOCK_MINT_ADDRESS = \".*\";|export const DEPOSIT_LOCK_MINT_ADDRESS = \"$MINT_ADDRESS\";|" \
  src/lib/solana/deployment.ts

node scripts/devnet-init-config.mjs
echo "Deployment complete. Mint: $MINT_ADDRESS"

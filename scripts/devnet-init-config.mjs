#!/usr/bin/env node

/** Initialize the DepositLock config PDA with `.keys/mint.json` on Devnet. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const ROOT = process.cwd();
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const CONFIG_SEED = Buffer.from("depositlock_config");
const CONFIG_DISCRIMINATOR = Uint8Array.from([100, 201, 249, 97, 88, 98, 177, 123]);
const INITIALIZE_CONFIG_DISCRIMINATOR = Uint8Array.from([208, 127, 21, 1, 194, 190, 196, 70]);
const DECIMALS = 6;

function loadKeypair(relativePath) {
  const path = resolve(ROOT, relativePath);
  const bytes = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function hasDiscriminator(data, expected) {
  return expected.every((byte, index) => data[index] === byte);
}

async function main() {
  const admin = loadKeypair(".keys/deployer.json");
  const mint = loadKeypair(".keys/mint.json");
  const connection = new Connection(RPC_URL, "confirmed");
  const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);

  const mintInfo = await connection.getAccountInfo(mint.publicKey, "confirmed");
  if (!mintInfo || !mintInfo.owner.equals(TOKEN_PROGRAM_ID) || mintInfo.data.length < 46) {
    throw new Error("The configured mint keypair is not an initialized classic SPL Token mint.");
  }
  if (mintInfo.data[44] !== DECIMALS) {
    throw new Error(`Expected a ${DECIMALS}-decimal test mint; found ${mintInfo.data[44]} decimals.`);
  }

  const existing = await connection.getAccountInfo(config, "confirmed");
  if (existing) {
    if (!hasDiscriminator(existing.data, CONFIG_DISCRIMINATOR)) {
      throw new Error("The config PDA is occupied by an unexpected account.");
    }
    const configuredMint = new PublicKey(existing.data.slice(42, 74));
    const configuredDecimals = existing.data[74];
    if (!configuredMint.equals(mint.publicKey) || configuredDecimals !== DECIMALS) {
      throw new Error("The existing config PDA does not match `.keys/mint.json` and 6 decimals.");
    }
    console.log(`Config already initialized: ${config.toBase58()}`);
    console.log(`Accepted test mint: ${mint.publicKey.toBase58()}`);
    return;
  }

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(INITIALIZE_CONFIG_DISCRIMINATOR),
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [admin],
    { commitment: "confirmed" },
  );
  console.log(`Config initialized: ${config.toBase58()}`);
  console.log(`Accepted test mint: ${mint.publicKey.toBase58()}`);
  console.log(`Transaction: ${signature}`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});

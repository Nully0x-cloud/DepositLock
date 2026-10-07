#!/usr/bin/env node

/** Copy Anchor's generated IDL into the web client after `anchor build`. */

import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("target/idl/deposit_lock.json");
const destination = resolve("src/lib/solana/deposit-lock.idl.json");
if (!existsSync(source)) {
  throw new Error("Anchor IDL is missing. Run `anchor build` first.");
}
copyFileSync(source, destination);
console.log("Synced generated Anchor IDL to src/lib/solana/deposit-lock.idl.json");

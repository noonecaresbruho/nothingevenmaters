#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { normalizePatchFile, parseHexBytes } from "./src/patchDefinition.js";
import { scanAll } from "./src/binScanner.js";
import { ensureHostsEntries, relaunchAsAdminIfNeeded } from "./src/hosts.js";

function usage() {
  console.log(`roblox-revival-patcher

Usage:
  node patch.js --bin "C:\\path\\to\\RobloxPlayerBeta.exe" --patch patches\\2016.json [--hosts]

Notes:
  - Always creates a .bak next to the binary before writing
  - Reports patch offsets in hex
  - Warns if patterns are not found (client version may differ)
`);
}

function parseArgs(argv) {
  const out = { bin: null, patch: null, hosts: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bin") out.bin = argv[++i];
    else if (a === "--patch") out.patch = argv[++i];
    else if (a === "--hosts") out.hosts = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function hexOffset(n) {
  return "0x" + n.toString(16).toUpperCase();
}

function backupFile(filePath) {
  const bak = filePath + ".bak";
  fs.copyFileSync(filePath, bak);
  return bak;
}

function applyBinaryPatch(buf, patchDef) {
  if (patchDef.patchType === "nearJump") {
    console.warn(`[skip] ${patchDef.name || "nearJump"}: patchType nearJump is unsupported in this build`);
    return { applied: 0, skipped: true };
  }

  if (patchDef.findString) {
    const needle = Buffer.from(String(patchDef.findString), "utf8");
    const offsets = scanAll(buf, needle);
    if (offsets.length === 0) console.warn(`[warn] ${patchDef.name || "findString"}: pattern not found`);
    else offsets.forEach((o) => console.log(`[info] ${patchDef.name || "findString"} found at offset=${hexOffset(o)}`));
    return { applied: 0, skipped: true };
  }

  const findHex = patchDef.find;
  const replaceHex = patchDef.replace;
  if (!findHex || !replaceHex) throw new Error(`Patch "${patchDef.name || "unnamed"}" missing find/replace`);

  const find = parseHexBytes(findHex);
  const replace = parseHexBytes(replaceHex);
  if (find.length !== replace.length) {
    throw new Error(`Patch "${patchDef.name || "unnamed"}" find/replace length mismatch`);
  }

  const offsets = scanAll(buf, find);
  if (offsets.length === 0) {
    console.warn(`[warn] ${patchDef.name || "patch"}: pattern not found (client version may differ)`);
    return { applied: 0 };
  }

  const occurrences = patchDef.occurrences || "first";
  const toPatch = occurrences === "all" ? offsets : offsets.slice(0, 1);

  for (const off of toPatch) {
    replace.copy(buf, off);
    console.log(`[patch] ${patchDef.name || "patch"} applied at offset=${hexOffset(off)}`);
  }

  return { applied: toPatch.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.bin || !args.patch) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const patchPath = path.resolve(args.patch);
  const patchJson = JSON.parse(fs.readFileSync(patchPath, "utf8"));
  const def = normalizePatchFile(patchJson);

  if (args.hosts) {
    const relaunch = relaunchAsAdminIfNeeded(process.argv.slice(2));
    if (relaunch.relaunched) return;
    const r = ensureHostsEntries(def.hostsEntries || []);
    console.log(r.changed ? `[hosts] updated ${r.hostsPath}` : `[hosts] no changes needed`);
  }

  const binPath = path.resolve(args.bin);
  if (!fs.existsSync(binPath)) throw new Error(`Binary not found: ${binPath}`);

  const bak = backupFile(binPath);
  console.log(`[backup] wrote ${bak}`);

  const buf = fs.readFileSync(binPath); // Buffer

  let totalApplied = 0;
  for (const p of def.binaryPatches || []) {
    const r = applyBinaryPatch(buf, p);
    totalApplied += r.applied || 0;
  }

  fs.writeFileSync(binPath, buf);
  console.log(`[done] wrote patched binary (${totalApplied} patch(es) applied)`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});


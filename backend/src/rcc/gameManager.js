// Starts RCCService on demand and keeps one game job (port 53640) for the requested place.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../db.js";
import { openGameJob, closeJob, getAllJobs } from "./soap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RCC_DIR = process.env.RCC_DIR || path.resolve(__dirname, "..", "..", "..", "rcc");
const RCC_EXE = path.join(RCC_DIR, "RCCService.exe");
export const GAME_PORT = Number(process.env.GAMESERVER_PORT || 53640);

let current = null; // { placeId, ready, error }
let starting = null; // in-flight promise

async function soapUp() {
  try {
    await getAllJobs();
    return true;
  } catch {
    return false;
  }
}

async function ensureRcc(rcc) {
  if (await soapUp()) return;
  const st = rcc.getStatus();
  if (!st.running) {
    const r = await rcc.start({ rccExePath: RCC_EXE });
    if (!r.ok) throw new Error(`RCC start failed: ${r.error}`);
  }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await soapUp()) return;
  }
  throw new Error("RCC SOAP did not come up on 64989");
}

async function copyPlace(placeId) {
  const db = await getDb();
  const game = await db.get(`SELECT place_file_path FROM games WHERE place_id = ? LIMIT 1`, [placeId]);
  if (!game?.place_file_path) throw new Error(`No place file for place ${placeId}`);
  const src = path.isAbsolute(game.place_file_path) ? game.place_file_path : path.join(process.cwd(), game.place_file_path);
  const dstDir = path.join(RCC_DIR, "content", "places");
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, path.join(dstDir, `place_${placeId}.rbxl`));
}

async function start(rcc, placeId) {
  await ensureRcc(rcc);
  // One game port: close whatever job holds it (including a stale job for this place).
  if (current) await closeJob(`place-${current.placeId}`).catch(() => {});
  await closeJob(`place-${placeId}`).catch(() => {});
  current = { placeId, ready: false, error: null };
  await copyPlace(placeId);
  await openGameJob({ jobId: `place-${placeId}`, placeId, port: GAME_PORT });
  current.ready = true;
  console.log(`[rcc] place ${placeId} running on UDP ${GAME_PORT}`);
}

async function jobRunning(placeId) {
  try {
    return (await getAllJobs()).includes(`place-${placeId}`);
  } catch {
    return false;
  }
}

// Resolves true when a server for placeId is running; otherwise kicks off startup and resolves false.
export async function requestGameServer(rcc, placeId) {
  if (await jobRunning(placeId)) return true;
  if (!starting) {
    starting = start(rcc, placeId)
      .catch((e) => console.error("[rcc]", e.message))
      .finally(() => {
        starting = null;
      });
  }
  return false;
}

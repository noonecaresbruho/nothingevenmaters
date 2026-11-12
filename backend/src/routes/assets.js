import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup as lookupMime } from "mime-types";

import { getDb } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAssetStorageDir() {
  return path.join(__dirname, "..", "storage", "assets");
}

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

function guessMimeFromFilename(filename) {
  const guessed = lookupMime(filename);
  if (guessed) return String(guessed);
  return "application/octet-stream";
}

// Roblox requires a logged-in cookie for asset downloads. Put an ALT account's cookie in
// backend/.env as ROBLOSECURITY=... (read on every fetch, so no restart is needed).
function readRobloSecurity() {
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
    const m = /^\s*ROBLOSECURITY\s*=\s*(.+?)\s*$/m.exec(env);
    return m ? m[1].replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

// Keep traffic to Roblox low so the cookie account doesn't get flagged (the first alt was
// moderated): one request at a time, at least ROBLOX_GAP_MS apart.
const ROBLOX_GAP_MS = 500;
let robloxQueue = Promise.resolve();
function robloxFetch(url, init) {
  const run = robloxQueue.then(() => fetch(url, init));
  robloxQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, ROBLOX_GAP_MS)));
  return run;
}

// Assets Roblox refused recently; the client retries failed content, don't re-ask Roblox each time.
const REFUSED_TTL_MS = 10 * 60 * 1000;
const refused = new Map(); // assetId -> { at, status, body }
// Concurrent requests for the same id share one download.
const inflight = new Map();

function fetchAndCacheAsset(assetId) {
  const key = String(assetId);
  const r = refused.get(key);
  if (r && Date.now() - r.at < REFUSED_TTL_MS) {
    const err = new Error(`Upstream asset fetch failed: ${r.status} (cached refusal)`);
    err.upstream = r.status;
    err.upstreamBody = r.body;
    return Promise.reject(err);
  }
  if (!inflight.has(key)) {
    const p = downloadAsset(assetId).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

async function downloadAsset(assetId) {
  const url = `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(assetId)}`;
  const cookie = readRobloSecurity();
  const get = (withCookie) =>
    robloxFetch(url, {
      redirect: "follow",
      headers: withCookie ? { Cookie: `.ROBLOSECURITY=${cookie}`, "User-Agent": "Roblox/WinInet" } : {},
    });
  // Anonymous first; the cookie is only spent on assets that require a login (401).
  let resp = await get(false);
  if (resp.status === 401 && cookie) {
    await resp.text().catch(() => "");
    resp = await get(true);
    if (!resp.ok) {
      const body = await resp.clone().text().catch(() => "");
      if (/moderated/i.test(body)) console.warn(`[assets] ROBLOSECURITY account is moderated (asset ${assetId})`);
    }
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Upstream asset fetch failed: ${resp.status} ${resp.statusText}`);
    err.upstream = resp.status;
    err.upstreamBody = text.slice(0, 500);
    if (resp.status >= 400 && resp.status < 500) refused.set(String(assetId), { at: Date.now(), status: resp.status, body: err.upstreamBody });
    throw err;
  }

  const arrayBuf = await resp.arrayBuffer();
  let buf = Buffer.from(arrayBuf);
  // 2016 engine's XML reader needs CRLF line endings; binary models start with "<roblox!" and are left alone.
  if (buf.subarray(0, 8).toString("latin1").startsWith("<roblox ") ) {
    buf = Buffer.from(buf.toString("latin1").replace(/\r?\n/g, "\r\n"), "latin1");
  }
  const contentType = resp.headers.get("content-type") || null;

  const assetsDir = getAssetStorageDir();
  await ensureDir(assetsDir);

  const filePath = path.join(assetsDir, `${assetId}.bin`);
  await fs.promises.writeFile(filePath, buf);

  const db = await getDb();
  await db.run(
    `INSERT INTO assets (asset_id, path, mime_type, asset_type, updated_at)
     VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(asset_id) DO UPDATE SET path=excluded.path, mime_type=excluded.mime_type, updated_at=excluded.updated_at`,
    [String(assetId), filePath, contentType, new Date().toISOString()],
  );

  return { filePath, contentType };
}

async function getCachedAsset(assetId) {
  const db = await getDb();
  const row = await db.get(`SELECT path, mime_type FROM assets WHERE asset_id = ?`, [String(assetId)]);
  if (!row) return null;
  if (!row.path) return null;
  if (!fs.existsSync(row.path)) return null;
  return { filePath: row.path, contentType: row.mime_type || null };
}

// Local archives used when Roblox refuses an asset (e.g. audio made private in 2022).
// Files are named <assetId>.<ext>. Our own folder first, then the Kanvas launcher's archive.
const ARCHIVE_DIRS = [
  path.join(__dirname, "..", "storage", "archive"),
  "C:/Users/th0mit/Download/NEW/KanvasNightly-2026-09-04-a7f59b6 full/assets/common",
];
const archiveIndex = new Map();
for (const dir of ARCHIVE_DIRS) {
  try {
    for (const f of fs.readdirSync(dir)) {
      const id = f.split(".")[0];
      if (/^\d+$/.test(id) && !archiveIndex.has(id)) archiveIndex.set(id, path.join(dir, f));
    }
  } catch {}
}
console.log(`[assets] archive index: ${archiveIndex.size} files`);

const ARCHIVE_MIME = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mid: "audio/midi", png: "image/png", bmp: "image/bmp", dds: "image/vnd-ms.dds" };

function sendArchived(res, assetId) {
  const file = archiveIndex.get(String(assetId));
  if (!file) return false;
  const ext = path.extname(file).slice(1).toLowerCase();
  let buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).toString("latin1").startsWith("<roblox ")) {
    buf = Buffer.from(buf.toString("latin1").replace(/\r?\n/g, "\r\n"), "latin1");
  }
  res.setHeader("Content-Type", ARCHIVE_MIME[ext] || "application/octet-stream");
  res.send(buf);
  return true;
}

// Stand-ins for assets nobody can download any more (owner-only animations, copyright-removed
// audio): data/substitutes.json maps the dead id to a public one.
const SUBSTITUTES = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "substitutes.json"), "utf8"));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [k, String(v)]));
  } catch (e) {
    console.warn(`[assets] no substitutes: ${e.message}`);
    return {};
  }
})();
console.log(`[assets] substitutes: ${Object.keys(SUBSTITUTES).length}`);

export const assetsRouter = express.Router();

// Support legacy-ish URLs:
// - /asset/?id=123
// - /Asset/asset.ashx?id=123
// - /v1/asset/?id=123 (local convenience)
assetsRouter.get(["/asset/", "/Asset/asset.ashx", "/v1/asset/"], async (req, res, next) => {
  try {
    const requested = req.query.id;
    if (!requested) return res.status(400).send("Missing id");
    const assetId = SUBSTITUTES[String(requested)] || requested;

    const cached = await getCachedAsset(assetId);
    let got = cached;
    if (!got) {
      try {
        got = await fetchAndCacheAsset(assetId);
      } catch (err) {
        if (sendArchived(res, assetId)) return;
        // Roblox refused it (private, deleted, needs auth) and no archive has it.
        if (err.upstream >= 400 && err.upstream < 500) {
          console.warn(`[assets] ${assetId} unavailable: ${err.upstream} ${err.upstreamBody?.trim() || ""}`);
          return res.status(404).send("Asset unavailable");
        }
        throw err;
      }
    }
    const { filePath, contentType } = got;

    // If upstream didn't provide a content-type, try to guess.
    const mime =
      contentType ||
      (typeof req.query.filename === "string" ? guessMimeFromFilename(req.query.filename) : null) ||
      "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});


// Item pictures: /Thumbs/Asset.ashx?Width=420&Height=420&AssetID=123 (used by place GUIs).
// Fetched from Roblox's public thumbnail API (no cookie), cached as storage/thumbs/<id>.png.
const THUMB_DIR = path.join(__dirname, "..", "storage", "thumbs");
const thumbInflight = new Map();

async function downloadThumb(assetId, file) {
  const api = await robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`);
  const item = api.ok ? (await api.json()).data?.[0] : null;
  if (item?.state !== "Completed" || !item.imageUrl) return null; // Pending/Blocked: try again next time
  const img = await fetch(item.imageUrl);
  if (!img.ok) return null;
  await ensureDir(THUMB_DIR);
  await fs.promises.writeFile(file, Buffer.from(await img.arrayBuffer()));
  return file;
}

assetsRouter.get(["/Thumbs/Asset.ashx", "/thumbs/asset.ashx"], async (req, res, next) => {
  try {
    const assetId = String(req.query.AssetID || req.query.assetId || req.query.assetid || "");
    if (!/^\d+$/.test(assetId)) return res.status(400).send("Missing AssetID");
    const file = path.join(THUMB_DIR, `${assetId}.png`);
    if (!fs.existsSync(file)) {
      if (!thumbInflight.has(assetId)) thumbInflight.set(assetId, downloadThumb(assetId, file).finally(() => thumbInflight.delete(assetId)));
      const got = await thumbInflight.get(assetId).catch((e) => (console.warn(`[thumbs] ${assetId}: ${e.cause?.code || e.message}`), null));
      if (!got) return res.status(404).send("No thumbnail");
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    next(err);
  }
});

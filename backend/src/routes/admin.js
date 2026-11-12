import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb, getKv, setKv } from "../db.js";
import { requireAdmin } from "../middleware/authz.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function placesDir() {
  return path.join(__dirname, "..", "storage", "places");
}

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

export const adminRouter = express.Router();

adminRouter.get("/admin/server-status", requireAdmin, async (req, res) => {
  const rcc = req.app.locals.rcc;
  res.json({
    ok: true,
    rcc: rcc.getStatus(),
  });
});

adminRouter.get("/admin/users", requireAdmin, async (_req, res, next) => {
  try {
    const db = await getDb();
    const users = await db.all(`SELECT id, username, joined_at, is_admin FROM users ORDER BY id DESC`);
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/admin/maintenance", requireAdmin, async (_req, res, next) => {
  try {
    const enabled = (await getKv("maintenance", "0")) === "1";
    res.json({ ok: true, enabled });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/admin/maintenance", requireAdmin, async (req, res, next) => {
  try {
    const enabled = req.body?.enabled ? "1" : "0";
    await setKv("maintenance", enabled);
    res.json({ ok: true, enabled: enabled === "1" });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/admin/games", requireAdmin, async (req, res, next) => {
  try {
    const { name, description, thumbnail_asset_id, place_id } = req.body || {};
    if (!name) return res.status(400).json({ error: "Missing name" });
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO games (name, description, thumbnail_asset_id, maintenance_enabled, place_id) VALUES (?, ?, ?, 0, ?)`,
      [String(name), String(description || ""), thumbnail_asset_id ? String(thumbnail_asset_id) : null, place_id || null],
    );
    res.json({ ok: true, id: result.lastID });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch("/admin/games/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, thumbnail_asset_id, maintenance_enabled, place_id } = req.body || {};
    const db = await getDb();
    const game = await db.get(`SELECT id FROM games WHERE id = ?`, [id]);
    if (!game) return res.status(404).json({ error: "Not found" });
    await db.run(
      `UPDATE games SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        thumbnail_asset_id = COALESCE(?, thumbnail_asset_id),
        maintenance_enabled = COALESCE(?, maintenance_enabled),
        place_id = COALESCE(?, place_id)
      WHERE id = ?`,
      [
        name != null ? String(name) : null,
        description != null ? String(description) : null,
        thumbnail_asset_id != null ? String(thumbnail_asset_id) : null,
        maintenance_enabled != null ? (maintenance_enabled ? 1 : 0) : null,
        place_id != null ? Number(place_id) : null,
        id,
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/admin/games/:id/upload-place", requireAdmin, upload.single("place"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const db = await getDb();
    const game = await db.get(`SELECT id, place_id FROM games WHERE id = ?`, [id]);
    if (!game) return res.status(404).json({ error: "Not found" });

    const placeId = Number(req.body?.place_id || game.place_id || id);

    await ensureDir(placesDir());
    const filename = `place_${placeId}.rbxl`;
    const filePath = path.join(placesDir(), filename);
    await fs.promises.writeFile(filePath, req.file.buffer);

    await db.run(`UPDATE games SET place_id = ?, place_file_path = ? WHERE id = ?`, [placeId, filePath, id]);
    res.json({ ok: true, place_id: placeId });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/admin/rcc/start", requireAdmin, async (req, res) => {
  const rcc = req.app.locals.rcc;
  const { rccExePath, gameserverJsonPath } = req.body || {};
  const result = await rcc.start({ rccExePath, gameserverJsonPath });
  res.json(result);
});

adminRouter.post("/admin/rcc/stop", requireAdmin, async (req, res) => {
  const rcc = req.app.locals.rcc;
  const result = await rcc.stop();
  res.json(result);
});


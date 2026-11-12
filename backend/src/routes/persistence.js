// Roblox 2016 DataStore web API (RCC calls http://data.<base>/persistence/...).
// Values are stored as the JSON strings RCC sends, in SQLite, per place.
import express from "express";
import { getDb } from "../db.js";

export const persistenceRouter = express.Router();

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = getDb().then((db) =>
      db.exec(`CREATE TABLE IF NOT EXISTS datastore (
        place_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        target TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (place_id, type, scope, key, target)
      )`),
    );
  }
  return ready;
}

// Bodies look like "qkeys[0].scope=global&qkeys[0].target=K&qkeys[0].key=Store&value=..."
function form(req) {
  const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
  return new URLSearchParams(raw);
}

function q(req, name, def = "") {
  const v = req.query[name] ?? req.query[name.toLowerCase()];
  return typeof v === "string" ? v : def;
}

persistenceRouter.post("/persistence/getV2", async (req, res, next) => {
  try {
    await ensureTable();
    const db = await getDb();
    const placeId = Number(q(req, "placeId", "0"));
    const type = q(req, "type", "standard");
    const f = form(req);
    const data = [];
    for (let i = 0; f.has(`qkeys[${i}].key`); i++) {
      const scope = f.get(`qkeys[${i}].scope`) || "global";
      const target = f.get(`qkeys[${i}].target`) || "";
      const key = f.get(`qkeys[${i}].key`);
      const row = await db.get(
        `SELECT value FROM datastore WHERE place_id=? AND type=? AND scope=? AND key=? AND target=?`,
        [placeId, type, scope, key, target],
      );
      if (row) data.push({ Key: { Scope: scope, Target: target, Key: key }, Value: row.value });
    }
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

persistenceRouter.post("/persistence/set", async (req, res, next) => {
  try {
    await ensureTable();
    const db = await getDb();
    const f = form(req);
    const value = f.get("value") ?? "";
    await db.run(
      `INSERT INTO datastore (place_id, type, scope, key, target, value) VALUES (?,?,?,?,?,?)
       ON CONFLICT(place_id, type, scope, key, target) DO UPDATE SET value=excluded.value`,
      [Number(q(req, "placeId", "0")), q(req, "type", "standard"), q(req, "scope", "global"), q(req, "key"), q(req, "target"), value],
    );
    res.json({ data: value });
  } catch (e) {
    next(e);
  }
});

persistenceRouter.post("/persistence/increment", async (req, res, next) => {
  try {
    await ensureTable();
    const db = await getDb();
    const k = [Number(q(req, "placeId", "0")), q(req, "type", "standard"), q(req, "scope", "global"), q(req, "key"), q(req, "target")];
    const row = await db.get(`SELECT value FROM datastore WHERE place_id=? AND type=? AND scope=? AND key=? AND target=?`, k);
    const next_ = (Number(row?.value) || 0) + Number(q(req, "value", "0"));
    await db.run(
      `INSERT INTO datastore (place_id, type, scope, key, target, value) VALUES (?,?,?,?,?,?)
       ON CONFLICT(place_id, type, scope, key, target) DO UPDATE SET value=excluded.value`,
      [...k, String(next_)],
    );
    res.json({ data: next_ });
  } catch (e) {
    next(e);
  }
});

persistenceRouter.post("/persistence/remove", async (req, res, next) => {
  try {
    await ensureTable();
    const db = await getDb();
    const k = [Number(q(req, "placeId", "0")), q(req, "type", "standard"), q(req, "scope", "global"), q(req, "key"), q(req, "target")];
    const row = await db.get(`SELECT value FROM datastore WHERE place_id=? AND type=? AND scope=? AND key=? AND target=?`, k);
    await db.run(`DELETE FROM datastore WHERE place_id=? AND type=? AND scope=? AND key=? AND target=?`, k);
    res.json({ data: row ? row.value : null });
  } catch (e) {
    next(e);
  }
});

// OrderedDataStore pages, e.g. leaderboards.
persistenceRouter.post("/persistence/getSortedValues", async (req, res, next) => {
  try {
    await ensureTable();
    const db = await getDb();
    const pageSize = Math.max(1, Math.min(100, Number(q(req, "pageSize", "50"))));
    const asc = q(req, "ascending", "False").toLowerCase() === "true";
    const start = Number(q(req, "exclusiveStartKey", "1")) || 1;
    const rows = await db.all(
      `SELECT target, value FROM datastore WHERE place_id=? AND type='sorted' AND scope=? AND key=?
       ORDER BY CAST(value AS INTEGER) ${asc ? "ASC" : "DESC"} LIMIT ? OFFSET ?`,
      [Number(q(req, "placeId", "0")), q(req, "scope", "global"), q(req, "key"), pageSize + 1, start - 1],
    );
    const more = rows.length > pageSize;
    res.json({
      data: {
        Entries: rows.slice(0, pageSize).map((r) => ({ Target: r.target, Value: Number(r.value) })),
        ExclusiveStartKey: more ? String(start + pageSize) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

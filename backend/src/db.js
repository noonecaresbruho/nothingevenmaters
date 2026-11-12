import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbPromise = null;

export async function getDb() {
  if (!dbPromise) {
    const dbPath = path.join(__dirname, "storage", "revival.sqlite");
    dbPromise = open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
  }
  return dbPromise;
}

export async function initDb() {
  const db = await getDb();
  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      avatar_slots_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      thumbnail_asset_id TEXT,
      maintenance_enabled INTEGER NOT NULL DEFAULT 0,
      place_id INTEGER,
      place_file_path TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      asset_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      mime_type TEXT,
      asset_type TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const existingAdmin = await db.get(`SELECT id FROM users WHERE is_admin = 1 LIMIT 1`);
  if (!existingAdmin) {
    // Default admin: admin/admin (documented in README)
    const joinedAt = new Date().toISOString();
    const passwordHash = "sha256$" + Buffer.from("admin").toString("base64");
    await db.run(
      `INSERT INTO users (username, password_hash, joined_at, is_admin) VALUES (?, ?, ?, 1)`,
      ["admin", passwordHash, joinedAt],
    );
  }

  const maintenance = await db.get(`SELECT value FROM kv WHERE key = 'maintenance'`);
  if (!maintenance) {
    await db.run(`INSERT INTO kv (key, value) VALUES ('maintenance', '0')`);
  }
}

export async function setKv(key, value) {
  const db = await getDb();
  await db.run(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value],
  );
}

export async function getKv(key, defaultValue = null) {
  const db = await getDb();
  const row = await db.get(`SELECT value FROM kv WHERE key = ?`, [key]);
  return row ? row.value : defaultValue;
}


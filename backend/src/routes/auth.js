import express from "express";
import crypto from "node:crypto";

import { getDb } from "../db.js";

function hmacHex(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

function ticketSecret() {
  return process.env.TICKET_SECRET || "dev_ticket_secret_change_me";
}

export function makeTicket({ userId, username, timestampMs }) {
  const payload = `${userId}_${username}_${timestampMs}`;
  const sig = hmacHex(ticketSecret(), payload);
  return `${payload}_${sig}`;
}

export function verifyTicket(ticket) {
  if (typeof ticket !== "string") return { ok: false, reason: "not_string" };
  const parts = ticket.split("_");
  if (parts.length < 4) return { ok: false, reason: "bad_format" };
  const sig = parts.pop();
  const timestampMs = parts.pop();
  const username = parts.pop();
  const userId = parts.join("_");
  if (!sig || !timestampMs || !username || !userId) return { ok: false, reason: "bad_format" };
  const payload = `${userId}_${username}_${timestampMs}`;
  const expected = hmacHex(ticketSecret(), payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: "bad_sig" };
  }
  return { ok: true, userId: Number(userId), username, timestampMs: Number(timestampMs) };
}

function hashPassword(password) {
  // Lightweight placeholder hashing (kept simple for local-only use).
  // Format: sha256$base64(sha256(password))
  const digest = crypto.createHash("sha256").update(password).digest();
  return `sha256$${digest.toString("base64")}`;
}

function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== "string") return false;
  if (!passwordHash.startsWith("sha256$")) return false;
  return hashPassword(password) === passwordHash;
}

export const authRouter = express.Router();

authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

    const db = await getDb();
    const joinedAt = new Date().toISOString();
    const passwordHash = hashPassword(String(password));

    try {
      const result = await db.run(
        `INSERT INTO users (username, password_hash, joined_at, is_admin) VALUES (?, ?, ?, 0)`,
        [String(username), passwordHash, joinedAt],
      );
      res.json({ ok: true, user: { id: result.lastID, username: String(username), joined_at: joinedAt, is_admin: 0 } });
    } catch (e) {
      if (String(e?.message || "").includes("UNIQUE")) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });
    const db = await getDb();
    const user = await db.get(`SELECT id, username, password_hash, joined_at, is_admin FROM users WHERE username = ?`, [
      String(username),
    ]);
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const timestampMs = Date.now();
    const ticket = makeTicket({ userId: user.id, username: user.username, timestampMs });
    res.json({
      ok: true,
      user: { id: user.id, username: user.username, joined_at: user.joined_at, is_admin: user.is_admin },
      ticket,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/auth/me", async (req, res, next) => {
  try {
    const ticket = req.query.ticket || req.headers["x-auth-ticket"];
    const vt = verifyTicket(ticket);
    if (!vt.ok) return res.status(401).json({ ok: false, error: "Invalid ticket" });
    const db = await getDb();
    const user = await db.get(`SELECT id, username, joined_at, is_admin, avatar_slots_json FROM users WHERE id = ?`, [
      vt.userId,
    ]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
});

// Legacy-ish endpoint: /Login/Negotiate.ashx
// The exact old response varies across versions; we return a minimal JSON body and 200 OK.
authRouter.all("/Login/Negotiate.ashx", async (req, res, next) => {
  try {
    const ticket =
      req.query.suggest ||
      req.query.ticket ||
      req.body?.ticket ||
      req.headers["rbx-authentication-ticket"] ||
      req.headers["x-auth-ticket"];
    const vt = verifyTicket(ticket);
    if (!vt.ok) {
      res.status(401).send("Invalid ticket");
      return;
    }
    // 2016 client expects plain text (session cookie value), not JSON.
    res.setHeader("Content-Type", "text/plain");
    res.cookie(".ROBLOSECURITY", String(ticket), { path: "/", httpOnly: false });
    res.status(200).send(String(ticket));
  } catch (err) {
    next(err);
  }
});


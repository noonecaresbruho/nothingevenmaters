import { verifyTicket } from "../routes/auth.js";
import { getDb } from "../db.js";

export async function requireAdmin(req, res, next) {
  try {
    const ticket = req.query.ticket || req.headers["x-auth-ticket"];
    const vt = verifyTicket(ticket);
    if (!vt.ok) return res.status(401).json({ error: "Unauthorized" });

    const db = await getDb();
    const user = await db.get(`SELECT id, username, is_admin FROM users WHERE id = ?`, [vt.userId]);
    if (!user || user.is_admin !== 1) return res.status(403).json({ error: "Forbidden" });

    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}


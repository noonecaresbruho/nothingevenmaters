// Stand-ins for dead third-party game backends that old places call over HttpService.
// tools/rbxl-rewrite.mjs (run by import-place.mjs) rewrites https://<host>/ in place files to
// http://localhost/ext/<host>/, so each host gets its own prefix here.
import express from "express";
import crypto from "node:crypto";

export const extApisRouter = express.Router();
const unix = () => Math.floor(Date.now() / 1000);

// ---- MeepCity (Alexnewtron): https://alexnewtron.herokuapp.com/games/meepcity/<api>.php ----
const meep = express.Router();

// Server clock; the server script waits for this before setting ServerIsReady.
meep.all("/raw_unixtime.php", (_req, res) => res.type("text/plain").send(String(unix())));

// Instance heartbeat (every few seconds). Retried forever until it gets this JSON.
meep.all("/instance.php", (req, res) =>
  res.json({
    Unique: typeof req.query.unique === "string" && req.query.unique ? req.query.unique : crypto.randomUUID(),
    ServerTime: unix(),
    BadSounds: [],
    BannedPlayers: [],
  }),
);

// Party system: no other servers exist locally.
meep.all("/get_parties.php", (_req, res) => res.json([]));
meep.all("/update_party.php", (_req, res) => res.json({ PartyIsModerated: 0 }));

// Global shop sales counters (array of {AssetId, Sales}).
meep.all("/get_asset_sales.php", (_req, res) => res.json([]));

// Boombox music search: [] means no results.
meep.all("/search_music.php", (_req, res) => res.json([]));

// Fire-and-forget reports: errors, play time, purchases, codes, party shutdown, sales upload.
for (const api of ["report_error", "record_apt", "assetPurchased", "twitter_code_use", "kill_party", "set_asset_sales"]) {
  meep.all(`/${api}.php`, (_req, res) => res.type("text/plain").send("1"));
}

extApisRouter.use("/ext/alexnewtron.herokuapp.com/games/meepcity", meep);

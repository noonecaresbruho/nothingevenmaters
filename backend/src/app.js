import express from "express";
import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import { fileURLToPath } from "node:url";

import { permissiveCors } from "./middleware/cors.js";
import { initDb, getKv } from "./db.js";
import { createRccManager } from "./rcc/rccLauncher.js";

import { assetsRouter } from "./routes/assets.js";
import { authRouter } from "./routes/auth.js";
import { gamesRouter } from "./routes/games.js";
import { adminRouter } from "./routes/admin.js";
import { clientCompatRouter } from "./routes/clientCompat.js";
import { extApisRouter } from "./routes/extApis.js";
import { persistenceRouter } from "./routes/persistence.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

app.use(permissiveCors());

// RCC builds API URLs as http://127.0.0.1/<subdomain.><path> (patched template), e.g.
// /clientsettings.Setting/QuietGet/RCCService/ -> strip the "subdomain prefix" segment.
app.use((req, _res, next) => {
  const m = /^\/((?:clientsettings|api|versioncompatibility|assetgame|www|ecsv2|ephemeralcounters|gamepersistence|data|analytics|public|ecs|auth|avatar|friends|groups|inventory|economy|presence|users|badges|chat|games|thumbnails|develop|catalog|apis|setup|test|logging|service|counters)\.)+(.*)$/i.exec(req.url);
  if (m) req.url = "/" + m[2];
  // 2016M builds put the domain suffix there too: /.robloxlabs.com/Setting/... or /api.localhost.robloxlabs.com/...
  const m2 = /^\/([^/?]*robloxlabs\.com|\.[^/?]+)\/(.*)$/i.exec(req.url);
  if (m2) req.url = "/" + m2[2];
  next();
});
// Keep the raw body too: the 2016 DataStore API sends keys like "qkeys[0].key" that need manual parsing.
const keepRaw = (req, _res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: "10mb", verify: keepRaw }));
app.use(express.urlencoded({ extended: true, verify: keepRaw }));

app.use((req, _res, next) => {
  // Simple request log
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

await initDb();

const rcc = createRccManager();
app.locals.rcc = rcc;
app.locals.storageDir = path.join(__dirname, "storage");

app.get("/health", async (_req, res) => {
  res.json({ ok: true, maintenance: (await getKv("maintenance", "0")) === "1" });
});

// Maintenance gate for client-facing endpoints (admin still allowed)
app.use((req, res, next) => {
  const isAdminPath = req.path.startsWith("/admin");
  const isHealth = req.path === "/health";
  if (isAdminPath || isHealth) return next();
  getKv("maintenance", "0")
    .then((v) => {
      if (v === "1") {
        res.status(503).json({ error: "Maintenance mode enabled" });
        return;
      }
      next();
    })
    .catch(next);
});

app.use(assetsRouter);
app.use(persistenceRouter);
app.use(extApisRouter);
app.use(clientCompatRouter);
app.use(authRouter);
app.use(gamesRouter);
app.use(adminRouter);

// Log endpoints the legacy client asks for that we do not implement yet
app.use((req, res) => {
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).send("Not found");
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Legacy client is patched to http://localhost/ (no port), so also serve on 80.
app.listen(80, "::", () => console.log("Client endpoint listening on http://localhost/")).on("error", (e) => console.error("Port 80 listen failed:", e.message));

// RCC sends some calls over https://localhost/ (ownership/hasasset, validate-place-join).
// Cert made and trusted by tools/trust-localhost-cert.ps1.
const pfx = path.join(path.dirname(fileURLToPath(import.meta.url)), "storage", "tls", "localhost.pfx");
if (fs.existsSync(pfx)) {
  https
    .createServer({ pfx: fs.readFileSync(pfx), passphrase: "revival" }, app)
    .listen(443, "::", () => console.log("Client endpoint listening on https://localhost/"))
    .on("error", (e) => console.error("Port 443 listen failed:", e.message))
    .on("tlsClientError", (e, sock) => console.error(`[tls] ${sock.remoteAddress}: ${e.message}`));
} else {
  console.warn("No storage/tls/localhost.pfx; run tools/trust-localhost-cert.ps1 for https");
}

const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on http://localhost:${port}`);
});


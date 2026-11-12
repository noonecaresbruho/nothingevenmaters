import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const clientCompatRouter = express.Router();

function clientSettingsPath() {
  const local = path.join(__dirname, "..", "storage", "clientappsettings.json");
  if (fs.existsSync(local)) return local;
  const watfront = "C:\\watfront\\storage\\clientappsettings.json";
  if (fs.existsSync(watfront)) return watfront;
  return null;
}

// Fast-flag settings for the 2016M (0.256.0.83059) player/RCC, taken from the Kanvas launcher's
// matching build: storage/settings/<Name>.json (ClientAppSettings, RCCService, ...).
const settingsDir = path.join(__dirname, "..", "storage", "settings");
clientCompatRouter.get(["/Setting/QuietGet/:name", "/Setting/QuietGet/:name/"], (req, res, next) => {
  const f = path.join(settingsDir, `${path.basename(req.params.name)}.json`);
  if (!fs.existsSync(f)) return next();
  res.setHeader("Content-Type", "application/json");
  res.send(fs.readFileSync(f, "utf8"));
});

// versioncompatibility.api: allowed client hashes / security versions (RCC's hash check is patched anyway).
clientCompatRouter.get(["/GetAllowedMD5Hashes/", "/GetAllowedMD5Hashes"], (_req, res) => res.type("json").send(fs.readFileSync(path.join(settingsDir, "MD5Hashes.json"), "utf8")));
clientCompatRouter.get(["/GetAllowedSecurityVersions/", "/GetAllowedSecurityVersions", "/GetAllowedSecurityKeys/", "/GetAllowedSecurityKeys"], (_req, res) => res.type("json").send(fs.readFileSync(path.join(settingsDir, "SecurityVersions.json"), "utf8")));

clientCompatRouter.get("/Setting/QuietGet/ClientAppSettings/", (_req, res) => {
  const p = clientSettingsPath();
  res.setHeader("Content-Type", "application/json");
  if (p) {
    res.send(fs.readFileSync(p, "utf8"));
    return;
  }
  res.json({});
});

clientCompatRouter.get("/Setting/QuietGet/ClientSharedSettings/", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({});
});

clientCompatRouter.get(["/CharacterFetch.aspx", "/Asset/CharacterFetch.ashx"], (req, res) => {
  const userId = Number(req.query.Id || req.query.id || req.query.userId || 1);
  const base = "http://localhost";
  res.setHeader("Content-Type", "text/plain");
  res.send(`${base}/Asset/BodyColors.ashx?Id=${userId};`);
});

clientCompatRouter.get("/Asset/BodyColors.ashx", (_req, res) => {
  // Default 2016 noob colors (head/arms yellow, torso blue, legs green).
  res.setHeader("Content-Type", "application/xml");
  // The 2016 engine's XML reader needs CRLF line endings (LF -> "can't read header").
  res.send(`<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
<External>null</External>
<External>nil</External>
<Item class="BodyColors" referent="RBX0">
<Properties>
<string name="Name">Body Colors</string>
<int name="HeadColor">24</int>
<int name="LeftArmColor">24</int>
<int name="LeftLegColor">119</int>
<int name="RightArmColor">24</int>
<int name="RightLegColor">119</int>
<int name="TorsoColor">23</int>
</Properties>
</Item>
</roblox>`.replace(/\r?\n/g, "\r\n"));
});

clientCompatRouter.get("/game/LoadPlaceInfo.ashx", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("");
});

clientCompatRouter.get("/marketplace/productinfo", async (req, res, next) => {
  try {
    const assetId = Number(req.query.assetId || req.query.AssetId || 0);
    const db = await getDb();

    const game = await db.get(
      `SELECT g.id, g.name, g.description, g.place_id, u.id as creator_id, u.username as creator_name
       FROM games g
       LEFT JOIN users u ON u.is_admin = 1
       WHERE g.place_id = ? OR g.id = ?
       ORDER BY g.id DESC
       LIMIT 1`,
      [assetId, assetId],
    );

    const body = {
      TargetId: assetId,
      ProductType: "User Product",
      AssetId: assetId,
      ProductId: assetId,
      Name: game?.name || "Place",
      Description: game?.description || "",
      AssetTypeId: 9,
      Creator: {
        Id: game?.creator_id || 1,
        Name: game?.creator_name || "Revival",
        CreatorType: "User",
        CreatorTargetId: game?.creator_id || 1,
        HasVerifiedBadge: false,
      },
      IconImageAssetId: 0,
      Created: new Date().toISOString(),
      Updated: new Date().toISOString(),
      PriceInRobux: null,
      PriceInTickets: null,
      Sales: 0,
      IsNew: false,
      IsForSale: false,
      IsPublicDomain: false,
      IsLimited: false,
      IsLimitedUnique: false,
      MinimumMembershipLevel: 0,
      ContentRatingTypeId: 0,
    };

    res.setHeader("Content-Type", "application/json");
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// Legacy client startup checks (watrbx returned these as no-op successes)
clientCompatRouter.post("/game/validate-machine", (_req, res) => {
  res.json({ success: true });
});

clientCompatRouter.post("/Game/MachineConfiguration.ashx", (_req, res) => {
  res.status(200).send("");
});

clientCompatRouter.get("/", (_req, res) => {
  res.status(200).send("OK");
});

clientCompatRouter.post("/game/report-stats", (_req, res) => {
  res.status(200).send("");
});

// Game pass ownership check used by place scripts (2016 format). Nobody owns passes locally.
clientCompatRouter.get("/Game/GamePass/GamePassHandler.ashx", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send('<Value Type="boolean">false</Value>');
});

// RCC game server output -> C:\revival\logs\server.log
const serverLogPath = path.join(__dirname, "..", "..", "..", "logs", "server.log");
clientCompatRouter.all("/rcc/log", (req, res) => {
  // RCC posts as form-urlencoded, so the global parser has already split the text into keys/values; rebuild it.
  const b = req.body;
  const text = typeof req.query.m === "string" ? req.query.m : typeof b === "string" ? b : Object.entries(b || {}).map(([k, v]) => (v ? `${k}=${v}` : k)).join("&");
  // RCC url-encodes Latin-1 bytes (e.g. %E7), which Express leaves undecoded.
  let clean = text;
  if (/%[0-9A-Fa-f]{2}/.test(clean)) {
    try { clean = Buffer.from(unescape(clean), "latin1").toString("latin1"); } catch {}
  }
  const line = `${new Date().toISOString().slice(11, 19)} ${clean}
`;
  fs.mkdirSync(path.dirname(serverLogPath), { recursive: true });
  fs.appendFile(serverLogPath, line, () => {});
  res.send("");
});

// 2016M client analytics counters (ephemeralcounters.api) - accepted and ignored.
clientCompatRouter.post(["/v1.1/Counters/Increment/", "/v1.1/Counters/Increment", "/v1.0/MultiIncrement", "/v1.0/MultiIncrement/"], (_req, res) => res.json({ success: true }));

// Player:GetRankInGroup / IsInGroup / GetRoleInGroup / IsFriendsWith etc. (2016 LuaWebService format).
// Locally nobody is in any group or friends with anyone.
clientCompatRouter.get("/Game/LuaWebService/HandleSocialRequest.ashx", (req, res) => {
  const method = String(req.query.method || "").toLowerCase();
  res.setHeader("Content-Type", "text/plain");
  if (method === "getgrouprank") return res.send('<Value Type="integer">0</Value>');
  if (method === "getgrouprole") return res.send("Guest");
  return res.send('<Value Type="boolean">false</Value>');
});

clientCompatRouter.post(["/users/get-experiment-enrollments", "/users/get-studio-experiment-enrollments"], (_req, res) => res.json({}));

// MarketplaceService:PlayerOwnsAsset (RCC calls https://localhost/...). Body is "true"/"false".
// Nobody owns assets locally, same as GamePassHandler above.
clientCompatRouter.get("/ownership/hasasset", (_req, res) => res.type("text/plain").send("false"));

// RCC checks every join against this (https). All joins are allowed.
clientCompatRouter.get("/universes/validate-place-join", (_req, res) => res.type("json").send("true"));

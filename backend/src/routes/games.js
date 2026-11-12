import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { getDb } from "../db.js";
import { makeTicket, verifyTicket } from "./auth.js";
import { signJoinScriptBody } from "../joinSign.js";
import { requestGameServer } from "../rcc/gameManager.js";

export const gamesRouter = express.Router();

gamesRouter.get("/api/games", async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, name, description, thumbnail_asset_id, maintenance_enabled, place_id FROM games ORDER BY id DESC`,
    );
    res.json({ ok: true, games: rows });
  } catch (err) {
    next(err);
  }
});

gamesRouter.get("/api/games/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const row = await db.get(
      `SELECT id, name, description, thumbnail_asset_id, maintenance_enabled, place_id FROM games WHERE id = ?`,
      [Number(req.params.id)],
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, game: row });
  } catch (err) {
    next(err);
  }
});

// Legacy join script (2016 expects --rbxsig%...% + JSON)
gamesRouter.get("/Game/Join.ashx", async (req, res, next) => {
  try {
    const placeIdRaw = req.query.placeId || req.query.PlaceId || req.query.PlaceID || req.query.id;
    const placeId = placeIdRaw ? Number(placeIdRaw) : 1;

    const userId = req.query.userId ? Number(req.query.userId) : 1;
    const username = typeof req.query.username === "string" ? req.query.username : "Player";

    const serverPort = Number(process.env.GAMESERVER_PORT || 53640);
    const machineAddress = String(process.env.GAMESERVER_IP || "127.0.0.1");
    const baseUrl = "http://localhost/";
    const gameId = crypto.randomUUID();

    const db = await getDb();
    const game = await db.get(
      `SELECT g.id, g.name, g.description, g.place_id FROM games g WHERE g.place_id = ? LIMIT 1`,
      [placeId],
    );
    const creator = await db.get(`SELECT id, username FROM users WHERE id = ?`, [userId]);

    const charAppearance = `${baseUrl}CharacterFetch.aspx?Id=${userId}&placeId=${placeId}`;

    const body = {
      ClientPort: 0,
      MachineAddress: machineAddress,
      ServerPort: serverPort,
      PingUrl: "",
      PingInterval: 20,
      UserName: username,
      SeleniumTestMode: false,
      UserId: userId,
      SuperSafeChat: true,
      CharacterAppearance: charAppearance,
      ClientTicket: "",
      GameId: gameId,
      PlaceId: placeId,
      MeasurementUrl: "",
      WaitingForCharacterGuid: crypto.randomUUID(),
      BaseUrl: baseUrl,
      ChatStyle: "ClassicAndBubble",
      VendorId: 0,
      ScreenShotInfo: "",
      VideoInfo: "",
      CreatorId: creator?.id || 1,
      CreatorTypeEnum: "User",
      MembershipType: "None",
      AccountAge: 365,
      CookieStoreFirstTimePlayKey: "rbx_evt_ftp",
      CookieStoreFiveMinutePlayKey: "rbx_evt_fmp",
      CookieStoreEnabled: true,
      IsRobloxPlace: false,
      GenerateTeleportJoin: false,
      IsUnknownOrUnder13: false,
      SessionId: `${crypto.randomUUID()}|${gameId}|${userId}|127.0.0.1|8|${new Date().toISOString()}|0|null|null`,
      DataCenterId: 0,
      UniverseId: 0,
      BrowserTrackerId: 0,
      UsePortraitMode: false,
      FollowUserId: 0,
      characterAppearanceId: userId,
      PlaceName: game?.name || "Game",
      CreatorName: creator?.username || "Revival",
    };

    const json = JSON.stringify(body);
    const storageDir = req.app.locals.storageDir;
    const signed = signJoinScriptBody(json, storageDir);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(signed);
  } catch (err) {
    next(err);
  }
});

// RCCService PlaceFetchUrl points here
gamesRouter.get("/game/load-place.ashx", async (req, res, next) => {
  try {
    const placeId = Number(req.query.placeId || req.query.PlaceId || req.query.id || 1);
    const db = await getDb();
    const game = await db.get(`SELECT place_file_path FROM games WHERE place_id = ? LIMIT 1`, [placeId]);
    if (!game?.place_file_path) {
      res.status(404).send("Place not found");
      return;
    }

    const fullPath = path.isAbsolute(game.place_file_path)
      ? game.place_file_path
      : path.join(process.cwd(), game.place_file_path);

    if (!fs.existsSync(fullPath)) {
      res.status(404).send("Place file missing on disk");
      return;
    }

    res.setHeader("Content-Type", "application/xml");
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// Helper: backend can validate our HMAC ticket format if needed
gamesRouter.get("/api/validate-ticket", async (req, res) => {
  const vt = verifyTicket(req.query.ticket);
  res.json(vt);
});


// 2016 client's -j points here; it polls until status 2, then fetches joinScriptUrl.
gamesRouter.all("/Game/PlaceLauncher.ashx", async (req, res) => {
  const placeId = Number(req.query.placeId || req.query.PlaceId || 1);
  const userId = Number(req.query.userId || 1);
  const username = typeof req.query.username === "string" ? req.query.username : "Player";
  const joinScriptUrl =
    `http://localhost/Game/Join.ashx?placeId=${placeId}&userId=${userId}&username=${encodeURIComponent(username)}`;
  // Field names/order match the watrbx backend this client was built for.
  const cookie = /(?:^|;s*).ROBLOSECURITY=([^;]+)/.exec(req.headers.cookie || "");
  // Debug aid: while storage/pl_hold exists, report "waiting" so a debugger can attach.
  const hold = fs.existsSync(path.join(req.app.locals.storageDir, "pl_hold"));
  // Status 1 ("waiting") while RCC boots and opens the job; the client keeps polling.
  const ready = await requestGameServer(req.app.locals.rcc, placeId);
  res.json({
    jobid: "local",
    status: hold || !ready ? 1 : 2,
    joinScriptUrl,
    authenticationUrl: "http://localhost/Login/Negotiate.ashx",
    authenticationTicket: cookie ? decodeURIComponent(cookie[1]) : "",
    message: "",
  });
});

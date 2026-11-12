// Import a .rbxl into the revival as a new game (or replace an existing place id).
// Usage:
//   node tools/import-place.mjs "<path to .rbxl>" "<game name>" [placeId]
// Prints the place id; launch it with:  .\launch-play.ps1 -PlaceId <id>
import fs from "node:fs";
import path from "node:path";
import { initDb, getDb } from "../backend/src/db.js";
import { rewriteRbxl, DEFAULT_RULES } from "./rbxl-rewrite.mjs";

const [src, name, wantedId] = process.argv.slice(2);
if (!src || !name || !fs.existsSync(src)) {
  console.error('usage: node tools/import-place.mjs "<file.rbxl>" "<name>" [placeId]');
  process.exit(1);
}

const head = fs.readFileSync(src).subarray(0, 8).toString("latin1");
if (!head.startsWith("<roblox")) {
  console.error(`not a Roblox place file (header: ${JSON.stringify(head)})`);
  process.exit(1);
}

await initDb();
const db = await getDb();
let placeId = wantedId ? Number(wantedId) : null;
let game = placeId ? await db.get(`SELECT id FROM games WHERE place_id = ?`, [placeId]) : null;

if (!game) {
  const r = await db.run(`INSERT INTO games (name, description, maintenance_enabled, place_id) VALUES (?, ?, 0, ?)`, [
    name,
    `Imported from ${path.basename(src)}`,
    placeId,
  ]);
  game = { id: r.lastID };
  if (!placeId) placeId = r.lastID;
}

const placesDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "backend", "src", "storage", "places");
fs.mkdirSync(placesDir, { recursive: true });
const dst = path.join(placesDir, `place_${placeId}.rbxl`);
// Point dead third-party backends at the revival's stand-ins (see tools/rbxl-rewrite.mjs).
if (head.startsWith("<roblox!")) {
  const { buffer, changes } = rewriteRbxl(fs.readFileSync(src));
  fs.writeFileSync(dst, buffer);
  for (const c of changes) console.log(`rewrote dead-host URLs in ${c.count} ${c.property} value(s)`);
} else {
  let xml = fs.readFileSync(src, "latin1");
  for (const [from, to] of DEFAULT_RULES) xml = from instanceof RegExp ? xml.replace(from, to) : xml.split(from).join(to);
  fs.writeFileSync(dst, xml, "latin1");
}
await db.run(`UPDATE games SET name = ?, place_id = ?, place_file_path = ? WHERE id = ?`, [name, placeId, dst, game.id]);
console.log(`imported "${name}" as place ${placeId} (${head.startsWith("<roblox!") ? "binary" : "xml"}) -> ${dst}`);

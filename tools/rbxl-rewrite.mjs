// Rewrite URLs inside a binary .rbxl (scripts, content ids, any string property).
// Needed because RCC Lua refuses Script.Source >= 200000 chars ("String too long"),
// so big scripts (MeepCity's server script is 215k) can't be patched at load time.
//
// Usage:
//   node tools/rbxl-rewrite.mjs <in.rbxl> [out.rbxl]      (out defaults to in, rewritten in place)
// Library: import { rewriteRbxl, DEFAULT_RULES } from "./rbxl-rewrite.mjs"
//
// Only chunks whose strings change are re-encoded (as literal-only LZ4); every other chunk is
// copied byte for byte.
import fs from "node:fs";

// Dead third-party game backends -> stand-ins served by backend/src/routes/extApis.js.
const DEAD_HOSTS = ["alexnewtron.herokuapp.com"];
const BASE = "http://localhost";

// Calls to APIs newer than our 2016 engine. Places from 2017 retry them forever when they error.
const COMPAT_RULES = [
  // Chat:CanUserChatAsync(userId) (2017) -> chat always allowed
  [/game:GetService\(\s*"Chat"\s*\):CanUserChatAsync\(\s*[^()]*\)/g, "true"],
  // game:BindToClose(fn) is missing in this build -> call a no-op with the same args
  [/\b[Gg]ame:BindToClose\(/g, "(function() end)("],
  // MM2 Sync.SyncMaps: maps that can't be downloaded (private) threw and killed the round loop.
  // Drop them from the map list (so voting never picks them) and insert a dummy model instead.
  [
    'local NewMap = game.InsertService:LoadAsset(MapData["MapID"]);',
    'local _ok, NewMap = pcall(function() return game.InsertService:LoadAsset(MapData["MapID"]) end); ' +
      'if not _ok then print("[revival] map unavailable: " .. MapName); Sync.Data["Map"][MapName] = nil; ' +
      'NewMap = Instance.new("Model"); Instance.new("Model", NewMap).Name = MapName end;',
  ],
  // Fonts added in 2017
  [/Enum\.Font\.Cartoon\b/g, "Enum.Font.SourceSansBold"],
];

// [from, to]: from is a plain string or a /g RegExp.
export const DEFAULT_RULES = [
  ...DEAD_HOSTS.flatMap((host) =>
    ["https://", "http://"].map((scheme) => [scheme + host + "/", `${BASE}/ext/${host}/`]),
  ),
  ...COMPAT_RULES,
];

const MAGIC = Buffer.from("<roblox!\x89\xff\r\n\x1a\n", "latin1");
const TYPE_STRING = 0x01; // String, ProtectedString (Source) and Content all use type 1

function lz4Decode(src, outLen) {
  const out = Buffer.alloc(outLen);
  let i = 0;
  let o = 0;
  while (i < src.length) {
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) {
      let b;
      do lit += b = src[i++];
      while (b === 255);
    }
    src.copy(out, o, i, i + lit);
    i += lit;
    o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let len = token & 15;
    if (len === 15) {
      let b;
      do len += b = src[i++];
      while (b === 255);
    }
    len += 4;
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  if (o !== outLen) throw new Error(`lz4: got ${o} bytes, expected ${outLen}`);
  return out;
}

// Valid LZ4 block made of one literal-only sequence (no compression, but every reader accepts it).
function lz4EncodeLiteral(data) {
  const parts = [];
  let n = data.length;
  parts.push(Buffer.from([Math.min(n, 15) << 4]));
  if (n >= 15) {
    n -= 15;
    const ext = [];
    while (n >= 255) {
      ext.push(255);
      n -= 255;
    }
    ext.push(n);
    parts.push(Buffer.from(ext));
  }
  parts.push(data);
  return Buffer.concat(parts);
}

function readChunks(buf) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not a binary .rbxl (<roblox! header)");
  const chunks = [];
  let p = 32;
  while (p < buf.length) {
    const name = buf.toString("latin1", p, p + 4);
    const clen = buf.readUInt32LE(p + 4);
    const ulen = buf.readUInt32LE(p + 8);
    const start = p + 16;
    const end = start + (clen || ulen);
    chunks.push({ name, raw: buf.subarray(p, end), clen, ulen, body: buf.subarray(start, end) });
    p = end;
    if (name === "END\0") break;
  }
  return { header: buf.subarray(0, 32), chunks, tail: buf.subarray(p) };
}

function chunkData(c) {
  if (c.clen === 0) return c.body;
  if (c.body.readUInt32LE(0) === 0xfd2fb528) throw new Error(`${c.name.trim()} chunk is zstd-compressed (newer file), unsupported`);
  return lz4Decode(c.body, c.ulen);
}

function rewriteString(s, rules) {
  let out = s;
  for (const [from, to] of rules) out = from instanceof RegExp ? out.replace(from, to) : out.split(from).join(to);
  return out;
}

// Returns { buffer, changes: [{ property, count }] }.
export function rewriteRbxl(buf, rules = DEFAULT_RULES) {
  const { header, chunks, tail } = readChunks(buf);
  const changes = [];
  const out = [header];
  for (const c of chunks) {
    if (c.name !== "PROP") {
      out.push(c.raw);
      continue;
    }
    const data = chunkData(c);
    const nameLen = data.readUInt32LE(4);
    const typeAt = 8 + nameLen;
    if (data[typeAt] !== TYPE_STRING) {
      out.push(c.raw);
      continue;
    }
    const prop = data.toString("latin1", 8, typeAt);
    const strings = [];
    let count = 0;
    for (let p = typeAt + 1; p < data.length; ) {
      const len = data.readUInt32LE(p);
      const s = data.toString("latin1", p + 4, p + 4 + len); // latin1 = byte-exact round trip
      const r = rewriteString(s, rules);
      if (r !== s) count++;
      strings.push(r);
      p += 4 + len;
    }
    if (!count) {
      out.push(c.raw);
      continue;
    }
    changes.push({ property: prop, count });
    const parts = [data.subarray(0, typeAt + 1)];
    for (const s of strings) {
      const b = Buffer.from(s, "latin1");
      const len = Buffer.alloc(4);
      len.writeUInt32LE(b.length);
      parts.push(len, b);
    }
    const newData = Buffer.concat(parts);
    const body = lz4EncodeLiteral(newData);
    const head = Buffer.alloc(16);
    head.write("PROP", 0, "latin1");
    head.writeUInt32LE(body.length, 4);
    head.writeUInt32LE(newData.length, 8);
    out.push(head, body);
  }
  out.push(tail);
  return { buffer: Buffer.concat(out), changes };
}

// Count rule matches left in a file (for verification).
export function countMatches(buf, needles) {
  const { chunks } = readChunks(buf);
  let n = 0;
  for (const c of chunks) {
    if (c.name !== "PROP") continue;
    const s = chunkData(c).toString("latin1");
    for (const needle of needles) n += needle instanceof RegExp ? (s.match(needle) || []).length : s.split(needle).length - 1;
  }
  return n;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const [src, dst = src] = process.argv.slice(2);
  if (!src) {
    console.error("usage: node tools/rbxl-rewrite.mjs <in.rbxl> [out.rbxl]");
    process.exit(1);
  }
  const { buffer, changes } = rewriteRbxl(fs.readFileSync(src));
  if (!changes.length) {
    console.log("no dead-host URLs found, file unchanged");
  } else {
    fs.writeFileSync(dst, buffer);
    for (const c of changes) console.log(`  ${c.property}: ${c.count} value(s)`);
    console.log(`rewrote -> ${dst}`);
  }
}

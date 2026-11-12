// Tiny SOAP client for 2016 RCCService (namespace http://roblox.com/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RCC_URL = process.env.RCC_SOAP_URL || "http://127.0.0.1:64989";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function luaValue(v) {
  const type = typeof v === "number" ? "LUA_TNUMBER" : typeof v === "boolean" ? "LUA_TBOOLEAN" : "LUA_TSTRING";
  return `<ns1:LuaValue><ns1:type>${type}</ns1:type><ns1:value>${esc(v)}</ns1:value></ns1:LuaValue>`;
}

async function call(action, body) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://roblox.com/">
<SOAP-ENV:Body><ns1:${action}>${body}</ns1:${action}></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
  const res = await fetch(RCC_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `http://roblox.com/${action}` },
    body: xml,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RCC ${action} HTTP ${res.status}: ${text.replace(/<[^>]+>/g, " ").slice(0, 1500)}`);
  return text;
}

export async function openGameJob({ jobId, placeId, port, baseUrl = "http://localhost", expiration = 86400 }) {
  const script = fs.readFileSync(path.join(__dirname, "gameserver.lua"), "utf8");
  const body =
    `<ns1:job><ns1:id>${esc(jobId)}</ns1:id><ns1:expirationInSeconds>${expiration}</ns1:expirationInSeconds>` +
    `<ns1:category>0</ns1:category><ns1:cores>1</ns1:cores></ns1:job>` +
    `<ns1:script><ns1:name>GameServer</ns1:name><ns1:script>${esc(script)}</ns1:script>` +
    `<ns1:arguments>${[placeId, port, baseUrl].map(luaValue).join("")}</ns1:arguments></ns1:script>`;
  return call("OpenJobEx", body);
}

export async function execute(jobId, script) {
  const body =
    `<ns1:jobID>${esc(jobId)}</ns1:jobID><ns1:script><ns1:name>Exec</ns1:name><ns1:script>${esc(script)}</ns1:script><ns1:arguments></ns1:arguments></ns1:script>`;
  return call("ExecuteEx", body);
}

export async function getAllJobs() {
  return call("GetAllJobsEx", "");
}

export async function closeJob(jobId) {
  return call("CloseJob", `<ns1:jobID>${esc(jobId)}</ns1:jobID>`);
}

// CLI: node src/rcc/soap.js <placeId> [port]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const placeId = Number(process.argv[2] || 1);
  const port = Number(process.argv[3] || 53640);
  openGameJob({ jobId: `place-${placeId}`, placeId, port })
    .then((r) => console.log(r))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

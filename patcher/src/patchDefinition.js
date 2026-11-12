export function parseHexBytes(hex) {
  if (typeof hex !== "string") throw new Error("hex string required");
  const clean = hex
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const bytes = clean.map((b) => {
    const v = Number.parseInt(b, 16);
    if (!Number.isFinite(v) || v < 0 || v > 255) throw new Error(`Invalid byte: ${b}`);
    return v;
  });
  return Buffer.from(bytes);
}

export function normalizePatchFile(json) {
  if (!json || typeof json !== "object") throw new Error("Invalid patch JSON");
  if (!Array.isArray(json.binaryPatches)) json.binaryPatches = [];
  if (!Array.isArray(json.hostsEntries)) json.hostsEntries = [];
  return json;
}


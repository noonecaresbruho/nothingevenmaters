import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function getHostsPath() {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    return path.join(systemRoot, "System32", "drivers", "etc", "hosts");
  }
  return "/etc/hosts";
}

export function isAdminWindows() {
  if (process.platform !== "win32") return true;
  try {
    // NET SESSION requires admin; exit code 0 indicates elevated.
    const r = spawnSync("net", ["session"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function relaunchAsAdminIfNeeded(argv = process.argv.slice(2)) {
  if (process.platform !== "win32") return { relaunched: false };
  if (isAdminWindows()) return { relaunched: false };

  const node = process.execPath;
  const script = path.resolve(process.argv[1]);
  const args = [script, ...argv].map((a) => String(a).replace(/"/g, '\\"'));
  const ps = `Start-Process -FilePath "${node}" -ArgumentList "${args.join(" ")}" -Verb RunAs`;

  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    stdio: "inherit",
  });
  return { relaunched: r.status === 0 };
}

export function ensureHostsEntries(entries) {
  const hostsPath = getHostsPath();
  const original = fs.readFileSync(hostsPath, "utf8");
  const lines = original.split(/\r?\n/);

  const normalized = new Set(
    lines
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith("#")),
  );

  let changed = false;
  for (const entry of entries) {
    const e = String(entry).trim();
    if (!e) continue;
    if (!normalized.has(e)) {
      lines.push(e);
      changed = true;
    }
  }

  if (!changed) return { changed: false, hostsPath };

  const tmp = path.join(os.tmpdir(), `hosts_${Date.now()}.tmp`);
  fs.writeFileSync(tmp, lines.join("\r\n"), "utf8");
  fs.copyFileSync(hostsPath, hostsPath + ".bak");
  fs.copyFileSync(tmp, hostsPath);
  fs.unlinkSync(tmp);

  return { changed: true, hostsPath };
}


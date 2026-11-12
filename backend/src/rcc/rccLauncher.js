import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function makeRingBuffer(maxLines = 3000) {
  const lines = [];
  return {
    push(line) {
      lines.push(line);
      while (lines.length > maxLines) lines.shift();
    },
    toArray() {
      return [...lines];
    },
  };
}

export function createRccManager() {
  let child = null;
  let startedAt = null;
  const out = makeRingBuffer();

  function attach(childProc) {
    childProc.stdout?.on("data", (chunk) => {
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((l) => out.push(`[stdout] ${l}`));
    });
    childProc.stderr?.on("data", (chunk) => {
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((l) => out.push(`[stderr] ${l}`));
    });
    childProc.on("exit", (code, signal) => {
      out.push(`[exit] code=${code} signal=${signal || ""}`.trim());
      child = null;
    });
  }

  return {
    getStatus() {
      return {
        running: Boolean(child),
        pid: child?.pid || null,
        startedAt,
        tail: out.toArray().slice(-200),
      };
    },

    async start({ rccExePath, gameserverJsonPath }) {
      if (child) return { ok: false, error: "RCC already running", status: this.getStatus() };
      if (!rccExePath || !fs.existsSync(rccExePath)) return { ok: false, error: "Invalid rccExePath" };

      const exeDir = path.dirname(rccExePath);
      startedAt = new Date().toISOString();
      out.push(`[start] ${startedAt}`);

      // Common invocation patterns vary a lot by RCC build; keep it minimal and configurable.
      // Users can adjust their RCC build/args later; we primarily manage the process + logs.
      // 2016 RCC: SOAP server on 64989; game jobs are opened via OpenJobEx (see soap.js / gameManager.js).
      const args = ["-Console", "-Port", "64989"];

      child = spawn(rccExePath, args, {
        cwd: exeDir,
        windowsHide: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      attach(child);
      return { ok: true, status: this.getStatus(), args };
    },

    async stop() {
      if (!child) return { ok: true, stopped: false, status: this.getStatus() };
      const pid = child.pid;
      child.kill();
      out.push(`[stop] sent kill pid=${pid}`);
      child = null;
      return { ok: true, stopped: true, pid };
    },
  };
}


import { spawn } from "node:child_process";
import { join } from "node:path";

const children = [];
const ports = [5173, Number(process.env.COURTLENS_API_PORT ?? 8787)];

function freePort(port) {
  return new Promise((resolve) => {
    const lookup = spawn("lsof", ["-ti", `tcp:${port}`], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    lookup.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    lookup.on("close", () => {
      const pids = output
        .split(/\s+/)
        .map((pid) => Number(pid))
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);

      if (!pids.length) {
        resolve();
        return;
      }

      const killer = spawn("kill", pids.map(String), {
        cwd: process.cwd(),
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    lookup.on("error", () => resolve());
  });
}

function run(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      shutdown(code);
    }
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const port of ports) {
  await freePort(port);
}

run("AI proxy", process.execPath, [join(process.cwd(), "server/gemini.mjs")]);
run("Vite", process.execPath, [join(process.cwd(), "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"]);

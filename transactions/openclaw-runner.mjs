/**
 * Default OpenClaw browser runner used by the Runtime.
 * Agents do not pass this — resolved internally.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const openclawMjs = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

/**
 * @param {string[]} args openclaw CLI args (e.g. ["browser","snapshot",...])
 * @returns {Promise<{ code: number|null, out: string, err: string, ms: number }>}
 */
export function createOpenClawRunner() {
  return function run(args) {
    const started = Date.now();
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [openclawMjs, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        cwd: root,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("exit", (code) =>
        resolve({ code, out, err, ms: Date.now() - started })
      );
    });
  };
}

export const defaultRun = createOpenClawRunner();

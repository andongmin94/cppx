import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const packageRoot = path.resolve(scriptsDir, "..");
const args = process.argv.slice(2);
const cliPath = path.join(packageRoot, "node_modules", "electron-vite", "bin", "electron-vite.js");
const env = {
  ...process.env
};

delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(process.execPath, [cliPath, ...args], {
  cwd: packageRoot,
  env,
  stdio: "inherit"
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
}

process.exit(1);

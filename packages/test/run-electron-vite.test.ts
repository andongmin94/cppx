import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

test("run-electron-vite wrapper can invoke the electron-vite CLI on Windows", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const wrapperPath = path.join(packageRoot, "scripts", "run-electron-vite.mjs");
  const result = spawnSync(
    process.execPath,
    [wrapperPath, "--version"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      encoding: "utf-8"
    }
  );

  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /\d+\.\d+\.\d+/);
});

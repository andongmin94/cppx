import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { getHostAdapter } from "../src/main/cppx/platform";
import { getToolRoot, upsertToolRecord } from "../src/main/cppx/paths";
import {
  createTempDir,
  removeDir,
  withHostDataRoot,
  writeExecutable
} from "./support/helpers";

function createHostDataEnv(root: string): NodeJS.ProcessEnv {
  if (process.platform === "win32") {
    return { LOCALAPPDATA: root };
  }

  if (process.platform === "darwin") {
    return { HOME: root };
  }

  return { XDG_DATA_HOME: root };
}

function runStatusCli(
  workspace: string,
  env: NodeJS.ProcessEnv
): ReturnType<typeof spawnSync> {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const cliPath = path.join(packageRoot, "src", "main", "cli.ts");
  return spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, "status", workspace],
    {
      cwd: packageRoot,
      env,
      encoding: "utf-8"
    }
  );
}

function asText(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value) {
    return "";
  }
  return value.toString("utf-8");
}

test("status prints managed provenance and ownership details for ready tools", async () => {
  const workspace = await createTempDir("status-managed-workspace");
  const hostRoot = await createTempDir("status-managed-host");
  const hostAdapter = getHostAdapter();

  try {
    await withHostDataRoot(hostRoot, async () => {
      const cmake = path.join(getToolRoot("cmake"), "bin", hostAdapter.getExecutableName("cmake"));
      await writeExecutable(cmake);

      await upsertToolRecord({
        name: "cmake",
        executable: cmake,
        root: getToolRoot("cmake"),
        version: "3.30.5",
        installedAt: "2026-03-25T00:00:00.000Z",
        mode: "managed",
        sourceKind: "catalog-archive",
        requestedVersion: "default",
        resolvedVersion: "3.30.5",
        provider: "archive",
        ownership: "cppx",
        verifiedSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      });

      const result = runStatusCli(workspace, {
        ...process.env,
        ...createHostDataEnv(hostRoot)
      });

      const stdout = asText(result.stdout);
      const stderr = asText(result.stderr);
      assert.equal(result.status, 0, stderr || stdout);
      assert.match(stdout, /cmake: ready \(managed, archive, cppx-owned, 3\.30\.5, catalog-archive/i);
      assert.match(stdout, /sha256:0123456789ab/i);
      assert.match(stdout, /workspace:/);
    });
  } finally {
    await removeDir(workspace);
    await removeDir(hostRoot);
  }
});

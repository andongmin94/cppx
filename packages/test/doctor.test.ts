import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { defaultProjectConfig, writeProjectConfigToml } from "../src/main/cppx/config";
import { getHostAdapter } from "../src/main/cppx/platform";
import {
  createTempDir,
  removeDir,
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

function runDoctorCli(
  workspace: string,
  env: NodeJS.ProcessEnv
): ReturnType<typeof spawnSync> {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const cliPath = path.join(packageRoot, "src", "main", "cli.ts");
  return spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, "doctor", workspace],
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

test("doctor exits 1 and reports blockers when required tools are missing", async () => {
  const workspace = await createTempDir("doctor-missing");
  const hostRoot = await createTempDir("doctor-missing-host");

  try {
    const config = defaultProjectConfig("doctor-missing");
    config.dependencyBackend = "none";
    config.tools.cmake.mode = "system";
    config.tools.ninja.mode = "system";
    config.tools.vcpkg.mode = "system";
    config.tools.cxx.mode = "system";
    config.tools.cxx.preferredFamily = "mingw";
    await writeProjectConfigToml(workspace, config);

    const env = {
      ...process.env,
      ...createHostDataEnv(hostRoot),
      PATH: process.platform === "win32" ? "" : "/tmp/nowhere"
    };

    const result = runDoctorCli(workspace, env);

    const stdout = asText(result.stdout);
    const stderr = asText(result.stderr);
    assert.equal(result.status, 1, stderr || stdout);
    assert.match(stdout, /\[BLOCKER\] cmake:/);
    assert.match(stdout, /summary: blockers=/);
    assert.match(stdout, /dependency_backend = "none"이라서 cppx add를 사용할 수 없습니다/);
  } finally {
    await removeDir(workspace);
    await removeDir(hostRoot);
  }
});

test("doctor exits 0 with actionable warnings when system tools are available", async () => {
  const workspace = await createTempDir("doctor-ready");
  const hostRoot = await createTempDir("doctor-ready-host");
  const toolRoot = await createTempDir("doctor-path-tools");
  const hostAdapter = getHostAdapter();

  try {
    const config = defaultProjectConfig("doctor-ready");
    config.dependencyBackend = "none";
    config.tools.cmake.mode = "system";
    config.tools.ninja.mode = "system";
    config.tools.vcpkg.mode = "system";
    config.tools.cxx.mode = "system";
    config.tools.cxx.preferredFamily = "mingw";
    await writeProjectConfigToml(workspace, config);

    const cmake = path.join(toolRoot, hostAdapter.getExecutableName("cmake"));
    const ctest = path.join(toolRoot, hostAdapter.getCtestExecutableName());
    const cpack = path.join(toolRoot, hostAdapter.getCpackExecutableName());
    const ninja = path.join(toolRoot, hostAdapter.getExecutableName("ninja"));
    const cxx = path.join(toolRoot, hostAdapter.getExecutableName("clang++"));

    await writeExecutable(cmake);
    await writeExecutable(ctest);
    await writeExecutable(cpack);
    await writeExecutable(ninja);
    await writeExecutable(cxx);

    const env = {
      ...process.env,
      ...createHostDataEnv(hostRoot),
      PATH: `${toolRoot}${hostAdapter.getPathSeparator()}${process.env.PATH ?? ""}`
    };

    const result = runDoctorCli(workspace, env);

    const stdout = asText(result.stdout);
    const stderr = asText(result.stderr);
    assert.equal(result.status, 0, stderr || stdout);
    assert.match(stdout, /\[OK\] cmake:/);
    assert.match(stdout, /\[OK\] ninja:/);
    assert.match(stdout, /\[OK\] cxx:/);
    assert.match(stdout, /\[WARN\] add:/);
    assert.match(stdout, /summary: blockers=0/);
  } finally {
    await removeDir(workspace);
    await removeDir(hostRoot);
    await removeDir(toolRoot);
  }
});

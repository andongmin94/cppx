import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { getDefaultPresetName } from "../src/main/cppx/config";
import { packagePreset, runPresetBinary, testPreset, initProject } from "../src/main/cppx/project";
import { CppxError } from "../src/main/cppx/errors";
import { getHostAdapter } from "../src/main/cppx/platform";
import { createTempDir, createToolchain, createLogger, removeDir } from "./support/helpers";

test("runPresetBinary uses the active host binary path", async () => {
  const workspace = await createTempDir("run-paths");
  const toolchain = createToolchain();
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();
  const defaultPreset = getDefaultPresetName();

  try {
    await initProject(workspace, "runner-app", toolchain, logger);

    await assert.rejects(
      () => runPresetBinary(workspace, defaultPreset, toolchain, logger),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(
          error.message,
          new RegExp(
            path
              .join(workspace, "build", defaultPreset, hostAdapter.getBinaryName("runner-app"))
              .replace(/\\/g, "\\\\")
          )
        );
        return true;
      }
    );
  } finally {
    await removeDir(workspace);
  }
});

test("testPreset requires ctest.exe next to cmake.exe", async () => {
  const workspace = await createTempDir("test-paths");
  const toolchain = createToolchain();
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();
  const defaultPreset = getDefaultPresetName();

  try {
    await initProject(workspace, "tester-app", toolchain, logger);

    await assert.rejects(
      () => testPreset(workspace, defaultPreset, toolchain, logger),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, new RegExp(hostAdapter.getCtestExecutableName().replace(/\+/g, "\\+")));
        return true;
      }
    );
  } finally {
    await removeDir(workspace);
  }
});

test("packagePreset requires cpack.exe next to cmake.exe", async () => {
  const workspace = await createTempDir("pack-paths");
  const toolchain = createToolchain();
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();
  const defaultPreset = getDefaultPresetName();

  try {
    await initProject(workspace, "packer-app", toolchain, logger);

    await assert.rejects(
      () => packagePreset(workspace, defaultPreset, toolchain, logger),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, new RegExp(hostAdapter.getCpackExecutableName().replace(/\+/g, "\\+")));
        return true;
      }
    );
  } finally {
    await removeDir(workspace);
  }
});

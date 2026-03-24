import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { resolveToolchainOrThrow } from "../src/main/cppx/installers";
import { CppxLogger } from "../src/main/cppx/logger";
import {
  buildWithPreset,
  initProject,
  loadProjectConfig,
  packagePreset,
  runPresetBinary,
  saveProjectConfig,
  testPreset
} from "../src/main/cppx/project";

function createLogger(): CppxLogger {
  return new CppxLogger((entry) => {
    if (entry.level === "stderr" || entry.level === "error") {
      console.error(`[${entry.action}] ${entry.message}`);
      return;
    }

    if (entry.level === "success") {
      console.log(`[${entry.action}] ${entry.message}`);
    }
  });
}

async function main(): Promise<void> {
  const logger = createLogger();
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cppx-smoke-"));
  const usesManagedBuildTools = process.platform === "win32";
  const initDependencyBackend = process.platform === "win32" ? "vcpkg" : "none";
  const toolPolicy =
    usesManagedBuildTools
      ? { mode: "managed" as const, version: "default" }
      : { mode: "system" as const, version: "latest" };
  const cxxPolicy =
    process.platform === "win32"
      ? { mode: "system" as const, version: "latest", preferredFamily: "msvc" as const }
      : { mode: "system" as const, version: "latest", preferredFamily: "mingw" as const };

  try {
    const toolchain = await resolveToolchainOrThrow(
      logger,
      {
        cmake: toolPolicy,
        ninja: toolPolicy,
        vcpkg: toolPolicy,
        cxx: cxxPolicy
      },
      initDependencyBackend
    );

    await initProject(workspace, "smoke-app", toolchain, logger);

    const current = await loadProjectConfig(workspace);
    const updated = await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend: "none",
      tools: {
        cmake: toolPolicy,
        ninja: toolPolicy,
        vcpkg: toolPolicy,
        cxx: cxxPolicy
      }
    });
    const activeToolchain = await resolveToolchainOrThrow(
      logger,
      updated.tools,
      updated.dependencyBackend
    );

    await buildWithPreset(workspace, updated.defaultPreset, activeToolchain, logger);
    await runPresetBinary(workspace, updated.defaultPreset, activeToolchain, logger);
    await testPreset(workspace, updated.defaultPreset, activeToolchain, logger);
    await packagePreset(workspace, updated.defaultPreset, activeToolchain, logger);

    console.log(`Smoke success: ${workspace}`);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

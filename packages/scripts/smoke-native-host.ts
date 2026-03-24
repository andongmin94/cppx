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
  const cxxPolicy =
    process.platform === "win32"
      ? { mode: "system" as const, version: "latest", preferredFamily: "msvc" as const }
      : { mode: "system" as const, version: "latest", preferredFamily: "mingw" as const };

  try {
    const toolchain = await resolveToolchainOrThrow(
      logger,
      {
        cmake: { mode: "system", version: "latest" },
        ninja: { mode: "system", version: "latest" },
        vcpkg: { mode: "system", version: "latest" },
        cxx: cxxPolicy
      },
      "none"
    );

    await initProject(workspace, "smoke-app", toolchain, logger);

    const current = await loadProjectConfig(workspace);
    const updated = await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend: "none",
      tools: {
        cmake: { mode: "system", version: "latest" },
        ninja: { mode: "system", version: "latest" },
        vcpkg: { mode: "system", version: "latest" },
        cxx: cxxPolicy
      }
    });

    await buildWithPreset(workspace, updated.defaultPreset, toolchain, logger);
    await runPresetBinary(workspace, updated.defaultPreset, toolchain, logger);
    await testPreset(workspace, updated.defaultPreset, toolchain, logger);
    await packagePreset(workspace, updated.defaultPreset, toolchain, logger);

    console.log(`Smoke success: ${workspace}`);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

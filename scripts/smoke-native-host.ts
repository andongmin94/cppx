import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { installAllTools, resolveToolchainOrThrow } from "../src/main/cppx/installers";
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

function createInitToolchain(
  workspace: string,
  toolchain: Awaited<ReturnType<typeof resolveToolchainOrThrow>>
) {
  if (process.platform !== "win32" || toolchain.vcpkg) {
    return toolchain;
  }

  return {
    ...toolchain,
    // initProject may still need a temporary vcpkg handle on Windows
    // before this smoke script immediately rewrites the config to dependency_backend = "none".
    vcpkg: path.join(workspace, ".cppx", "bootstrap", "vcpkg.exe")
  };
}

function getSmokeBackend(): "vcpkg" | "conan" | "none" {
  const raw = (process.env.CPPX_SMOKE_BACKEND ?? "none").trim().toLowerCase();
  return raw === "vcpkg" || raw === "conan" ? raw : "none";
}

function getSmokeToolMode(): "managed" | "system" {
  return (process.env.CPPX_SMOKE_TOOL_MODE ?? "").trim().toLowerCase() === "managed"
    ? "managed"
    : "system";
}

function getSmokeCxxMode(toolMode: "managed" | "system"): "managed" | "system" {
  const raw = (process.env.CPPX_SMOKE_CXX_MODE ?? "").trim().toLowerCase();
  if (raw === "managed" || raw === "system") {
    return raw;
  }
  return toolMode;
}

function getSmokeVersion(
  tool: "cmake" | "ninja" | "vcpkg" | "conan" | "cxx",
  fallback: string
): string {
  const envKey = `CPPX_SMOKE_${tool.toUpperCase()}_VERSION`;
  const raw = process.env[envKey]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

async function main(): Promise<void> {
  const logger = createLogger();
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cppx-smoke-"));
  const dependencyBackend = getSmokeBackend();
  const toolMode = getSmokeToolMode();
  const cxxMode = getSmokeCxxMode(toolMode);
  const cmakePolicy = {
    mode: toolMode,
    version: getSmokeVersion("cmake", toolMode === "managed" ? "default" : "latest")
  } as const;
  const ninjaPolicy = {
    mode: toolMode,
    version: getSmokeVersion("ninja", toolMode === "managed" ? "default" : "latest")
  } as const;
  const vcpkgPolicy = {
    mode: toolMode,
    version: getSmokeVersion("vcpkg", toolMode === "managed" ? "default" : "latest")
  } as const;
  const conanPolicy = {
    mode: toolMode,
    version: getSmokeVersion("conan", toolMode === "managed" ? "default" : "latest")
  } as const;
  const cxxPolicy =
    process.platform === "win32"
      ? cxxMode === "managed"
        ? {
            mode: "managed" as const,
            version: getSmokeVersion("cxx", "latest"),
            preferredFamily: "mingw" as const
          }
        : {
            mode: "system" as const,
            version: getSmokeVersion("cxx", "latest"),
            preferredFamily: "msvc" as const
          }
      : {
          mode: cxxMode,
          version: getSmokeVersion("cxx", "latest"),
          preferredFamily: "clang" as const
        };
  const toolPolicies = {
    cmake: cmakePolicy,
    ninja: ninjaPolicy,
    vcpkg: vcpkgPolicy,
    conan: conanPolicy,
    cxx: cxxPolicy
  };

  console.log(
    `Smoke config: backend=${dependencyBackend}, toolMode=${toolMode}, cxxMode=${cxxMode}, ` +
      `cmake=${toolPolicies.cmake.version}, ninja=${toolPolicies.ninja.version}, ` +
      `vcpkg=${toolPolicies.vcpkg.version}, conan=${toolPolicies.conan.version}, cxx=${toolPolicies.cxx.version}`
  );

  try {
    const toolchain =
      toolMode === "managed"
        ? await installAllTools(logger, toolPolicies, dependencyBackend)
        : await resolveToolchainOrThrow(logger, toolPolicies, dependencyBackend);
    const initToolchain = createInitToolchain(workspace, toolchain);

    await initProject(workspace, "smoke-app", initToolchain, logger);

    const current = await loadProjectConfig(workspace);
    const updated = await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend,
      tools: {
        ...toolPolicies
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

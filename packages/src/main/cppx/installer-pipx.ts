import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { runSpawn } from "./command-runner";
import { DEFAULT_TOOL_VERSION_TOKEN } from "./tool-catalog";
import { CppxError } from "./errors";
import { ensureDir, pathExists } from "./fs-utils";
import { isPathManagedByPipx } from "./host-support";
import { ensureAptPackageIndex, runAptCommand } from "./installer-apt";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import { getToolRoot, readToolManifest, upsertToolRecord } from "./paths";
import type { ToolPolicy } from "./types";

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

interface PipxManagedLayout {
  homeDir: string;
  binDir: string;
  executable: string;
}

export interface ResolvedPipxToolExecutable {
  executable: string;
  root: string;
  version: string;
  provider: "pipx";
}

export interface PipxInstallResult {
  name: "conan";
  executable: string;
  root: string;
  version: string;
  mode: "managed";
  sourceKind: "pipx-managed";
  requestedVersion: string;
  resolvedVersion: string;
  provider: "pipx";
  ownership: "cppx" | "external";
}

function getHostArchLabel(): string {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
}

function isPinnedToolVersion(version: string): boolean {
  const normalizedVersion = version.trim();
  return (
    normalizedVersion.length > 0 &&
    normalizedVersion !== DEFAULT_TOOL_VERSION_TOKEN &&
    normalizedVersion !== "latest"
  );
}

function getManagedPipxLayout(tool: "conan"): PipxManagedLayout {
  const toolRoot = getToolRoot(tool);
  return {
    homeDir: path.join(toolRoot, "pipx-home"),
    binDir: path.join(toolRoot, "bin"),
    executable: path.join(toolRoot, "bin", hostAdapter.getExecutableName("conan"))
  };
}

function getManagedPipxEnv(tool: "conan"): NodeJS.ProcessEnv {
  const layout = getManagedPipxLayout(tool);
  return {
    ...process.env,
    PIPX_HOME: layout.homeDir,
    PIPX_BIN_DIR: layout.binDir
  };
}

async function resolveExecutableFromPath(...candidates: string[]): Promise<string | null> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  const pathEntries = pathValue
    .split(hostAdapter.getPathSeparator())
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const candidate of candidates) {
    for (const entry of pathEntries) {
      const resolved = path.join(entry, candidate);
      if (!(await pathExists(resolved))) {
        continue;
      }

      const stat = await fs.stat(resolved).catch(() => null);
      if (!stat || !stat.isFile()) {
        continue;
      }

      if (hostAdapter.platform !== "win32" && (stat.mode & 0o111) === 0) {
        continue;
      }

      return resolved;
    }
  }

  for (const candidate of candidates) {
    try {
      const lookupCommand = hostAdapter.getExecutableLookupCommand(candidate);
      const { stdout } = await execFile(lookupCommand.command, lookupCommand.args, {
        windowsHide: true
      });
      const resolved = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (resolved && (await pathExists(resolved))) {
        return resolved;
      }
    } catch {
      // Ignore missing candidates and continue.
    }
  }

  return null;
}

export async function resolvePipxExecutable(): Promise<string | null> {
  if (hostAdapter.platform !== "linux") {
    return null;
  }

  return resolveExecutableFromPath("pipx");
}

async function getConanVersion(executable: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFile(executable, ["--version"], {
      windowsHide: true
    });
    const combined = `${stdout}\n${stderr}`;
    const match = combined.match(/Conan version\s+([^\s]+)/i);
    return match?.[1]?.trim() || DEFAULT_TOOL_VERSION_TOKEN;
  } catch {
    return DEFAULT_TOOL_VERSION_TOKEN;
  }
}

async function ensurePipxAvailable(logger: CppxLogger): Promise<string> {
  let pipxExecutable = await resolvePipxExecutable();
  if (pipxExecutable) {
    return pipxExecutable;
  }

  await ensureAptPackageIndex(logger);
  await runAptCommand(["install", "-y", "pipx"], logger);

  pipxExecutable = await resolvePipxExecutable();
  if (pipxExecutable) {
    return pipxExecutable;
  }

  throw new CppxError(
    "pipx를 찾지 못했습니다.",
    "Ubuntu 24.04 managed conan 설치를 사용하려면 pipx가 필요합니다."
  );
}

export async function resolveCppxManagedPipxConan(): Promise<ResolvedPipxToolExecutable | null> {
  const layout = getManagedPipxLayout("conan");
  if (!(await pathExists(layout.executable))) {
    return null;
  }

  return {
    executable: layout.executable,
    root: getToolRoot("conan"),
    version: await getConanVersion(layout.executable),
    provider: "pipx"
  };
}

export async function resolveExternalPipxConan(): Promise<ResolvedPipxToolExecutable | null> {
  const executable = await resolveExecutableFromPath(hostAdapter.getExecutableName("conan"), "conan");
  if (!executable || !isPathManagedByPipx(executable)) {
    return null;
  }

  return {
    executable,
    root: path.dirname(executable),
    version: await getConanVersion(executable),
    provider: "pipx"
  };
}

async function registerTool(record: PipxInstallResult): Promise<void> {
  await upsertToolRecord({
    name: record.name,
    executable: record.executable,
    root: record.root,
    version: record.version,
    installedAt: new Date().toISOString(),
    mode: record.mode,
    sourceKind: record.sourceKind,
    requestedVersion: record.requestedVersion,
    resolvedVersion: record.resolvedVersion,
    platform: hostAdapter.platform,
    arch: getHostArchLabel(),
    provider: record.provider,
    ownership: record.ownership
  });
}

export async function installPipxManagedConan(
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<PipxInstallResult> {
  if (hostAdapter.platform !== "linux") {
    throw new CppxError("pipx managed conan 경로는 Linux에서만 지원됩니다.");
  }

  const manifest = await readToolManifest();
  const existingRecord = manifest.tools.conan;
  const managed = await resolveCppxManagedPipxConan();
  const requestedPinned = isPinnedToolVersion(policy.version);

  if (managed && (!requestedPinned || managed.version === policy.version)) {
    const record: PipxInstallResult = {
      name: "conan",
      executable: managed.executable,
      root: managed.root,
      version: managed.version,
      mode: "managed",
      sourceKind: "pipx-managed",
      requestedVersion: policy.version,
      resolvedVersion: managed.version,
      provider: "pipx",
      ownership: "cppx"
    };
    logger.info("install-tools", `conan 이미 설치됨 (pipx: ${managed.executable})`);
    await registerTool(record);
    return record;
  }

  if (!requestedPinned) {
    const external = await resolveExternalPipxConan();
    if (external) {
      const record: PipxInstallResult = {
        name: "conan",
        executable: external.executable,
        root: external.root,
        version: external.version,
        mode: "managed",
        sourceKind: "pipx-managed",
        requestedVersion: policy.version,
        resolvedVersion: external.version,
        provider: "pipx",
        ownership:
          existingRecord?.provider === "pipx" && (existingRecord.ownership ?? "unknown") === "cppx"
            ? "cppx"
            : "external"
      };
      logger.info("install-tools", `conan 이미 설치됨 (external pipx: ${external.executable})`);
      await registerTool(record);
      return record;
    }
  }

  const pipxExecutable = await ensurePipxAvailable(logger);
  const layout = getManagedPipxLayout("conan");
  const pipxEnv = getManagedPipxEnv("conan");
  await ensureDir(layout.homeDir);
  await ensureDir(layout.binDir);

  const packageSpec = requestedPinned ? `conan==${policy.version}` : "conan";
  await runSpawn(
    {
      action: "install-tools",
      command: pipxExecutable,
      args: ["install", "--force", packageSpec],
      env: pipxEnv
    },
    logger
  );

  const installed = await resolveCppxManagedPipxConan();
  if (!installed) {
    throw new CppxError("conan pipx 설치 후 실행 파일을 찾지 못했습니다.", layout.executable);
  }

  const record: PipxInstallResult = {
    name: "conan",
    executable: installed.executable,
    root: installed.root,
    version: installed.version,
    mode: "managed",
    sourceKind: "pipx-managed",
    requestedVersion: policy.version,
    resolvedVersion: installed.version,
    provider: "pipx",
    ownership: "cppx"
  };
  await registerTool(record);
  logger.success("install-tools", `conan 설치됨: ${installed.executable}`);
  return record;
}

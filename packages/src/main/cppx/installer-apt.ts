import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { runSpawn } from "./command-runner";
import { DEFAULT_TOOL_VERSION_TOKEN } from "./tool-catalog";
import { CppxError } from "./errors";
import { pathExists } from "./fs-utils";
import { isPathManagedByApt } from "./host-support";
import { getLinuxAptInstallRequirementNote } from "./linux-profiles";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import { readToolManifest, upsertToolRecord } from "./paths";
import type {
  CompilerFamily,
  CompilerToolPolicy,
  ToolName,
  ToolPolicy
} from "./types";

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

type AptManagedTool = Exclude<ToolName, "vcpkg" | "conan">;

interface AptToolSpec {
  packageName: string;
  executable: string;
  compilerFamily?: CompilerFamily;
}

export interface ResolvedAptToolExecutable {
  executable: string;
  root: string;
  version: string;
  compilerFamily?: CompilerFamily;
}

export interface AptInstallResult {
  name: AptManagedTool;
  executable: string;
  root: string;
  version: string;
  mode: "managed";
  sourceKind: "apt-managed";
  requestedVersion: string;
  resolvedVersion: string;
  compilerFamily?: CompilerFamily;
  provider: "apt";
  ownership: "cppx" | "external";
}

let aptPackageIndexReady = false;

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

function getAptToolSpec(
  tool: AptManagedTool,
  compilerFamily: CompilerFamily = "clang"
): AptToolSpec {
  switch (tool) {
    case "cmake":
      return { packageName: "cmake", executable: "cmake" };
    case "ninja":
      return { packageName: "ninja-build", executable: "ninja" };
    case "cxx":
      return compilerFamily === "gcc"
        ? {
            packageName: "g++",
            executable: "g++",
            compilerFamily: "gcc"
          }
        : {
            packageName: "clang",
            executable: "clang++",
            compilerFamily: "clang"
          };
    default: {
      const neverTool: never = tool;
      throw new CppxError(`지원하지 않는 apt 도구: ${String(neverTool)}`);
    }
  }
}

async function resolveExecutableFromPathEntries(candidates: string[]): Promise<string | null> {
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

  return null;
}

async function resolveExecutableCandidatesFromPath(candidates: string[]): Promise<string[]> {
  const matches = new Set<string>();
  const directPathMatch = await resolveExecutableFromPathEntries(candidates);
  if (directPathMatch) {
    matches.add(directPathMatch);
  }

  for (const candidate of candidates) {
    try {
      const lookupCommand = hostAdapter.getExecutableLookupCommand(candidate);
      const { stdout } = await execFile(lookupCommand.command, lookupCommand.args, {
        windowsHide: true
      });
      for (const resolved of stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)) {
        if (await pathExists(resolved)) {
          matches.add(resolved);
        }
      }
    } catch {
      // Ignore missing candidates and continue.
    }
  }

  return [...matches];
}

async function resolveExecutableFromPath(...candidates: string[]): Promise<string | null> {
  const directPathMatch = await resolveExecutableFromPathEntries(candidates);
  if (directPathMatch) {
    return directPathMatch;
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

export async function resolveAptExecutable(): Promise<string | null> {
  if (hostAdapter.platform !== "linux") {
    return null;
  }

  return resolveExecutableFromPath("apt-get");
}

async function getAptPackageVersion(packageName: string): Promise<string | null> {
  try {
    const { stdout } = await execFile(
      "dpkg-query",
      ["-W", "-f=${Version}", packageName],
      { windowsHide: true }
    );
    const version = stdout.trim();
    return version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

export async function resolveAptToolExecutable(
  tool: AptManagedTool,
  aptExecutable: string,
  compilerFamily?: CompilerFamily
): Promise<ResolvedAptToolExecutable | null> {
  const spec = getAptToolSpec(tool, compilerFamily);
  const executable = (
    await resolveExecutableCandidatesFromPath([hostAdapter.getExecutableName(spec.executable)])
  ).find((candidate) => isPathManagedByApt(candidate));
  if (!executable) {
    return null;
  }

  const version =
    (await getAptPackageVersion(spec.packageName)) ??
    (await getAptPackageVersion(path.basename(aptExecutable))) ??
    DEFAULT_TOOL_VERSION_TOKEN;

  return {
    executable,
    root: path.dirname(executable),
    version,
    compilerFamily: spec.compilerFamily
  };
}

function ensureSupportedAptVersionPolicy(
  tool: AptManagedTool,
  policy: ToolPolicy | CompilerToolPolicy
): void {
  if (!isPinnedToolVersion(policy.version)) {
    return;
  }

  throw new CppxError(
    `${tool} apt exact version은 아직 지원되지 않습니다.`,
    `requested=${policy.version}`
  );
}

export async function runAptCommand(args: string[], logger: CppxLogger): Promise<void> {
  const direct = await resolveAptExecutable();
  if (!direct) {
    throw new CppxError(
      "apt-get을 찾지 못했습니다.",
      getLinuxAptInstallRequirementNote()
    );
  }

  const needsPrivilege = typeof process.getuid === "function" && process.getuid() !== 0;
  if (!needsPrivilege) {
    await runSpawn(
      {
        action: "install-tools",
        command: direct,
        args
      },
      logger
    );
    return;
  }

  const sudoExecutable = await resolveExecutableFromPath("sudo");
  if (!sudoExecutable) {
    throw new CppxError(
      "apt 실행 권한을 확보하지 못했습니다.",
      "root 권한으로 실행하거나 passwordless sudo가 필요합니다."
    );
  }

  await runSpawn(
    {
      action: "install-tools",
      command: sudoExecutable,
      args: ["-n", direct, ...args]
    },
    logger
  );
}

export async function ensureAptPackageIndex(logger: CppxLogger): Promise<void> {
  if (aptPackageIndexReady) {
    return;
  }

  await runAptCommand(["update"], logger);
  aptPackageIndexReady = true;
}

async function registerTool(record: AptInstallResult): Promise<void> {
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
    compilerFamily: record.compilerFamily,
    provider: record.provider,
    ownership: record.ownership
  });
}

export async function installAptManagedTool(
  tool: AptManagedTool,
  policy: ToolPolicy | CompilerToolPolicy,
  logger: CppxLogger
): Promise<AptInstallResult> {
  if (hostAdapter.platform !== "linux") {
    throw new CppxError(`${tool} apt managed 경로는 Linux에서만 지원됩니다.`);
  }

  ensureSupportedAptVersionPolicy(tool, policy);

  const aptExecutable = await resolveAptExecutable();
  if (!aptExecutable) {
    throw new CppxError(
      "apt-get을 찾지 못했습니다.",
      getLinuxAptInstallRequirementNote()
    );
  }

  const compilerFamily =
    tool === "cxx" && "preferredFamily" in policy && policy.preferredFamily === "gcc"
      ? "gcc"
      : "clang";
  const spec = getAptToolSpec(tool, compilerFamily);
  const manifest = await readToolManifest();
  const existingRecord = manifest.tools[tool];
  const existing = await resolveAptToolExecutable(tool, aptExecutable, compilerFamily);

  if (existing) {
    const ownedByCppx =
      existingRecord?.provider === "apt" &&
      (existingRecord.ownership ?? "unknown") === "cppx" &&
      (existingRecord.mode ?? "managed") === "managed";
    const record: AptInstallResult = {
      name: tool,
      executable: existing.executable,
      root: existing.root,
      version: existing.version,
      mode: "managed",
      sourceKind: "apt-managed",
      requestedVersion: policy.version,
      resolvedVersion: existing.version,
      compilerFamily: existing.compilerFamily,
      provider: "apt",
      ownership: ownedByCppx ? "cppx" : "external"
    };
    logger.info("install-tools", `${tool} 이미 설치됨 (apt: ${spec.packageName})`);
    await registerTool(record);
    return record;
  }

  await ensureAptPackageIndex(logger);
  await runAptCommand(["install", "-y", spec.packageName], logger);

  const installed = await resolveAptToolExecutable(tool, aptExecutable, compilerFamily);
  if (!installed) {
    throw new CppxError(
      `${tool} apt 설치 후 실행 파일을 찾지 못했습니다.`,
      spec.packageName
    );
  }

  const record: AptInstallResult = {
    name: tool,
    executable: installed.executable,
    root: installed.root,
    version: installed.version,
    mode: "managed",
    sourceKind: "apt-managed",
    requestedVersion: policy.version,
    resolvedVersion: installed.version,
    compilerFamily: installed.compilerFamily,
    provider: "apt",
    ownership: "cppx"
  };
  await registerTool(record);
  logger.success("install-tools", `${tool} 설치됨: ${installed.executable}`);
  return record;
}

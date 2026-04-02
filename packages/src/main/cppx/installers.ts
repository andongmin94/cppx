import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type {
  DependencyBackend,
  ProjectToolPoliciesPayload,
  ToolLifecycleCapabilities,
  ToolOwnership,
  ToolLifecycleProvider
} from "@shared/contracts";
import {
  inferOwnership,
  inferProviderFromSourceKind,
  isPathManagedByApt,
  isPathManagedByHomebrew,
  isPathManagedByPipx,
  resolveHostSupport,
  resolveToolLifecycleCapabilities
} from "./host-support";
import { getLinuxConanManagedInstallSupportNote, getSupportedLinuxManagedProfileLabel } from "./linux-profiles";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { findFileRecursive, pathExists } from "./fs-utils";
import {
  installArchiveToolFromSource,
  resolveGitHubReleaseArchiveSource,
  shouldReuseManagedArchiveTool,
  verifyFileChecksumOrThrow,
  type ArchiveToolSource
} from "./installer-archive";
import { installAptManagedTool, resolveAptExecutable, resolveAptToolExecutable } from "./installer-apt";
import {
  installHomebrewManagedTool,
  resolveHomebrewExecutable,
  resolveHomebrewFormulaExecutable
} from "./installer-homebrew";
import {
  captureMsvcEnvironment,
  inferMsvcInstallationPathFromCl,
  resolveMsvcCompilerInfo,
  type MsvcCompilerInfo
} from "./installer-msvc";
import {
  installPipxManagedConan,
  resolveCppxManagedPipxConan,
  resolveExternalPipxConan
} from "./installer-pipx";
import {
  getResolvedToolSnapshot as getResolvedToolSnapshotImpl,
  getToolStatus as getToolStatusImpl,
  resolveToolchainOrThrow as resolveToolchainOrThrowImpl,
  type InstallerRuntimeDependencies,
  type ResolvedToolExecutable,
  type ResolvedToolPolicies
} from "./installer-runtime";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import {
  ensureCppxLayout,
  getDownloadsRoot,
  getToolRoot,
  readToolManifest,
  upsertToolRecord
} from "./paths";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  resolveToolCatalogEntry
} from "./tool-catalog";
import type {
  CompilerFamily,
  CompilerToolPolicy,
  ToolCatalogEntry,
  ToolName,
  ToolPolicy,
  ToolRecord,
  ToolSourceKind,
  Toolchain
} from "./types";
export type { ToolResolutionDetail, ToolResolutionSnapshot } from "./installer-runtime";

interface ResolvedToolInfo {
  name: ToolName;
  executable: string;
  root: string;
  version: string;
  mode: "managed" | "system";
  sourceKind: ToolSourceKind;
  requestedVersion: string;
  resolvedVersion: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
  baseEnv?: NodeJS.ProcessEnv;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
}

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

export { getCompilerScan } from "./installer-msvc";
export {
  shouldReuseManagedArchiveTool,
  verifyFileChecksumOrThrow
} from "./installer-archive";

const EXECUTABLE_CANDIDATES_BY_TOOL: Record<ToolName, string[]> = {
  cmake: [hostAdapter.getExecutableName("cmake")],
  ninja: [hostAdapter.getExecutableName("ninja")],
  vcpkg: [hostAdapter.getExecutableName("vcpkg")],
  conan: [hostAdapter.getExecutableName("conan"), "conan"],
  cxx: [
    hostAdapter.getExecutableName("clang++"),
    hostAdapter.getExecutableName("g++"),
    hostAdapter.getExecutableName("cl")
  ]
};

function normalizeToolMode(value: unknown, fallback: "managed" | "system"): "managed" | "system" {
  return value === "system" || value === "managed" ? value : fallback;
}

function normalizeToolVersion(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeCompilerFamily(
  value: unknown,
  fallback: CompilerFamily
): CompilerFamily {
  return value === "clang" || value === "gcc" || value === "msvc" || value === "mingw"
    ? value
    : fallback;
}

function getCompilerExecutableCandidates(
  preferredFamily: CompilerFamily | undefined
): string[] {
  if (preferredFamily === "msvc") {
    return [hostAdapter.getExecutableName("cl")];
  }

  if (preferredFamily === "gcc") {
    return [hostAdapter.getExecutableName("g++")];
  }

  if (preferredFamily === "mingw") {
    return [hostAdapter.getExecutableName("clang++")];
  }

  if (hostAdapter.platform === "linux") {
    return [hostAdapter.getExecutableName("clang++"), hostAdapter.getExecutableName("g++")];
  }

  return [hostAdapter.getExecutableName("clang++")];
}

function getHostArchLabel(): string {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
}

function getDefaultToolMode(tool: ToolName, compilerFamily: CompilerFamily): "managed" | "system" {
  return hostAdapter.getDefaultToolMode(tool, compilerFamily);
}

function getDefaultToolVersion(
  tool: ToolName,
  mode: "managed" | "system",
  compilerFamily: CompilerFamily
): string {
  if (tool === "cxx" && mode === "managed" && compilerFamily !== "msvc") {
    return "latest";
  }

  return DEFAULT_TOOL_VERSION_TOKEN;
}

function ensureManagedLifecycleSupportedOrThrow(
  tool: ToolName,
  capabilities: ToolLifecycleCapabilities
): void {
  if (capabilities.install) {
    return;
  }

  throw new CppxError(
    `${tool} managed 수명주기는 현재 host에서 아직 지원되지 않습니다.`,
    capabilities.note ?? `provider=${capabilities.provider}`
  );
}

export function isPinnedToolVersion(version: string): boolean {
  const normalizedVersion = version.trim();
  return (
    normalizedVersion.length > 0 &&
    normalizedVersion !== DEFAULT_TOOL_VERSION_TOKEN &&
    normalizedVersion !== "latest"
  );
}

function doesResolvedVersionSatisfyPolicy(
  requestedVersion: string | undefined,
  resolvedVersion?: string | null
): boolean {
  if (!requestedVersion || !isPinnedToolVersion(requestedVersion)) {
    return true;
  }

  if (!resolvedVersion || resolvedVersion.trim().length === 0) {
    return false;
  }

  return (
    sanitizeVersionToken(resolvedVersion) === sanitizeVersionToken(requestedVersion) ||
    resolvedVersion.trim() === requestedVersion.trim()
  );
}

function shouldUsePinnedManagedArchivePath(
  tool: ToolName,
  policy?: ToolPolicy | CompilerToolPolicy
): boolean {
  if (!policy || !isPinnedToolVersion(policy.version)) {
    return false;
  }

  if (tool === "cmake" || tool === "ninja") {
    return hostAdapter.platform === "darwin" || hostAdapter.platform === "linux";
  }

  return tool === "conan" && hostAdapter.platform === "darwin";
}

function resolveRequestedPolicies(
  toolPolicies?: ProjectToolPoliciesPayload
): ResolvedToolPolicies {
  const compilerFamily = normalizeCompilerFamily(
    toolPolicies?.cxx?.preferredFamily,
    hostAdapter.compilerFamily
  );
  const defaultCmakeMode = getDefaultToolMode("cmake", compilerFamily);
  const defaultNinjaMode = getDefaultToolMode("ninja", compilerFamily);
  const defaultVcpkgMode = getDefaultToolMode("vcpkg", compilerFamily);
  const defaultConanMode = getDefaultToolMode("conan", compilerFamily);
  const defaultCxxMode = getDefaultToolMode("cxx", compilerFamily);

  return {
    cmake: {
      mode: normalizeToolMode(toolPolicies?.cmake?.mode, defaultCmakeMode),
      version: normalizeToolVersion(
        toolPolicies?.cmake?.version,
        getDefaultToolVersion("cmake", defaultCmakeMode, compilerFamily)
      )
    },
    ninja: {
      mode: normalizeToolMode(toolPolicies?.ninja?.mode, defaultNinjaMode),
      version: normalizeToolVersion(
        toolPolicies?.ninja?.version,
        getDefaultToolVersion("ninja", defaultNinjaMode, compilerFamily)
      )
    },
    vcpkg: {
      mode: normalizeToolMode(toolPolicies?.vcpkg?.mode, defaultVcpkgMode),
      version: normalizeToolVersion(
        toolPolicies?.vcpkg?.version,
        getDefaultToolVersion("vcpkg", defaultVcpkgMode, compilerFamily)
      )
    },
    conan: {
      mode: normalizeToolMode(toolPolicies?.conan?.mode, defaultConanMode),
      version: normalizeToolVersion(
        toolPolicies?.conan?.version,
        getDefaultToolVersion("conan", defaultConanMode, compilerFamily)
      )
    },
    cxx: {
      mode: normalizeToolMode(toolPolicies?.cxx?.mode, defaultCxxMode),
      version: normalizeToolVersion(
        toolPolicies?.cxx?.version,
        getDefaultToolVersion("cxx", defaultCxxMode, compilerFamily)
      ),
      preferredFamily: compilerFamily,
      msvcInstallationPath:
        typeof toolPolicies?.cxx?.msvcInstallationPath === "string" &&
        toolPolicies.cxx.msvcInstallationPath.trim().length > 0
          ? toolPolicies.cxx.msvcInstallationPath.trim()
          : undefined
    }
  };
}

function sanitizeVersionToken(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function resolveLatestCxxSource(
  policy: CompilerToolPolicy,
  logger: CppxLogger
): Promise<ArchiveToolSource> {
  const entry = resolveToolCatalogEntry("cxx", policy.version, "mingw");
  return resolveGitHubReleaseArchiveSource(entry, policy.version, logger, {
    subject: "llvm-mingw 컴파일러",
    compilerFamily: "mingw",
    missingAssetMessage: "다운로드 가능한 llvm-mingw x86_64 zip 에셋을 찾지 못했습니다."
  });
}

async function registerTool(record: ResolvedToolInfo): Promise<void> {
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
    catalogId: record.catalogId,
    verifiedSha256: record.verifiedSha256,
    provider: record.provider,
    ownership: record.ownership
  });
}

async function resolveExecutableFromPath(candidates: string[]): Promise<string | null> {
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

export async function findExecutableOnPath(...candidates: string[]): Promise<string | null> {
  return resolveExecutableFromPath(candidates);
}

async function inferSystemProvider(executable: string): Promise<ToolLifecycleProvider> {
  if (hostAdapter.platform === "darwin" && isPathManagedByHomebrew(executable)) {
    return "homebrew";
  }

  if (hostAdapter.platform === "linux" && isPathManagedByApt(executable)) {
    const support = await resolveHostSupport();
    if (support.recommendedProvider === "apt") {
      return "apt";
    }
  }

  if (hostAdapter.platform === "linux" && isPathManagedByPipx(executable)) {
    return "pipx";
  }

  return "system";
}

async function resolveSystemTool(
  tool: Exclude<ToolName, "cxx">,
  policy: ToolPolicy
): Promise<ResolvedToolInfo | null> {
  const executable = await resolveExecutableFromPath(EXECUTABLE_CANDIDATES_BY_TOOL[tool]);
  if (!executable) {
    return null;
  }

  const provider = await inferSystemProvider(executable);

  return {
    name: tool,
    executable,
    root: path.dirname(executable),
    version: policy.version,
    mode: "system",
    sourceKind: "system-detected",
    requestedVersion: policy.version,
    resolvedVersion: policy.version,
    provider,
    ownership: "external"
  };
}

async function resolveSystemCompiler(
  policy: CompilerToolPolicy
): Promise<ResolvedToolInfo | null> {
  if (policy.preferredFamily === "msvc") {
    const msvc = await resolveMsvcCompilerInfo(policy.msvcInstallationPath);
    if (!msvc) {
      return null;
    }

    return {
      name: "cxx",
      executable: msvc.clPath,
      root: msvc.installationPath,
      version: msvc.version ?? policy.version,
      mode: "system",
      sourceKind: "msvc-detected",
      requestedVersion: policy.version,
      resolvedVersion: msvc.version ?? policy.version,
      compilerFamily: "msvc",
      provider: "msvc",
      ownership: "external"
    };
  }

  const executable = await resolveExecutableFromPath(
    getCompilerExecutableCandidates(policy.preferredFamily)
  );
  if (!executable) {
    return null;
  }

  const provider = await inferSystemProvider(executable);

  return {
    name: "cxx",
    executable,
    root: path.dirname(executable),
    version: policy.version,
    mode: "system",
    sourceKind: "system-detected",
    requestedVersion: policy.version,
    resolvedVersion: policy.version,
    compilerFamily: inferCompilerFamily(executable),
    provider,
    ownership: "external"
  };
}

async function collapseSingleNestedDirectory(toolRoot: string): Promise<void> {
  const entries = await fs.readdir(toolRoot, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0]?.isDirectory()) {
    return;
  }

  const nestedRoot = path.join(toolRoot, entries[0].name);
  const nestedEntries = await fs.readdir(nestedRoot);
  for (const entryName of nestedEntries) {
    await fs.rename(path.join(nestedRoot, entryName), path.join(toolRoot, entryName));
  }

  await fs.rm(nestedRoot, { recursive: true, force: true });
}

async function resolveVcpkgBootstrapRoot(toolRoot: string): Promise<string> {
  await collapseSingleNestedDirectory(toolRoot);

  const bootstrapScriptName =
    hostAdapter.platform === "win32"
      ? hostAdapter.getCommandScriptName("bootstrap-vcpkg", "bat")
      : "bootstrap-vcpkg.sh";
  const directBootstrapPath = path.join(toolRoot, bootstrapScriptName);
  if (await pathExists(directBootstrapPath)) {
    return toolRoot;
  }

  const nestedBootstrapPath = await findFileRecursive(toolRoot, bootstrapScriptName);
  if (nestedBootstrapPath) {
    return path.dirname(nestedBootstrapPath);
  }

  throw new CppxError("vcpkg 아카이브에서 bootstrap 스크립트를 찾지 못했습니다.", toolRoot);
}

async function bootstrapVcpkgArchive(toolRoot: string, logger: CppxLogger): Promise<void> {
  const bootstrapRoot = await resolveVcpkgBootstrapRoot(toolRoot);
  const bootstrapCommand = hostAdapter.getVcpkgBootstrapCommand(bootstrapRoot);
  const vcpkgExecutable = path.join(bootstrapRoot, hostAdapter.getExecutableName("vcpkg"));

  await fs.rm(vcpkgExecutable, { force: true });
  await runSpawn(
    {
      action: "install-tools",
      command: bootstrapCommand.command,
      args: bootstrapCommand.args,
      cwd: bootstrapRoot
    },
    logger
  );
}

async function installStaticArchiveTool(
  tool: "cmake" | "ninja",
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  const entry = resolveToolCatalogEntry(tool, policy.version);
  return installArchiveToolFromSource(
    tool,
    {
      version: entry.version ?? policy.version,
      urls: entry.urls ?? [],
      sha256: entry.sha256,
      executable: entry.executable,
      sourceKind: entry.sourceKind,
      requestedVersion: policy.version,
      catalogId: entry.id
    },
    logger
  );
}

async function installManagedCoreTool(
  tool: "cmake" | "ninja",
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  if (shouldUsePinnedManagedArchivePath(tool, policy)) {
    logger.info(
      "install-tools",
      `${tool} exact version ${policy.version}은 verified archive 경로를 사용합니다.`
    );
    return installStaticArchiveTool(tool, policy, logger);
  }

  if (hostAdapter.platform === "darwin") {
    return installHomebrewManagedTool(tool, policy, logger);
  }

  if (hostAdapter.platform === "linux") {
    return installAptManagedTool(tool, policy, logger);
  }

  return installStaticArchiveTool(tool, policy, logger);
}

async function installCxxCompiler(
  policy: CompilerToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  if (policy.preferredFamily === "msvc") {
    throw new CppxError("MSVC는 system 모드로만 지원됩니다.");
  }

  if (hostAdapter.platform === "darwin") {
    logger.info("install-tools", "Homebrew llvm 기반 C++ 컴파일러를 설치합니다.");
    return installHomebrewManagedTool("cxx", policy, logger);
  }

  if (hostAdapter.platform === "linux") {
    logger.info(
      "install-tools",
      policy.preferredFamily === "gcc"
        ? "apt 기반 g++ C++ 컴파일러를 설치합니다."
        : "apt 기반 clang++ C++ 컴파일러를 설치합니다."
    );
    return installAptManagedTool("cxx", policy, logger);
  }

  const source = await resolveLatestCxxSource(policy, logger);
  return installArchiveToolFromSource("cxx", source, logger);
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function inferCompilerFamily(executable: string): CompilerFamily {
  const basename = path.basename(executable).toLowerCase();
  if (basename === hostAdapter.getExecutableName("cl")) {
    return "msvc";
  }

  if (basename === hostAdapter.getExecutableName("g++")) {
    return "gcc";
  }

  return hostAdapter.platform === "win32" ? "mingw" : "clang";
}

async function installMsvcCompiler(
  logger: CppxLogger,
  preferredInstallationPath?: string
): Promise<ResolvedToolInfo> {
  let msvc: MsvcCompilerInfo | null = null;
  try {
    msvc = await resolveMsvcCompilerInfo(preferredInstallationPath);
  } catch (error) {
    throw new CppxError("MSVC 설치 여부 확인에 실패했습니다.", toMessage(error));
  }

  if (!msvc) {
    if (preferredInstallationPath && preferredInstallationPath.trim().length > 0) {
      throw new CppxError(
        "선택한 MSVC 인스턴스를 찾지 못했습니다.",
        preferredInstallationPath
      );
    }
    throw new CppxError(
      "MSVC 컴파일러를 찾지 못했습니다.",
      "Visual Studio Build Tools(C++ 워크로드) 설치 후 다시 시도하세요."
    );
  }

  let baseEnv: NodeJS.ProcessEnv;
  try {
    baseEnv = await captureMsvcEnvironment(msvc.devCmdPath);
  } catch (error) {
    throw new CppxError("MSVC 개발자 환경을 불러오지 못했습니다.", toMessage(error));
  }

  const version = msvc.version?.trim() || "unknown";
  const record: ResolvedToolInfo = {
    name: "cxx",
    executable: msvc.clPath,
    root: msvc.installationPath,
    version: `msvc-${version}`,
    mode: "system",
    sourceKind: "msvc-detected",
    requestedVersion: DEFAULT_TOOL_VERSION_TOKEN,
    resolvedVersion: version,
    compilerFamily: "msvc",
    baseEnv,
    provider: "msvc",
    ownership: "external"
  };
  await registerTool(record);
  logger.success("install-tools", `cxx 설치됨: ${msvc.clPath} (MSVC)`);
  return record;
}

async function installVcpkg(
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  const entry = resolveToolCatalogEntry("vcpkg", policy.version);
  return installArchiveToolFromSource(
    "vcpkg",
    {
      version: entry.version ?? policy.version,
      urls: entry.urls ?? [],
      sha256: entry.sha256,
      executable: entry.executable,
      sourceKind: entry.sourceKind,
      requestedVersion: policy.version,
      catalogId: entry.id
    },
    logger,
    {
      afterExtract: async (toolRoot) => {
        await bootstrapVcpkgArchive(toolRoot, logger);
      }
    }
  );
}

async function installConan(
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  if (hostAdapter.platform === "win32") {
    const entry = resolveToolCatalogEntry("conan", policy.version);
    const source = await resolveGitHubReleaseArchiveSource(entry, policy.version, logger, {
      subject: "Conan",
      missingAssetMessage: "다운로드 가능한 Conan Windows zip 에셋을 찾지 못했습니다."
    });
    return installArchiveToolFromSource("conan", source, logger);
  }

  if (hostAdapter.platform === "darwin") {
    if (isPinnedToolVersion(policy.version)) {
      const entry = resolveToolCatalogEntry("conan", policy.version);
      const source = await resolveGitHubReleaseArchiveSource(entry, policy.version, logger, {
        subject: "Conan",
        missingAssetMessage: "다운로드 가능한 Conan macOS archive 에셋을 찾지 못했습니다."
      });
      return installArchiveToolFromSource("conan", source, logger);
    }

    return installHomebrewManagedTool("conan", policy, logger);
  }

  if (hostAdapter.platform === "linux") {
    return installPipxManagedConan(policy, logger);
  }

  throw new CppxError(
    getLinuxConanManagedInstallSupportNote()
  );
}

function formatInstallError(tool: ToolName, error: unknown): string {
  if (error instanceof CppxError) {
    if (error.details) {
      return `${tool}: ${error.message} (${error.details})`;
    }
    return `${tool}: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${tool}: ${error.message}`;
  }

  return `${tool}: 알 수 없는 오류`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupDownloadsCache(logger: CppxLogger): Promise<void> {
  const downloadsRoot = getDownloadsRoot();
  if (!(await pathExists(downloadsRoot))) {
    return;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(downloadsRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      if (!(await pathExists(downloadsRoot))) {
        logger.info("install-tools", `다운로드 캐시 삭제: ${downloadsRoot}`);
        return;
      }
    } catch (error) {
      if (attempt >= maxAttempts) {
        logger.warn(
          "install-tools",
          `다운로드 캐시 정리 실패: ${toMessage(error)}`
        );
        return;
      }
    }

    await sleep(200 * attempt);
  }

  if (await pathExists(downloadsRoot)) {
    logger.warn(
      "install-tools",
      `다운로드 캐시가 남아 있습니다: ${downloadsRoot}`
    );
  }
}

export async function installAllTools(
  logger: CppxLogger,
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = hostAdapter.getDefaultDependencyBackend()
): Promise<Toolchain> {
  await ensureCppxLayout();

  const policies = resolveRequestedPolicies(toolPolicies);
  const [cmakeCapabilities, ninjaCapabilities, vcpkgCapabilities, conanCapabilities, cxxCapabilities] =
    await Promise.all([
      resolveToolLifecycleCapabilities("cmake"),
      resolveToolLifecycleCapabilities("ninja"),
      resolveToolLifecycleCapabilities("vcpkg"),
      resolveToolLifecycleCapabilities("conan"),
      resolveToolLifecycleCapabilities("cxx")
    ]);
  let cmake: ResolvedToolInfo | undefined;
  let ninja: ResolvedToolInfo | undefined;
  let vcpkg: ResolvedToolInfo | undefined;
  let conan: ResolvedToolInfo | undefined;
  let cxx: ResolvedToolInfo | undefined;
  const errors: string[] = [];

  try {
    if (policies.cmake.mode === "system") {
      cmake = await resolveSystemTool("cmake", policies.cmake) ?? undefined;
      if (!cmake) {
        throw new CppxError("cmake system 실행 파일을 찾지 못했습니다.");
      }
      await registerTool(cmake);
    } else {
      ensureManagedLifecycleSupportedOrThrow("cmake", cmakeCapabilities);
      cmake = await installManagedCoreTool("cmake", policies.cmake, logger);
    }
  } catch (error) {
    errors.push(formatInstallError("cmake", error));
  }

  try {
    if (policies.ninja.mode === "system") {
      ninja = await resolveSystemTool("ninja", policies.ninja) ?? undefined;
      if (!ninja) {
        throw new CppxError("ninja system 실행 파일을 찾지 못했습니다.");
      }
      await registerTool(ninja);
    } else {
      ensureManagedLifecycleSupportedOrThrow("ninja", ninjaCapabilities);
      ninja = await installManagedCoreTool("ninja", policies.ninja, logger);
    }
  } catch (error) {
    errors.push(formatInstallError("ninja", error));
  }

  if (dependencyBackend === "vcpkg") {
    try {
      if (policies.vcpkg.mode === "system") {
        vcpkg = await resolveSystemTool("vcpkg", policies.vcpkg) ?? undefined;
        if (!vcpkg) {
          throw new CppxError("vcpkg system 실행 파일을 찾지 못했습니다.");
        }
        await registerTool(vcpkg);
      } else {
        ensureManagedLifecycleSupportedOrThrow("vcpkg", vcpkgCapabilities);
        vcpkg = await installVcpkg(policies.vcpkg, logger);
      }
    } catch (error) {
      errors.push(formatInstallError("vcpkg", error));
    }
  }

  if (dependencyBackend === "conan") {
    try {
      if (policies.conan.mode === "system") {
        conan = await resolveSystemTool("conan", policies.conan) ?? undefined;
        if (!conan) {
          throw new CppxError("conan system 실행 파일을 찾지 못했습니다.");
        }
        await registerTool(conan);
      } else {
        ensureManagedLifecycleSupportedOrThrow("conan", conanCapabilities);
        conan = await installConan(policies.conan, logger);
      }
    } catch (error) {
      errors.push(formatInstallError("conan", error));
    }
  }

  try {
    if (policies.cxx.mode === "system") {
      if (policies.cxx.preferredFamily === "msvc") {
        logger.info("install-tools", "MSVC 컴파일러 사용을 시도합니다.");
        cxx = await installMsvcCompiler(logger, policies.cxx.msvcInstallationPath);
      } else {
        logger.info("install-tools", "system C++ 컴파일러를 탐색합니다.");
        cxx = await resolveSystemCompiler(policies.cxx) ?? undefined;
        if (!cxx) {
          throw new CppxError("system C++ 컴파일러를 찾지 못했습니다.");
        }
        await registerTool(cxx);
      }
    } else {
      ensureManagedLifecycleSupportedOrThrow("cxx", cxxCapabilities);
      logger.info(
        "install-tools",
        hostAdapter.platform === "linux"
          ? `${getSupportedLinuxManagedProfileLabel()} managed C++ 컴파일러를 설치합니다.`
          : "llvm-mingw 기반 C++ 컴파일러를 설치합니다."
      );
      cxx = await installCxxCompiler(policies.cxx, logger);
    }
  } catch (error) {
    errors.push(formatInstallError("cxx", error));
  }

  if (!cmake || !ninja || (dependencyBackend === "vcpkg" && !vcpkg) || (dependencyBackend === "conan" && !conan) || !cxx) {
    const details =
      errors.length > 0
        ? errors.join(" | ")
        : "필수 도구 중 하나 이상이 설치되지 않았습니다.";
    throw new CppxError("도구 설치가 완료되지 않았습니다", details);
  }

  const envPath = Array.from(
    new Set([
      path.dirname(cmake.executable),
      path.dirname(ninja.executable),
      ...(vcpkg ? [path.dirname(vcpkg.executable)] : []),
      ...(conan ? [path.dirname(conan.executable)] : []),
      path.dirname(cxx.executable)
    ])
  );

  await cleanupDownloadsCache(logger);

  return {
    cmake: cmake.executable,
    ninja: ninja.executable,
    vcpkg: vcpkg?.executable,
    conan: conan?.executable,
    cxx: cxx.executable,
    envPath,
    compilerFamily: cxx.compilerFamily ?? inferCompilerFamily(cxx.executable),
    baseEnv: cxx.baseEnv
  };
}

function buildResolvedExecutable(
  executable: string,
  root: string,
  record: ToolRecord | undefined,
  fallback: {
    mode: "managed" | "system";
    sourceKind: ToolSourceKind;
    requestedVersion?: string;
    resolvedVersion?: string;
    compilerFamily?: CompilerFamily;
    catalogId?: string;
    verifiedSha256?: string;
    provider?: ToolLifecycleProvider;
    ownership?: ToolOwnership;
  }
): ResolvedToolExecutable {
  const sourceKind = record?.sourceKind ?? fallback.sourceKind;
  const mode = record?.mode ?? fallback.mode;
  return {
    executable,
    root,
    record,
    mode,
    sourceKind,
    requestedVersion: record?.requestedVersion ?? fallback.requestedVersion,
    resolvedVersion: record?.resolvedVersion ?? record?.version ?? fallback.resolvedVersion,
    compilerFamily: record?.compilerFamily ?? fallback.compilerFamily,
    catalogId: record?.catalogId ?? fallback.catalogId,
    verifiedSha256: record?.verifiedSha256 ?? fallback.verifiedSha256,
    provider: record?.provider ?? fallback.provider ?? inferProviderFromSourceKind(sourceKind),
    ownership: inferOwnership(record, mode)
  };
}

function getMatchingSystemRecord(
  record: ToolRecord | undefined,
  executable: string
): ToolRecord | undefined {
  if (!record || (record.mode ?? "managed") !== "system") {
    return undefined;
  }

  if (typeof record.executable !== "string" || record.executable.trim().length === 0) {
    return undefined;
  }

  return hostAdapter.comparePaths(record.executable, executable) === 0 ? record : undefined;
}

function getMatchingManagedRecord(record: ToolRecord | undefined): ToolRecord | undefined {
  if (!record || (record.mode ?? "managed") !== "managed") {
    return undefined;
  }

  return record;
}

function getManagedFallbackSourceKind(tool: ToolName): ToolSourceKind {
  if (hostAdapter.platform === "win32" && (tool === "cxx" || tool === "conan")) {
    return "catalog-github-release";
  }
  if (hostAdapter.platform === "darwin" && tool !== "vcpkg") {
    return "homebrew-managed";
  }
  if (hostAdapter.platform === "linux" && tool === "conan") {
    return "pipx-managed";
  }
  if (hostAdapter.platform === "linux" && (tool === "cmake" || tool === "ninja" || tool === "cxx")) {
    return "apt-managed";
  }
  return "catalog-archive";
}

function getManagedPolicySourceKind(
  tool: ToolName,
  policy?: ToolPolicy | CompilerToolPolicy
): ToolSourceKind {
  if (tool === "conan" && shouldUsePinnedManagedArchivePath(tool, policy)) {
    return "catalog-github-release";
  }

  if ((tool === "cmake" || tool === "ninja") && shouldUsePinnedManagedArchivePath(tool, policy)) {
    return "catalog-archive";
  }

  return getManagedFallbackSourceKind(tool);
}

async function resolveManagedToolExecutable(
  tool: ToolName,
  manifest: Awaited<ReturnType<typeof readToolManifest>>,
  policy?: ToolPolicy | CompilerToolPolicy
): Promise<ResolvedToolExecutable | null> {
  const record = manifest.tools[tool];
  const managedRecord = getMatchingManagedRecord(record);
  if (
    managedRecord &&
    typeof managedRecord.executable === "string" &&
    managedRecord.executable.trim().length > 0 &&
    (await pathExists(managedRecord.executable)) &&
    doesResolvedVersionSatisfyPolicy(
      policy?.version,
      managedRecord.resolvedVersion ?? managedRecord.version
    )
  ) {
    return buildResolvedExecutable(managedRecord.executable, managedRecord.root, managedRecord, {
      mode: "managed",
      sourceKind: getManagedPolicySourceKind(tool, policy),
      requestedVersion: policy?.version,
      resolvedVersion: managedRecord.resolvedVersion ?? managedRecord.version
    });
  }

  if (
    hostAdapter.platform === "darwin" &&
    tool !== "vcpkg" &&
    !shouldUsePinnedManagedArchivePath(tool, policy)
  ) {
    const brewExecutable = await resolveHomebrewExecutable();
    if (brewExecutable) {
      const homebrew = await resolveHomebrewFormulaExecutable(brewExecutable, tool);
      if (homebrew && doesResolvedVersionSatisfyPolicy(policy?.version, homebrew.version)) {
        const ownership =
          record?.provider === "homebrew" && (record.ownership ?? "unknown") === "cppx"
            ? "cppx"
            : "external";
        return buildResolvedExecutable(homebrew.executable, homebrew.root, managedRecord, {
          mode: "managed",
          sourceKind: "homebrew-managed",
          requestedVersion: policy?.version,
          resolvedVersion: homebrew.version,
          compilerFamily: homebrew.compilerFamily,
          provider: "homebrew",
          ownership
        });
      }
    }
  }

  if (
    hostAdapter.platform === "linux" &&
    (tool === "cmake" || tool === "ninja" || tool === "cxx") &&
    !shouldUsePinnedManagedArchivePath(tool, policy)
  ) {
    const support = await resolveHostSupport();
    if (support.recommendedProvider === "apt") {
      const aptExecutable = await resolveAptExecutable();
      if (aptExecutable) {
        const aptTool = await resolveAptToolExecutable(
          tool,
          aptExecutable,
          tool === "cxx" ? (policy as CompilerToolPolicy | undefined)?.preferredFamily : undefined
        );
        if (aptTool && doesResolvedVersionSatisfyPolicy(policy?.version, aptTool.version)) {
          const ownership =
            record?.provider === "apt" && (record.ownership ?? "unknown") === "cppx"
              ? "cppx"
              : "external";
          return buildResolvedExecutable(aptTool.executable, aptTool.root, managedRecord, {
            mode: "managed",
            sourceKind: "apt-managed",
            requestedVersion: policy?.version,
            resolvedVersion: aptTool.version,
            compilerFamily: aptTool.compilerFamily,
            provider: "apt",
            ownership
          });
        }
      }
    }
  }

  if (hostAdapter.platform === "linux" && tool === "conan") {
    const support = await resolveHostSupport();
    if (support.recommendedProvider === "apt") {
      const managedPipxConan = await resolveCppxManagedPipxConan();
      if (
        managedPipxConan &&
        doesResolvedVersionSatisfyPolicy(policy?.version, managedPipxConan.version)
      ) {
        return buildResolvedExecutable(
          managedPipxConan.executable,
          managedPipxConan.root,
          managedRecord,
          {
            mode: "managed",
            sourceKind: "pipx-managed",
            requestedVersion: policy?.version,
            resolvedVersion: managedPipxConan.version,
            provider: "pipx",
            ownership: "cppx"
          }
        );
      }

      const externalPipxConan = await resolveExternalPipxConan();
      if (
        externalPipxConan &&
        doesResolvedVersionSatisfyPolicy(policy?.version, externalPipxConan.version)
      ) {
        const ownership =
          record?.provider === "pipx" && (record.ownership ?? "unknown") === "cppx"
            ? "cppx"
            : "external";
        return buildResolvedExecutable(
          externalPipxConan.executable,
          externalPipxConan.root,
          managedRecord,
          {
            mode: "managed",
            sourceKind: "pipx-managed",
            requestedVersion: policy?.version,
            resolvedVersion: externalPipxConan.version,
            provider: "pipx",
            ownership
          }
        );
      }
    }
  }

  const toolRoot = getToolRoot(tool);
  if (!(await pathExists(toolRoot))) {
    return null;
  }

  const fallbackCandidates =
    tool === "cxx"
      ? getCompilerExecutableCandidates((policy as CompilerToolPolicy | undefined)?.preferredFamily)
      : EXECUTABLE_CANDIDATES_BY_TOOL[tool];

  for (const candidate of fallbackCandidates) {
    const found = await findFileRecursive(toolRoot, candidate);
    const fallbackResolvedVersion =
      managedRecord?.resolvedVersion ??
      managedRecord?.version ??
      (policy?.version && !isPinnedToolVersion(policy.version) ? policy.version : undefined);
    if (
      found &&
      doesResolvedVersionSatisfyPolicy(
        policy?.version,
        fallbackResolvedVersion
      )
    ) {
      return buildResolvedExecutable(found, managedRecord?.root ?? toolRoot, managedRecord, {
        mode: "managed",
        sourceKind: getManagedPolicySourceKind(tool, policy),
        requestedVersion: policy?.version,
        resolvedVersion: fallbackResolvedVersion
      });
    }
  }

  return null;
}

async function resolveSystemToolExecutable(
  tool: ToolName,
  manifest: Awaited<ReturnType<typeof readToolManifest>>,
  policy?: ToolPolicy | CompilerToolPolicy
): Promise<ResolvedToolExecutable | null> {
  const record = manifest.tools[tool];
  if (tool === "cxx") {
    const compiler = await resolveSystemCompiler(
      (policy as CompilerToolPolicy | undefined) ?? resolveRequestedPolicies().cxx
    );
    if (compiler) {
      return buildResolvedExecutable(
        compiler.executable,
        compiler.root,
        getMatchingSystemRecord(record, compiler.executable),
        compiler
      );
    }

    if (
      record &&
      (record.mode ?? "managed") === "system" &&
      typeof record.executable === "string" &&
      record.executable.trim().length > 0 &&
      (await pathExists(record.executable))
    ) {
      return buildResolvedExecutable(record.executable, record.root, record, {
        mode: "system",
        sourceKind: record.sourceKind ?? "system-detected",
        requestedVersion: policy?.version,
        resolvedVersion: record.resolvedVersion ?? record.version,
        compilerFamily: record.compilerFamily,
        provider: record.provider,
        ownership: record.ownership
      });
    }

    return null;
  }

  const systemTool = await resolveSystemTool(
    tool,
    (policy as ToolPolicy | undefined) ?? { mode: "system", version: DEFAULT_TOOL_VERSION_TOKEN }
  );
  if (systemTool) {
    return buildResolvedExecutable(
      systemTool.executable,
      systemTool.root,
      getMatchingSystemRecord(record, systemTool.executable),
      systemTool
    );
  }

  if (
    record &&
    (record.mode ?? "managed") === "system" &&
    typeof record.executable === "string" &&
    record.executable.trim().length > 0 &&
    (await pathExists(record.executable))
  ) {
    return buildResolvedExecutable(record.executable, record.root, record, {
      mode: "system",
      sourceKind: record.sourceKind ?? "system-detected",
      requestedVersion: policy?.version,
      resolvedVersion: record.resolvedVersion ?? record.version,
      compilerFamily: record.compilerFamily,
      provider: record.provider,
      ownership: record.ownership
    });
  }

  return null;
}

async function resolveToolExecutable(
  tool: ToolName,
  manifest: Awaited<ReturnType<typeof readToolManifest>>,
  policy?: ToolPolicy | CompilerToolPolicy
): Promise<ResolvedToolExecutable | null> {
  if (policy?.mode === "system") {
    return resolveSystemToolExecutable(tool, manifest, policy);
  }

  if (policy?.mode === "managed") {
    return resolveManagedToolExecutable(tool, manifest, policy);
  }

  const recorded = manifest.tools[tool];
  if (
    recorded &&
    typeof recorded.executable === "string" &&
    recorded.executable.trim().length > 0 &&
    (await pathExists(recorded.executable))
  ) {
    return buildResolvedExecutable(recorded.executable, recorded.root, recorded, {
      mode: recorded.mode ?? "managed",
      sourceKind: recorded.sourceKind ?? getManagedFallbackSourceKind(tool),
      requestedVersion: recorded.requestedVersion,
      resolvedVersion: recorded.resolvedVersion ?? recorded.version,
      compilerFamily: recorded.compilerFamily,
      catalogId: recorded.catalogId
    });
  }

  return resolveManagedToolExecutable(tool, manifest, policy);
}

const installerRuntimeDeps: InstallerRuntimeDependencies = {
  ensureCppxLayout,
  readToolManifest,
  resolveRequestedPolicies,
  resolveToolExecutable,
  resolveToolLifecycleCapabilities,
  inferCompilerFamily,
  inferMsvcInstallationPathFromCl,
  resolveMsvcCompilerInfo,
  captureMsvcEnvironment,
  toMessage
};

export async function getResolvedToolSnapshot(
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = hostAdapter.getDefaultDependencyBackend()
) {
  return getResolvedToolSnapshotImpl(installerRuntimeDeps, toolPolicies, dependencyBackend);
}

export async function getToolStatus() {
  return getToolStatusImpl(installerRuntimeDeps);
}

export async function resolveToolchainOrThrow(
  logger: CppxLogger,
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = hostAdapter.getDefaultDependencyBackend()
) {
  return resolveToolchainOrThrowImpl(
    installerRuntimeDeps,
    logger,
    toolPolicies,
    dependencyBackend
  );
}




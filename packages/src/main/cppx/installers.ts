import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile as execFileCb } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  DependencyBackend,
  CompilerScanResult,
  MsvcCandidate,
  ProjectToolPoliciesPayload,
  ToolStatus
} from "@shared/contracts";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { ensureDir, findFileRecursive, pathExists } from "./fs-utils";
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
  LATEST_TOOL_VERSION_TOKEN,
  isTrustedCatalogGitRef,
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

interface ArchiveToolSource {
  version: string;
  urls: string[];
  sha256?: string;
  executable: string;
  sourceKind: ToolSourceKind;
  requestedVersion: string;
  catalogId?: string;
  compilerFamily?: CompilerFamily;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  assets: GitHubAsset[];
}

interface MsvcCompilerInfo {
  installationPath: string;
  displayName?: string;
  version?: string;
  devCmdPath: string;
  clPath: string;
}

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
}

interface ResolvedToolExecutable {
  executable: string;
  root: string;
  record?: ToolRecord;
  sourceKind: ToolSourceKind;
  mode: "managed" | "system";
  requestedVersion?: string;
  resolvedVersion?: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
}

export interface ToolResolutionDetail {
  ready: boolean;
  mode?: "managed" | "system";
  sourceKind?: ToolSourceKind;
  requestedVersion?: string;
  resolvedVersion?: string;
  executable?: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
}

export interface ToolResolutionSnapshot {
  cmake: ToolResolutionDetail;
  ninja: ToolResolutionDetail;
  vcpkg: ToolResolutionDetail;
  cxx: ToolResolutionDetail;
}

interface ResolvedToolPolicies {
  cmake: ToolPolicy;
  ninja: ToolPolicy;
  vcpkg: ToolPolicy;
  cxx: CompilerToolPolicy;
}

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

const EXECUTABLE_CANDIDATES_BY_TOOL: Record<ToolName, string[]> = {
  cmake: [hostAdapter.getExecutableName("cmake")],
  ninja: [hostAdapter.getExecutableName("ninja")],
  vcpkg: [hostAdapter.getExecutableName("vcpkg")],
  cxx: [
    hostAdapter.getExecutableName("clang++"),
    hostAdapter.getExecutableName("g++"),
    hostAdapter.getExecutableName("cl")
  ]
};

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "cppx"
};

function normalizeSha256Digest(digest?: string | null): string | null {
  if (typeof digest !== "string") {
    return null;
  }

  const trimmed = digest.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  const withoutPrefix = trimmed.startsWith("sha256:") ? trimmed.slice("sha256:".length) : trimmed;
  return /^[a-f0-9]{64}$/.test(withoutPrefix) ? withoutPrefix : null;
}

async function computeFileSha256(targetPath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(targetPath);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
  });
}

export async function verifyFileChecksumOrThrow(
  targetPath: string,
  expectedDigest: string,
  options: { removeOnMismatch?: boolean } = {}
): Promise<string> {
  const normalizedExpected = normalizeSha256Digest(expectedDigest);
  if (!normalizedExpected) {
    throw new CppxError("지원하지 않는 SHA-256 체크섬 형식입니다.", expectedDigest);
  }

  const actual = await computeFileSha256(targetPath);
  if (actual === normalizedExpected) {
    return actual;
  }

  if (options.removeOnMismatch !== false) {
    await fs.rm(targetPath, { force: true });
  }

  throw new CppxError(
    "다운로드 체크섬이 일치하지 않습니다.",
    `expected=sha256:${normalizedExpected}, actual=sha256:${actual}`
  );
}

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
  return value === "msvc" || value === "mingw" ? value : fallback;
}

function getHostArchLabel(): string {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
}

function getDefaultToolMode(tool: ToolName, compilerFamily: CompilerFamily): "managed" | "system" {
  return hostAdapter.getDefaultToolMode(tool, compilerFamily);
}

function normalizeGitRemoteUrl(value: string): string {
  return value.trim().replace(/\.git$/i, "").toLowerCase();
}

async function getGitOriginUrl(repositoryRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["remote", "get-url", "origin"], {
      cwd: repositoryRoot,
      windowsHide: true
    });
    const normalized = stdout.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

async function verifyGitOriginOrThrow(
  tool: ToolName,
  repositoryRoot: string,
  expectedRepoUrl: string
): Promise<void> {
  const originUrl = await getGitOriginUrl(repositoryRoot);
  if (!originUrl) {
    throw new CppxError(`${tool} git origin 정보를 찾지 못했습니다.`, repositoryRoot);
  }

  if (normalizeGitRemoteUrl(originUrl) !== normalizeGitRemoteUrl(expectedRepoUrl)) {
    throw new CppxError(
      `${tool} git origin이 catalog와 일치하지 않습니다.`,
      `expected=${expectedRepoUrl}, actual=${originUrl}`
    );
  }
}

function resolveDesiredCatalogGitRef(entry: ToolCatalogEntry, requestedVersion: string): string | null {
  const normalizedVersion =
    requestedVersion.trim().length > 0 ? requestedVersion.trim() : DEFAULT_TOOL_VERSION_TOKEN;

  if (normalizedVersion === LATEST_TOOL_VERSION_TOKEN) {
    return null;
  }

  if (normalizedVersion === DEFAULT_TOOL_VERSION_TOKEN) {
    return entry.version && entry.version !== "rolling" ? entry.version : null;
  }

  if (!isTrustedCatalogGitRef(entry, normalizedVersion)) {
    throw new CppxError(
      `${entry.tool} exact version은 신뢰된 tag 또는 commit ref만 지원합니다.`,
      `requested=${normalizedVersion}`
    );
  }

  return normalizedVersion;
}

async function getGitRevisionMetadata(repositoryRoot: string): Promise<{
  shortCommit: string;
  fullCommit: string;
  exactTag: string | null;
}> {
  const [{ stdout: shortStdout }, { stdout: fullStdout }] = await Promise.all([
    execFile("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repositoryRoot,
      windowsHide: true
    }),
    execFile("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      windowsHide: true
    })
  ]);

  let exactTag: string | null = null;
  try {
    const { stdout } = await execFile("git", ["describe", "--tags", "--exact-match", "HEAD"], {
      cwd: repositoryRoot,
      windowsHide: true
    });
    exactTag = stdout.trim() || null;
  } catch {
    exactTag = null;
  }

  return {
    shortCommit: shortStdout.trim(),
    fullCommit: fullStdout.trim(),
    exactTag
  };
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

export function isPinnedToolVersion(version: string): boolean {
  const normalizedVersion = version.trim();
  return (
    normalizedVersion.length > 0 &&
    normalizedVersion !== DEFAULT_TOOL_VERSION_TOKEN &&
    normalizedVersion !== "latest"
  );
}

export function shouldReuseManagedArchiveTool(
  existingRecord: ToolRecord | undefined,
  source: ArchiveToolSource
): boolean {
  if (!isPinnedToolVersion(source.requestedVersion)) {
    return true;
  }

  if (!existingRecord || (existingRecord.mode ?? "managed") !== "managed") {
    return false;
  }

  const recordedVersion = existingRecord.resolvedVersion ?? existingRecord.version;
  const expectedSha256 = normalizeSha256Digest(source.sha256);
  const recordedSha256 = normalizeSha256Digest(existingRecord.verifiedSha256);
  return (
    recordedVersion === source.version &&
    (existingRecord.sourceKind ?? source.sourceKind) === source.sourceKind &&
    (existingRecord.catalogId ?? source.catalogId) === source.catalogId &&
    (!expectedSha256 || recordedSha256 === expectedSha256)
  );
}

function resolveRequestedPolicies(
  toolPolicies?: ProjectToolPoliciesPayload
): ResolvedToolPolicies {
  const compilerFamily = normalizeCompilerFamily(toolPolicies?.cxx?.preferredFamily, "mingw");
  const defaultCmakeMode = getDefaultToolMode("cmake", compilerFamily);
  const defaultNinjaMode = getDefaultToolMode("ninja", compilerFamily);
  const defaultVcpkgMode = getDefaultToolMode("vcpkg", compilerFamily);
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

function getVswherePath(): string {
  return hostAdapter.getVsWherePath() ?? "";
}

async function runVsDevCmdAndCapture(devCmdPath: string, command: string): Promise<string> {
  const scriptPath = path.join(
    os.tmpdir(),
    hostAdapter.getCommandScriptName(`cppx-msvc-${randomUUID()}`, "cmd")
  );
  const scriptContent = [
    "@echo off",
    `call "${devCmdPath}" -arch=x64 -host_arch=x64 >nul`,
    "if errorlevel 1 exit /b %errorlevel%",
    command
  ].join("\r\n");

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  try {
    const shellCommand = hostAdapter.getShellCommand("cmd");
    const { stdout } = await execFile(
      shellCommand.command,
      [...shellCommand.args, scriptPath],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await fs.rm(scriptPath, { force: true });
  }
}

interface VswhereMsvcInstance {
  installationPath: string;
  displayName?: string;
  version?: string;
}

function normalizePath(value: string): string {
  return hostAdapter.normalizePath(path.resolve(value));
}

function compareVersionDesc(a?: string, b?: string): number {
  const aParts = (a ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const bParts = (b ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const maxLength = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLength; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left !== right) {
      return right - left;
    }
  }
  return 0;
}

function inferMsvcInstallationPathFromCl(clPath: string): string | null {
  const normalized = path.resolve(clPath).replace(/\//g, "\\");
  const marker = "\\VC\\Tools\\MSVC\\";
  const markerIndex = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex < 0) {
    return null;
  }
  return normalized.slice(0, markerIndex);
}

async function resolveVswhereMsvcInstances(): Promise<VswhereMsvcInstance[]> {
  const vswherePath = getVswherePath();
  if (!vswherePath || !(await pathExists(vswherePath))) {
    return [];
  }

  const { stdout } = await execFile(
    vswherePath,
    [
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-format",
      "json"
    ],
    { windowsHide: true }
  );

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const instances: VswhereMsvcInstance[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const installationPath = typeof record.installationPath === "string"
      ? record.installationPath.trim()
      : "";
    if (!installationPath) {
      continue;
    }

    const fallbackVersion = typeof record.installationVersion === "string"
      ? record.installationVersion.trim()
      : undefined;
    const catalog =
      record.catalog && typeof record.catalog === "object"
        ? (record.catalog as Record<string, unknown>)
        : undefined;
    const displayName =
      typeof record.displayName === "string"
        ? record.displayName.trim()
        : undefined;
    const versionFromCatalog =
      catalog && typeof catalog.productDisplayVersion === "string"
        ? catalog.productDisplayVersion.trim()
        : undefined;

    instances.push({
      installationPath,
      displayName: displayName || undefined,
      version: versionFromCatalog || fallbackVersion || undefined
    });
  }

  return instances.sort((left, right) => {
    const versionCompare = compareVersionDesc(left.version, right.version);
    if (versionCompare !== 0) {
      return versionCompare;
    }
    return hostAdapter.comparePaths(left.installationPath, right.installationPath);
  });
}

async function resolveMsvcCompilerInfoFromInstance(
  instance: VswhereMsvcInstance
): Promise<MsvcCompilerInfo | null> {
  const installationPath = instance.installationPath;
  const devCmdPath = path.join(
    installationPath,
    "Common7",
    "Tools",
    hostAdapter.getCommandScriptName("VsDevCmd", "bat")
  );
  if (!(await pathExists(devCmdPath))) {
    return null;
  }

  const whereOutput = await runVsDevCmdAndCapture(devCmdPath, "where cl");
  const clPath = whereOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!clPath || !(await pathExists(clPath))) {
    return null;
  }

  return {
    installationPath,
    displayName: instance.displayName,
    version: instance.version,
    devCmdPath,
    clPath
  };
}

async function resolveAllMsvcCompilerInfos(): Promise<MsvcCompilerInfo[]> {
  const instances = await resolveVswhereMsvcInstances();
  const infos: MsvcCompilerInfo[] = [];

  for (const instance of instances) {
    try {
      const info = await resolveMsvcCompilerInfoFromInstance(instance);
      if (info) {
        infos.push(info);
      }
    } catch {
      // Ignore a broken instance and continue with the rest.
    }
  }

  return infos.sort((left, right) => {
    const versionCompare = compareVersionDesc(left.version, right.version);
    if (versionCompare !== 0) {
      return versionCompare;
    }
    return hostAdapter.comparePaths(left.installationPath, right.installationPath);
  });
}

async function resolveMsvcCompilerInfo(
  preferredInstallationPath?: string
): Promise<MsvcCompilerInfo | null> {
  const infos = await resolveAllMsvcCompilerInfos();
  if (infos.length === 0) {
    return null;
  }

  if (preferredInstallationPath && preferredInstallationPath.trim().length > 0) {
    const targetPath = normalizePath(preferredInstallationPath);
    const matched = infos.find(
      (info) => normalizePath(info.installationPath) === targetPath
    );
    return matched ?? null;
  }

  return infos[0] ?? null;
}

async function captureMsvcEnvironment(devCmdPath: string): Promise<NodeJS.ProcessEnv> {
  const output = await runVsDevCmdAndCapture(devCmdPath, "set");
  const env: NodeJS.ProcessEnv = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (key.length === 0) {
      continue;
    }
    const normalizedKey = /^path$/i.test(key) ? "PATH" : key;
    env[normalizedKey] = value;
  }
  return env;
}

export async function getCompilerScan(): Promise<CompilerScanResult> {
  try {
    const msvcInfos = await resolveAllMsvcCompilerInfos();
    const candidates: MsvcCandidate[] = msvcInfos.map((info) => ({
      installationPath: info.installationPath,
      displayName: info.displayName,
      version: info.version,
      clPath: info.clPath
    }));
    const selected = msvcInfos[0];
    return {
      msvcAvailable: candidates.length > 0,
      msvcCandidates: candidates,
      msvcDisplayName: selected?.displayName,
      msvcVersion: selected?.version,
      msvcClPath: selected?.clPath
    };
  } catch {
    return { msvcAvailable: false, msvcCandidates: [] };
  }
}

function sanitizeVersionToken(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function parseHttpStatus(details?: string): number | null {
  if (!details) {
    return null;
  }
  const match = details.match(/HTTP status:\s*(\d+)/i);
  if (!match || !match[1]) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function canRetryDownload(error: unknown): boolean {
  if (error instanceof CppxError) {
    const status = parseHttpStatus(error.details);
    if (status !== null) {
      return RETRYABLE_HTTP_STATUSES.has(status);
    }
    return true;
  }
  return error instanceof Error;
}

function formatDownloadFailure(url: string, error: unknown): string {
  if (error instanceof CppxError) {
    if (error.details) {
      return `${url} (${error.details})`;
    }
    return `${url} (${error.message})`;
  }
  if (error instanceof Error) {
    return `${url} (${error.message})`;
  }
  return `${url} (알 수 없는 오류)`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadFile(
  url: string,
  destination: string,
  logger: CppxLogger
): Promise<void> {
  logger.info("install-tools", `다운로드 중: ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new CppxError(
      `다운로드 실패: ${url}`,
      `HTTP status: ${response.status}`
    );
  }

  await ensureDir(path.dirname(destination));
  const fileStream = createWriteStream(destination);
  try {
    await pipeline(Readable.fromWeb(response.body as any), fileStream);
  } catch (error) {
    await fs.rm(destination, { force: true });
    throw new CppxError(
      `다운로드 실패: ${url}`,
      error instanceof Error ? error.message : undefined
    );
  }
}

async function downloadFileWithRetry(
  url: string,
  destination: string,
  logger: CppxLogger,
  maxAttempts = 3
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(destination, { force: true });
      await downloadFile(url, destination, logger);
      return;
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && canRetryDownload(error);
      if (!shouldRetry) {
        break;
      }
      const delayMs = 500 * attempt;
      logger.warn(
        "install-tools",
        `다운로드 재시도 ${attempt}/${maxAttempts - 1}: ${url}`
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new CppxError(`다운로드 실패: ${url}`);
}

async function resolveLatestCxxSource(
  policy: CompilerToolPolicy,
  logger: CppxLogger
): Promise<ArchiveToolSource> {
  const entry = resolveToolCatalogEntry("cxx", policy.version, "mingw");
  logger.info("install-tools", "GitHub 릴리스에서 llvm-mingw 컴파일러 패키지 조회 중");

  if (!entry.repoUrl || !entry.assetPatterns || entry.assetPatterns.length === 0) {
    throw new CppxError("llvm-mingw catalog 설정이 올바르지 않습니다.");
  }

  const response = await fetch(entry.repoUrl, { headers: GITHUB_API_HEADERS });

  if (!response.ok) {
    throw new CppxError(
      "llvm-mingw 릴리스 메타데이터를 조회할 수 없습니다",
      `HTTP status: ${response.status}`
    );
  }

  const releases = (await response.json()) as GitHubRelease[];
  for (const release of releases) {
    if (release.draft) {
      continue;
    }

    if (
      policy.version !== "latest" &&
      policy.version !== DEFAULT_TOOL_VERSION_TOKEN &&
      sanitizeVersionToken(release.tag_name) !== sanitizeVersionToken(policy.version) &&
      release.tag_name.trim() !== policy.version.trim()
    ) {
      continue;
    }

    const selected = entry.assetPatterns
      .map((pattern) => new RegExp(pattern, "i"))
      .map((pattern) => release.assets.find((asset) => pattern.test(asset.name)))
      .find((asset) => asset !== undefined);

    if (selected) {
      const sha256 = normalizeSha256Digest(selected.digest);
      if (!sha256) {
        throw new CppxError(
          "llvm-mingw 릴리스 에셋에 검증 가능한 SHA-256 정보가 없습니다.",
          selected.name
        );
      }

      logger.info(
        "install-tools",
        `llvm-mingw 릴리스 사용: ${release.tag_name} (${selected.name})`
      );
      return {
        version: sanitizeVersionToken(release.tag_name),
        urls: [selected.browser_download_url],
        sha256,
        executable: entry.executable,
        sourceKind: entry.sourceKind,
        requestedVersion: policy.version,
        catalogId: entry.id,
        compilerFamily: "mingw"
      };
    }
  }

  throw new CppxError(
    "다운로드 가능한 llvm-mingw x86_64 zip 에셋을 찾지 못했습니다"
  );
}

async function extractZip(
  archivePath: string,
  destination: string,
  logger: CppxLogger
): Promise<void> {
  await ensureDir(destination);
  const extractCommand = hostAdapter.getArchiveExtractCommand(archivePath, destination);
  await runSpawn(
    {
      action: "install-tools",
      command: extractCommand.command,
      args: extractCommand.args
    },
    logger
  );
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
    verifiedSha256: record.verifiedSha256
  });
}

async function resolveExecutableFromPath(candidates: string[]): Promise<string | null> {
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

export async function findExecutableOnPath(...candidates: string[]): Promise<string | null> {
  return resolveExecutableFromPath(candidates);
}

async function resolveSystemTool(
  tool: Exclude<ToolName, "cxx">,
  policy: ToolPolicy
): Promise<ResolvedToolInfo | null> {
  const executable = await resolveExecutableFromPath(EXECUTABLE_CANDIDATES_BY_TOOL[tool]);
  if (!executable) {
    return null;
  }

  return {
    name: tool,
    executable,
    root: path.dirname(executable),
    version: policy.version,
    mode: "system",
    sourceKind: "system-detected",
    requestedVersion: policy.version,
    resolvedVersion: policy.version
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
      compilerFamily: "msvc"
    };
  }

  const executable = await resolveExecutableFromPath(EXECUTABLE_CANDIDATES_BY_TOOL.cxx);
  if (!executable) {
    return null;
  }

  return {
    name: "cxx",
    executable,
    root: path.dirname(executable),
    version: policy.version,
    mode: "system",
    sourceKind: "system-detected",
    requestedVersion: policy.version,
    resolvedVersion: policy.version,
    compilerFamily: inferCompilerFamily(executable)
  };
}

async function installArchiveToolFromSource(
  tool: Exclude<ToolName, "vcpkg">,
  source: ArchiveToolSource,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  const normalizedSha256 = normalizeSha256Digest(source.sha256);
  if (!normalizedSha256) {
    throw new CppxError(`${tool} 다운로드 검증 정보가 없습니다.`);
  }

  const toolRoot = getToolRoot(tool);
  await ensureDir(toolRoot);
  const manifest = await readToolManifest();
  const existingRecord = manifest.tools[tool];

  const existing = await findFileRecursive(toolRoot, source.executable);
  if (existing) {
    if (shouldReuseManagedArchiveTool(existingRecord, source)) {
      logger.info("install-tools", `${tool} 이미 설치됨`);
      const record: ResolvedToolInfo = {
        name: tool,
        executable: existing,
        root: toolRoot,
        version: existingRecord?.resolvedVersion ?? existingRecord?.version ?? source.version,
        mode: "managed",
        sourceKind: existingRecord?.sourceKind ?? source.sourceKind,
        requestedVersion: source.requestedVersion,
        resolvedVersion: existingRecord?.resolvedVersion ?? existingRecord?.version ?? source.version,
        compilerFamily: existingRecord?.compilerFamily ?? source.compilerFamily,
        catalogId: existingRecord?.catalogId ?? source.catalogId,
        verifiedSha256: existingRecord?.verifiedSha256 ?? normalizedSha256
      };
      await registerTool(record);
      return record;
    }

    logger.info("install-tools", `${tool} 버전 정책이 변경되어 기존 설치를 다시 배치합니다.`);
    await fs.rm(toolRoot, { recursive: true, force: true });
    await ensureDir(toolRoot);
  }

  const archivePath = path.join(
    getDownloadsRoot(),
    `${tool}-${sanitizeVersionToken(source.version)}.zip`
  );

  if (await pathExists(archivePath)) {
    try {
      await verifyFileChecksumOrThrow(archivePath, normalizedSha256, { removeOnMismatch: true });
      logger.info("install-tools", `캐시된 아카이브 검증 완료: ${archivePath}`);
    } catch (error) {
      logger.warn(
        "install-tools",
        `캐시된 아카이브를 다시 받습니다: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (!(await pathExists(archivePath))) {
    if (source.urls.length === 0) {
      throw new CppxError(`${tool} 다운로드 URL이 비어 있습니다.`);
    }

    const failures: string[] = [];
    let downloaded = false;

    for (let index = 0; index < source.urls.length; index += 1) {
      const url = source.urls[index];
      try {
        await downloadFileWithRetry(url, archivePath, logger);
        await verifyFileChecksumOrThrow(archivePath, normalizedSha256, {
          removeOnMismatch: true
        });
        downloaded = true;
        break;
      } catch (error) {
        failures.push(formatDownloadFailure(url, error));
        const nextUrl = source.urls[index + 1];
        if (nextUrl) {
          logger.warn("install-tools", `다운로드 실패, 대체 경로 시도: ${nextUrl}`);
        }
      }
    }

    if (!downloaded) {
      throw new CppxError(
        `${tool} 아카이브 다운로드에 실패했습니다`,
        failures.join(" | ")
      );
    }
  } else {
    logger.info("install-tools", `캐시된 아카이브 사용: ${archivePath}`);
  }

  await extractZip(archivePath, toolRoot, logger);
  const executable = await findFileRecursive(toolRoot, source.executable);
  if (!executable) {
    throw new CppxError(
      `${tool} 설치 후 ${source.executable}을(를) 찾을 수 없습니다`
    );
  }

  const record: ResolvedToolInfo = {
    name: tool,
    executable,
    root: toolRoot,
    version: source.version,
    mode: "managed",
    sourceKind: source.sourceKind,
    requestedVersion: source.requestedVersion,
    resolvedVersion: source.version,
    compilerFamily: source.compilerFamily,
    catalogId: source.catalogId,
    verifiedSha256: normalizedSha256
  };
  await registerTool(record);
  logger.success("install-tools", `${tool} 설치됨: ${executable}`);
  return record;
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

async function installCxxCompiler(
  policy: CompilerToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  if (policy.preferredFamily === "msvc") {
    throw new CppxError("MSVC는 system 모드로만 지원됩니다.");
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
  return path.basename(executable).toLowerCase() === hostAdapter.getExecutableName("cl")
    ? "msvc"
    : "mingw";
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
    baseEnv
  };
  await registerTool(record);
  logger.success("install-tools", `cxx 설치됨: ${msvc.clPath} (MSVC)`);
  return record;
}

async function installVcpkg(
  policy: ToolPolicy,
  logger: CppxLogger
): Promise<ResolvedToolInfo> {
  const tool = "vcpkg";
  const entry = resolveToolCatalogEntry(tool, policy.version);
  const toolRoot = getToolRoot(tool);
  const vcpkgExe = path.join(toolRoot, hostAdapter.getExecutableName("vcpkg"));
  const expectedRepoUrl = entry.repoUrl ?? "https://github.com/microsoft/vcpkg.git";
  const desiredRef = resolveDesiredCatalogGitRef(entry, policy.version);

  await ensureDir(path.dirname(toolRoot));

  if (!(await pathExists(path.join(toolRoot, ".git")))) {
    if (await pathExists(toolRoot)) {
      const entries = await fs.readdir(toolRoot);
      if (entries.length > 0) {
        logger.warn(
          "install-tools",
          `vcpkg 기존 폴더 재사용: ${toolRoot}`
        );
      } else {
        await fs.rm(toolRoot, { recursive: true, force: true });
      }
    }

    if (!(await pathExists(path.join(toolRoot, ".git")))) {
      await runSpawn(
        {
          action: "install-tools",
          command: "git",
          args: [
            "clone",
            "--depth",
            "1",
            "--no-checkout",
            expectedRepoUrl,
            toolRoot
          ]
        },
        logger
      );
    }
  }

  await verifyGitOriginOrThrow(tool, toolRoot, expectedRepoUrl);
  logger.info(
    "install-tools",
    desiredRef
      ? `vcpkg 신뢰된 ref 사용: ${desiredRef}`
      : "vcpkg latest HEAD를 사용합니다."
  );
  await runSpawn(
    {
      action: "install-tools",
      command: "git",
      args: desiredRef
        ? ["fetch", "--depth", "1", "origin", desiredRef]
        : ["fetch", "--depth", "1", "origin"],
      cwd: toolRoot
    },
    logger
  );
  await runSpawn(
    {
      action: "install-tools",
      command: "git",
      args: ["checkout", "--force", "FETCH_HEAD"],
      cwd: toolRoot
    },
    logger
  );

  await fs.rm(vcpkgExe, { force: true });
  const bootstrapCommand = hostAdapter.getVcpkgBootstrapCommand(toolRoot);
  await runSpawn(
    {
      action: "install-tools",
      command: bootstrapCommand.command,
      args: bootstrapCommand.args,
      cwd: toolRoot
    },
    logger
  );

  if (!(await pathExists(vcpkgExe))) {
    throw new CppxError(
      `vcpkg bootstrap이 끝났지만 ${hostAdapter.getExecutableName("vcpkg")}를 찾지 못했습니다`
    );
  }

  let resolvedVersion = entry.version ?? policy.version;
  try {
    const revision = await getGitRevisionMetadata(toolRoot);
    const taggedVersion =
      revision.exactTag ??
      (desiredRef && !/^[0-9a-f]{7,40}$/i.test(desiredRef) ? desiredRef : null);
    resolvedVersion = taggedVersion
      ? `${taggedVersion}@${revision.shortCommit}`
      : revision.shortCommit || resolvedVersion;
  } catch {
    // Keep the policy version when git metadata is unavailable.
  }

  const record: ResolvedToolInfo = {
    name: "vcpkg",
    executable: vcpkgExe,
    root: toolRoot,
    version: resolvedVersion,
    mode: "managed",
    sourceKind: entry.sourceKind,
    requestedVersion: policy.version,
    resolvedVersion,
    catalogId: entry.id
  };
  await registerTool(record);
  logger.success("install-tools", `vcpkg 설치됨: ${vcpkgExe} (${resolvedVersion})`);
  return record;
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
  let cmake: ResolvedToolInfo | undefined;
  let ninja: ResolvedToolInfo | undefined;
  let vcpkg: ResolvedToolInfo | undefined;
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
      cmake = await installStaticArchiveTool("cmake", policies.cmake, logger);
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
      ninja = await installStaticArchiveTool("ninja", policies.ninja, logger);
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
        vcpkg = await installVcpkg(policies.vcpkg, logger);
      }
    } catch (error) {
      errors.push(formatInstallError("vcpkg", error));
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
      logger.info("install-tools", "llvm-mingw 기반 C++ 컴파일러를 설치합니다.");
      cxx = await installCxxCompiler(policies.cxx, logger);
    }
  } catch (error) {
    errors.push(formatInstallError("cxx", error));
  }

  if (!cmake || !ninja || (dependencyBackend === "vcpkg" && !vcpkg) || !cxx) {
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
      path.dirname(cxx.executable)
    ])
  );

  await cleanupDownloadsCache(logger);

  return {
    cmake: cmake.executable,
    ninja: ninja.executable,
    vcpkg: vcpkg?.executable,
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
  }
): ResolvedToolExecutable {
  return {
    executable,
    root,
    record,
    mode: record?.mode ?? fallback.mode,
    sourceKind: record?.sourceKind ?? fallback.sourceKind,
    requestedVersion: record?.requestedVersion ?? fallback.requestedVersion,
    resolvedVersion: record?.resolvedVersion ?? record?.version ?? fallback.resolvedVersion,
    compilerFamily: record?.compilerFamily ?? fallback.compilerFamily,
    catalogId: record?.catalogId ?? fallback.catalogId,
    verifiedSha256: record?.verifiedSha256 ?? fallback.verifiedSha256
  };
}

function getManagedFallbackSourceKind(tool: ToolName): ToolSourceKind {
  if (tool === "vcpkg") {
    return "catalog-git";
  }
  if (tool === "cxx") {
    return "catalog-github-release";
  }
  return "catalog-archive";
}

async function resolveManagedToolExecutable(
  tool: ToolName,
  manifest: Awaited<ReturnType<typeof readToolManifest>>,
  policy?: ToolPolicy | CompilerToolPolicy
): Promise<ResolvedToolExecutable | null> {
  const record = manifest.tools[tool];
  if (
    record &&
    (record.mode ?? "managed") === "managed" &&
    typeof record.executable === "string" &&
    record.executable.trim().length > 0 &&
    (await pathExists(record.executable))
  ) {
    return buildResolvedExecutable(record.executable, record.root, record, {
      mode: "managed",
      sourceKind: getManagedFallbackSourceKind(tool),
      requestedVersion: policy?.version,
      resolvedVersion: record.version
    });
  }

  const toolRoot = getToolRoot(tool);
  if (!(await pathExists(toolRoot))) {
    return null;
  }

  for (const candidate of EXECUTABLE_CANDIDATES_BY_TOOL[tool]) {
    const found = await findFileRecursive(toolRoot, candidate);
    if (found) {
      return buildResolvedExecutable(found, record?.root ?? toolRoot, record, {
        mode: "managed",
        sourceKind: getManagedFallbackSourceKind(tool),
        requestedVersion: policy?.version,
        resolvedVersion: record?.version ?? policy?.version
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
  if (
    record &&
    (record.mode ?? "managed") === "system" &&
    typeof record.executable === "string" &&
    record.executable.trim().length > 0 &&
    (await pathExists(record.executable))
  ) {
    return buildResolvedExecutable(record.executable, record.root, record, {
      mode: "system",
      sourceKind: tool === "cxx" ? "msvc-detected" : "system-detected",
      requestedVersion: policy?.version,
      resolvedVersion: record.version,
      compilerFamily: record.compilerFamily
    });
  }

  if (tool === "cxx") {
    const compiler = await resolveSystemCompiler(
      (policy as CompilerToolPolicy | undefined) ?? resolveRequestedPolicies().cxx
    );
    if (!compiler) {
      return null;
    }
    return buildResolvedExecutable(compiler.executable, compiler.root, undefined, compiler);
  }

  const systemTool = await resolveSystemTool(
    tool,
    (policy as ToolPolicy | undefined) ?? { mode: "system", version: DEFAULT_TOOL_VERSION_TOKEN }
  );
  if (!systemTool) {
    return null;
  }
  return buildResolvedExecutable(systemTool.executable, systemTool.root, undefined, systemTool);
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

function toStatusDetail(
  resolved: ResolvedToolExecutable | null
): NonNullable<ToolStatus["details"]>[ToolName] {
  if (!resolved) {
    return { ready: false };
  }

  return {
    ready: true,
    mode: resolved.mode,
    sourceKind: resolved.sourceKind,
    requestedVersion: resolved.requestedVersion,
    resolvedVersion: resolved.resolvedVersion,
    executable: resolved.executable,
    verifiedSha256: resolved.verifiedSha256
  };
}

function toResolutionDetail(
  resolved: ResolvedToolExecutable | null,
  fallback?: {
    mode?: "managed" | "system";
    requestedVersion?: string;
    compilerFamily?: CompilerFamily;
    verifiedSha256?: string;
  }
): ToolResolutionDetail {
  if (!resolved) {
    return {
      ready: false,
      mode: fallback?.mode,
      requestedVersion: fallback?.requestedVersion,
      compilerFamily: fallback?.compilerFamily,
      verifiedSha256: fallback?.verifiedSha256
    };
  }

  return {
    ready: true,
    mode: resolved.mode,
    sourceKind: resolved.sourceKind,
    requestedVersion: resolved.requestedVersion,
    resolvedVersion: resolved.resolvedVersion,
    executable: resolved.executable,
    compilerFamily: resolved.compilerFamily,
    catalogId: resolved.catalogId,
    verifiedSha256: resolved.verifiedSha256
  };
}

export async function getResolvedToolSnapshot(
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = hostAdapter.getDefaultDependencyBackend()
): Promise<ToolResolutionSnapshot> {
  await ensureCppxLayout();
  const manifest = await readToolManifest();
  const policies = resolveRequestedPolicies(toolPolicies);

  const [cmake, ninja, vcpkg, cxx] = await Promise.all([
    resolveToolExecutable("cmake", manifest, policies.cmake),
    resolveToolExecutable("ninja", manifest, policies.ninja),
    dependencyBackend === "vcpkg"
      ? resolveToolExecutable("vcpkg", manifest, policies.vcpkg)
      : Promise.resolve(null),
    resolveToolExecutable("cxx", manifest, policies.cxx)
  ]);

  return {
    cmake: toResolutionDetail(cmake, {
      mode: policies.cmake.mode,
      requestedVersion: policies.cmake.version
    }),
    ninja: toResolutionDetail(ninja, {
      mode: policies.ninja.mode,
      requestedVersion: policies.ninja.version
    }),
    vcpkg: toResolutionDetail(vcpkg, {
      mode: policies.vcpkg.mode,
      requestedVersion: policies.vcpkg.version
    }),
    cxx: toResolutionDetail(cxx, {
      mode: policies.cxx.mode,
      requestedVersion: policies.cxx.version,
      compilerFamily: policies.cxx.preferredFamily
    })
  };
}

export async function getToolStatus(): Promise<ToolStatus> {
  await ensureCppxLayout();
  const manifest = await readToolManifest();

  const [cmake, ninja, vcpkg, cxx] = await Promise.all([
    resolveToolExecutable("cmake", manifest),
    resolveToolExecutable("ninja", manifest),
    resolveToolExecutable("vcpkg", manifest),
    resolveToolExecutable("cxx", manifest)
  ]);

  return {
    cmake: Boolean(cmake),
    ninja: Boolean(ninja),
    vcpkg: Boolean(vcpkg),
    cxx: Boolean(cxx),
    details: {
      cmake: toStatusDetail(cmake),
      ninja: toStatusDetail(ninja),
      vcpkg: toStatusDetail(vcpkg),
      cxx: toStatusDetail(cxx)
    }
  };
}

export async function resolveToolchainOrThrow(
  logger: CppxLogger,
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = hostAdapter.getDefaultDependencyBackend()
): Promise<Toolchain> {
  await ensureCppxLayout();
  const manifest = await readToolManifest();
  const policies = resolveRequestedPolicies(toolPolicies);

  const [cmake, ninja, vcpkg, cxxResolved] = await Promise.all([
    resolveToolExecutable("cmake", manifest, policies.cmake),
    resolveToolExecutable("ninja", manifest, policies.ninja),
    dependencyBackend === "vcpkg"
      ? resolveToolExecutable("vcpkg", manifest, policies.vcpkg)
      : Promise.resolve(null),
    resolveToolExecutable("cxx", manifest, policies.cxx)
  ]);

  const missing: string[] = [];
  if (!cmake) missing.push("cmake");
  if (!ninja) missing.push("ninja");
  if (dependencyBackend === "vcpkg" && !vcpkg) missing.push("vcpkg");
  if (!cxxResolved) missing.push("cxx-compiler");

  if (missing.length > 0) {
    throw new CppxError(
      `누락된 도구: ${missing.join(", ")}. 먼저 install-tools를 실행하거나 시스템 PATH를 확인하세요.`
    );
  }

  if (!cmake || !ninja || !cxxResolved || (dependencyBackend === "vcpkg" && !vcpkg)) {
    throw new CppxError("도구 확인 중 예기치 않은 오류가 발생했습니다.");
  }

  let cxx = cxxResolved.executable;
  let compilerFamily = cxxResolved.compilerFamily ?? inferCompilerFamily(cxxResolved.executable);
  let baseEnv: NodeJS.ProcessEnv | undefined;

  if (compilerFamily === "msvc") {
    const preferredInstallationPath =
      policies.cxx.msvcInstallationPath ??
      manifest.tools.cxx?.root ??
      inferMsvcInstallationPathFromCl(cxxResolved.executable) ??
      undefined;
    let msvc: MsvcCompilerInfo | null = null;
    try {
      msvc = await resolveMsvcCompilerInfo(preferredInstallationPath);
    } catch (error) {
      throw new CppxError("MSVC 정보 조회에 실패했습니다.", toMessage(error));
    }

    if (!msvc) {
      throw new CppxError(
        "MSVC 개발자 환경을 찾을 수 없습니다.",
        "install-tools를 다시 실행해 MinGW로 전환하거나 Visual Studio Build Tools 설치를 확인하세요."
      );
    }

    cxx = msvc.clPath;
    try {
      baseEnv = await captureMsvcEnvironment(msvc.devCmdPath);
    } catch (error) {
      throw new CppxError("MSVC 환경 변수를 불러오지 못했습니다.", toMessage(error));
    }
    logger.info("system", `MSVC 컴파일러 사용: ${cxx}`);
  }

  const envPath = Array.from(
    new Set([
      path.dirname(cmake.executable),
      path.dirname(ninja.executable),
      ...(vcpkg ? [path.dirname(vcpkg.executable)] : []),
      path.dirname(cxx)
    ])
  );

  if (vcpkg) {
    logger.info("system", `사용 중인 toolchain 루트: ${path.dirname(vcpkg.executable)}`);
  }
  return {
    cmake: cmake.executable,
    ninja: ninja.executable,
    vcpkg: vcpkg?.executable,
    cxx,
    envPath,
    compilerFamily,
    baseEnv
  };
}




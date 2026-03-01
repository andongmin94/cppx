import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile as execFileCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  CompilerPreference,
  CompilerScanResult,
  MsvcCandidate,
  ToolStatus
} from "@shared/contracts";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { ensureDir, findFileRecursive, pathExists } from "./fs-utils";
import type { CppxLogger } from "./logger";
import {
  ensureCppxLayout,
  getDownloadsRoot,
  getToolRoot,
  readToolManifest,
  upsertToolRecord
} from "./paths";
import type { CompilerFamily, ToolName, Toolchain } from "./types";

interface ArchiveToolSource {
  version: string;
  urls: string[];
  executable: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
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

const execFile = promisify(execFileCb);

const STATIC_ARCHIVE_TOOL_SOURCES: Record<"cmake" | "ninja", ArchiveToolSource> = {
  cmake: {
    version: "3.30.5",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v3.30.5/cmake-3.30.5-windows-x86_64.zip",
      "https://cmake.org/files/v3.30/cmake-3.30.5-windows-x86_64.zip"
    ],
    executable: "cmake.exe"
  },
  ninja: {
    version: "1.12.1",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip"],
    executable: "ninja.exe"
  }
};

const EXECUTABLE_CANDIDATES_BY_TOOL: Record<ToolName, string[]> = {
  cmake: ["cmake.exe"],
  ninja: ["ninja.exe"],
  vcpkg: ["vcpkg.exe"],
  cxx: ["clang++.exe", "cl.exe"]
};

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "cppx"
};

function getVswherePath(): string {
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
}

async function runVsDevCmdAndCapture(devCmdPath: string, command: string): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `cppx-msvc-${randomUUID()}.cmd`);
  const scriptContent = [
    "@echo off",
    `call "${devCmdPath}" -arch=x64 -host_arch=x64 >nul`,
    "if errorlevel 1 exit /b %errorlevel%",
    command
  ].join("\r\n");

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  try {
    const { stdout } = await execFile(
      "cmd.exe",
      ["/d", "/c", scriptPath],
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
  return path.resolve(value).replace(/\//g, "\\").toLowerCase();
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
  if (!(await pathExists(vswherePath))) {
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
    return normalizePath(left.installationPath).localeCompare(normalizePath(right.installationPath));
  });
}

async function resolveMsvcCompilerInfoFromInstance(
  instance: VswhereMsvcInstance
): Promise<MsvcCompilerInfo | null> {
  const installationPath = instance.installationPath;
  const devCmdPath = path.join(installationPath, "Common7", "Tools", "VsDevCmd.bat");
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
    return normalizePath(left.installationPath).localeCompare(normalizePath(right.installationPath));
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
  logger: CppxLogger
): Promise<ArchiveToolSource> {
  logger.info("install-tools", "GitHub 릴리스에서 llvm-mingw 컴파일러 패키지 조회 중");

  const response = await fetch(
    "https://api.github.com/repos/mstorsjo/llvm-mingw/releases?per_page=20",
    {
      headers: GITHUB_API_HEADERS
    }
  );

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

    const preferredUcrt = release.assets.find((asset) =>
      /^llvm-mingw-.*-ucrt-x86_64\.zip$/i.test(asset.name)
    );
    const fallbackMsvcrt = release.assets.find((asset) =>
      /^llvm-mingw-.*-msvcrt-x86_64\.zip$/i.test(asset.name)
    );
    const selected = preferredUcrt ?? fallbackMsvcrt;

    if (selected) {
      logger.info(
        "install-tools",
        `llvm-mingw 릴리스 사용: ${release.tag_name} (${selected.name})`
      );
      return {
        version: sanitizeVersionToken(release.tag_name),
        urls: [selected.browser_download_url],
        executable: "clang++.exe"
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
  await runSpawn(
    {
      action: "install-tools",
      command: "powershell",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${destination}' -Force`
      ]
    },
    logger
  );
}

async function registerTool(
  tool: ToolName,
  root: string,
  executable: string,
  version: string
): Promise<void> {
  await upsertToolRecord({
    name: tool,
    executable,
    root,
    version,
    installedAt: new Date().toISOString()
  });
}

async function installArchiveToolFromSource(
  tool: Exclude<ToolName, "vcpkg">,
  source: ArchiveToolSource,
  logger: CppxLogger
): Promise<string> {
  const toolRoot = getToolRoot(tool);
  await ensureDir(toolRoot);

  const existing = await findFileRecursive(toolRoot, source.executable);
  if (existing) {
    logger.info("install-tools", `${tool} 이미 설치됨`);
    await registerTool(tool, toolRoot, existing, source.version);
    return existing;
  }

  const archivePath = path.join(
    getDownloadsRoot(),
    `${tool}-${sanitizeVersionToken(source.version)}.zip`
  );

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

  await registerTool(tool, toolRoot, executable, source.version);
  logger.success("install-tools", `${tool} 설치됨: ${executable}`);
  return executable;
}

async function installStaticArchiveTool(
  tool: "cmake" | "ninja",
  logger: CppxLogger
): Promise<string> {
  return installArchiveToolFromSource(tool, STATIC_ARCHIVE_TOOL_SOURCES[tool], logger);
}

async function installCxxCompiler(logger: CppxLogger): Promise<string> {
  const source = await resolveLatestCxxSource(logger);
  return installArchiveToolFromSource("cxx", source, logger);
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function inferCompilerFamily(executable: string): CompilerFamily {
  return path.basename(executable).toLowerCase() === "cl.exe" ? "msvc" : "mingw";
}

async function installMsvcCompiler(
  logger: CppxLogger,
  preferredInstallationPath?: string
): Promise<{ executable: string; baseEnv: NodeJS.ProcessEnv }> {
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
  await registerTool("cxx", msvc.installationPath, msvc.clPath, `msvc-${version}`);
  logger.success("install-tools", `cxx 설치됨: ${msvc.clPath} (MSVC)`);
  return {
    executable: msvc.clPath,
    baseEnv
  };
}

async function installVcpkg(logger: CppxLogger): Promise<string> {
  const tool = "vcpkg";
  const toolRoot = getToolRoot(tool);
  const vcpkgExe = path.join(toolRoot, "vcpkg.exe");

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
            "https://github.com/microsoft/vcpkg.git",
            toolRoot
          ]
        },
        logger
      );
    }
  } else {
    await runSpawn(
      {
        action: "install-tools",
        command: "git",
        args: ["pull", "--ff-only"],
        cwd: toolRoot
      },
      logger
    );
  }

  if (!(await pathExists(vcpkgExe))) {
    await runSpawn(
      {
        action: "install-tools",
        command: "cmd.exe",
        args: ["/d", "/s", "/c", "bootstrap-vcpkg.bat -disableMetrics"],
        cwd: toolRoot
      },
      logger
    );
  }

  if (!(await pathExists(vcpkgExe))) {
    throw new CppxError("vcpkg bootstrap이 끝났지만 vcpkg.exe를 찾지 못했습니다");
  }

  await registerTool("vcpkg", toolRoot, vcpkgExe, "rolling");
  logger.success("install-tools", `vcpkg 설치됨: ${vcpkgExe}`);
  return vcpkgExe;
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
  compilerPreference: CompilerPreference = "mingw",
  msvcInstallationPath?: string
): Promise<Toolchain> {
  await ensureCppxLayout();

  let cmake: string | undefined;
  let ninja: string | undefined;
  let vcpkg: string | undefined;
  let cxx: string | undefined;
  let compilerFamily: CompilerFamily = "mingw";
  let baseEnv: NodeJS.ProcessEnv | undefined;
  const errors: string[] = [];

  try {
    cmake = await installStaticArchiveTool("cmake", logger);
  } catch (error) {
    errors.push(formatInstallError("cmake", error));
  }

  try {
    ninja = await installStaticArchiveTool("ninja", logger);
  } catch (error) {
    errors.push(formatInstallError("ninja", error));
  }

  try {
    vcpkg = await installVcpkg(logger);
  } catch (error) {
    errors.push(formatInstallError("vcpkg", error));
  }

  if (compilerPreference === "msvc") {
    logger.info("install-tools", "MSVC 컴파일러 사용을 시도합니다.");
    try {
      const installed = await installMsvcCompiler(logger, msvcInstallationPath);
      cxx = installed.executable;
      baseEnv = installed.baseEnv;
      compilerFamily = "msvc";
    } catch (error) {
      errors.push(formatInstallError("cxx", error));
    }
  } else {
    logger.info("install-tools", "llvm-mingw 기반 C++ 컴파일러를 설치합니다.");
    try {
      cxx = await installCxxCompiler(logger);
      compilerFamily = "mingw";
    } catch (error) {
      errors.push(formatInstallError("cxx", error));
    }
  }

  if (!cmake || !ninja || !vcpkg || !cxx) {
    const details =
      errors.length > 0
        ? errors.join(" | ")
        : "필수 도구 중 하나 이상이 설치되지 않았습니다.";
    throw new CppxError("도구 설치가 완료되지 않았습니다", details);
  }

  const envPath = Array.from(
    new Set([
      path.dirname(cmake),
      path.dirname(ninja),
      path.dirname(vcpkg),
      path.dirname(cxx)
    ])
  );

  await cleanupDownloadsCache(logger);

  return { cmake, ninja, vcpkg, cxx, envPath, compilerFamily, baseEnv };
}

async function resolveToolExecutable(tool: ToolName): Promise<string | null> {
  const manifest = await readToolManifest();
  const recordedExecutable = manifest.tools[tool]?.executable;
  if (
    typeof recordedExecutable === "string" &&
    recordedExecutable.trim().length > 0 &&
    (await pathExists(recordedExecutable))
  ) {
    return recordedExecutable;
  }

  const toolRoot = getToolRoot(tool);
  if (!(await pathExists(toolRoot))) {
    return null;
  }

  const candidates = EXECUTABLE_CANDIDATES_BY_TOOL[tool];
  for (const candidate of candidates) {
    const found = await findFileRecursive(toolRoot, candidate);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function getToolStatus(): Promise<ToolStatus> {
  await ensureCppxLayout();

  const [cmake, ninja, vcpkg, cxx] = await Promise.all([
    resolveToolExecutable("cmake"),
    resolveToolExecutable("ninja"),
    resolveToolExecutable("vcpkg"),
    resolveToolExecutable("cxx")
  ]);

  return {
    cmake: Boolean(cmake),
    ninja: Boolean(ninja),
    vcpkg: Boolean(vcpkg),
    cxx: Boolean(cxx)
  };
}

export async function resolveToolchainOrThrow(
  logger: CppxLogger
): Promise<Toolchain> {
  await ensureCppxLayout();
  const manifest = await readToolManifest();

  const [cmake, ninja, vcpkg, cxxResolved] = await Promise.all([
    resolveToolExecutable("cmake"),
    resolveToolExecutable("ninja"),
    resolveToolExecutable("vcpkg"),
    resolveToolExecutable("cxx")
  ]);

  const missing: string[] = [];
  if (!cmake) missing.push("cmake");
  if (!ninja) missing.push("ninja");
  if (!vcpkg) missing.push("vcpkg");
  if (!cxxResolved) missing.push("cxx-compiler");

  if (missing.length > 0) {
    throw new CppxError(
      `누락된 도구: ${missing.join(", ")}. 먼저 install-tools를 실행하세요.`
    );
  }

  if (!cmake || !ninja || !vcpkg || !cxxResolved) {
    throw new CppxError("도구 확인 중 예기치 않은 오류가 발생했습니다.");
  }

  let cxx = cxxResolved;
  let compilerFamily = inferCompilerFamily(cxxResolved);
  let baseEnv: NodeJS.ProcessEnv | undefined;

  if (compilerFamily === "msvc") {
    const preferredInstallationPath =
      manifest.tools.cxx?.root ?? inferMsvcInstallationPathFromCl(cxxResolved) ?? undefined;
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
      path.dirname(cmake),
      path.dirname(ninja),
      path.dirname(vcpkg),
      path.dirname(cxx)
    ])
  );

  logger.info("system", `사용 중인 toolchain 루트: ${path.dirname(vcpkg)}`);
  return { cmake, ninja, vcpkg, cxx, envPath, compilerFamily, baseEnv };
}




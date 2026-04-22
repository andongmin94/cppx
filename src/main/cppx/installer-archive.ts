import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ToolLifecycleProvider, ToolOwnership } from "@shared/contracts";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { ensureDir, findFileRecursive, pathExists } from "./fs-utils";
import { inferProviderFromSourceKind } from "./host-support";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import {
  getDownloadsRoot,
  getToolRoot,
  readToolManifest,
  upsertToolRecord
} from "./paths";
import { DEFAULT_TOOL_VERSION_TOKEN } from "./tool-catalog";
import type {
  CompilerFamily,
  ToolCatalogEntry,
  ToolName,
  ToolRecord,
  ToolSourceKind
} from "./types";

const hostAdapter = getHostAdapter();

export interface ArchiveToolSource {
  version: string;
  urls: string[];
  sha256?: string;
  executable: string;
  archiveFileName?: string;
  sourceKind: ToolSourceKind;
  requestedVersion: string;
  catalogId?: string;
  compilerFamily?: CompilerFamily;
}

export interface ArchiveInstallResult {
  name: ToolName;
  executable: string;
  root: string;
  version: string;
  mode: "managed";
  sourceKind: ToolSourceKind;
  requestedVersion: string;
  resolvedVersion: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
}

export interface ArchiveInstallOptions {
  afterExtract?: (toolRoot: string) => Promise<void>;
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

function getHostArchLabel(): string {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
}

function getGitHubApiHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "cppx",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

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

export function shouldReuseManagedArchiveTool(
  existingRecord: ToolRecord | undefined,
  source: ArchiveToolSource
): boolean {
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

function sanitizeVersionToken(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

const SUPPORTED_ARCHIVE_EXTENSIONS = [
  ".zip",
  ".tar.gz",
  ".tgz",
  ".tar.xz",
  ".tar.bz2"
] as const;

function hasSupportedArchiveExtension(fileName: string): boolean {
  const lowered = fileName.toLowerCase();
  return SUPPORTED_ARCHIVE_EXTENSIONS.some((extension) => lowered.endsWith(extension));
}

export function inferArchiveCacheName(tool: ToolName, source: ArchiveToolSource): string {
  if (source.archiveFileName?.trim()) {
    return source.archiveFileName.trim();
  }

  for (const url of source.urls) {
    try {
      const name = path.basename(new URL(url).pathname);
      if (hasSupportedArchiveExtension(name)) {
        return name;
      }
    } catch {
      // Ignore malformed download URLs and continue to the next candidate.
    }
  }

  return `${tool}-${sanitizeVersionToken(source.version)}.zip`;
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
    await pipeline(Readable.fromWeb(response.body as never), fileStream);
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

function matchesRequestedReleaseVersion(releaseTag: string, requestedVersion: string): boolean {
  if (requestedVersion === "latest" || requestedVersion === DEFAULT_TOOL_VERSION_TOKEN) {
    return true;
  }

  return (
    sanitizeVersionToken(releaseTag) === sanitizeVersionToken(requestedVersion) ||
    releaseTag.trim() === requestedVersion.trim()
  );
}

export async function resolveGitHubReleaseArchiveSource(
  entry: ToolCatalogEntry,
  requestedVersion: string,
  logger: CppxLogger,
  options: {
    subject: string;
    missingAssetMessage: string;
    compilerFamily?: CompilerFamily;
  }
): Promise<ArchiveToolSource> {
  if (!entry.repoUrl || !entry.assetPatterns || entry.assetPatterns.length === 0) {
    throw new CppxError(`${options.subject} catalog 설정이 올바르지 않습니다.`);
  }

  logger.info("install-tools", `GitHub 릴리스에서 ${options.subject} 패키지 조회 중`);

  const response = await fetch(entry.repoUrl, { headers: getGitHubApiHeaders() });
  if (!response.ok) {
    throw new CppxError(
      `${options.subject} 릴리스 메타데이터를 조회할 수 없습니다`,
      `HTTP status: ${response.status}`
    );
  }

  const assetPatterns = entry.assetPatterns.map((pattern) => new RegExp(pattern, "i"));
  const releases = (await response.json()) as GitHubRelease[];
  for (const release of releases) {
    if (release.draft || !matchesRequestedReleaseVersion(release.tag_name, requestedVersion)) {
      continue;
    }

    const selected = assetPatterns
      .map((pattern) => release.assets.find((asset) => pattern.test(asset.name)))
      .find((asset) => asset !== undefined);
    if (!selected) {
      continue;
    }

    const sha256 = normalizeSha256Digest(selected.digest);
    if (!sha256) {
      throw new CppxError(
        `${options.subject} 릴리스 에셋에 검증 가능한 SHA-256 정보가 없습니다.`,
        selected.name
      );
    }

    logger.info(
      "install-tools",
      `${options.subject} 릴리스 사용: ${release.tag_name} (${selected.name})`
    );
    return {
      version: sanitizeVersionToken(release.tag_name),
      urls: [selected.browser_download_url],
      sha256,
      executable: entry.executable,
      archiveFileName: selected.name,
      sourceKind: entry.sourceKind,
      requestedVersion,
      catalogId: entry.id,
      compilerFamily: options.compilerFamily
    };
  }

  throw new CppxError(options.missingAssetMessage, `requested=${requestedVersion}`);
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

async function registerTool(record: ArchiveInstallResult): Promise<void> {
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

export async function installArchiveToolFromSource(
  tool: ToolName,
  source: ArchiveToolSource,
  logger: CppxLogger,
  options: ArchiveInstallOptions = {}
): Promise<ArchiveInstallResult> {
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
      const record: ArchiveInstallResult = {
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
        verifiedSha256: existingRecord?.verifiedSha256 ?? normalizedSha256,
        provider:
          existingRecord?.provider ??
          inferProviderFromSourceKind(existingRecord?.sourceKind ?? source.sourceKind),
        ownership: existingRecord?.ownership ?? "cppx"
      };
      await registerTool(record);
      return record;
    }

    logger.info("install-tools", `${tool} 버전 정책이 변경되어 기존 설치를 다시 배치합니다.`);
    await fs.rm(toolRoot, { recursive: true, force: true });
    await ensureDir(toolRoot);
  }

  const archivePath = path.join(getDownloadsRoot(), inferArchiveCacheName(tool, source));

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
  await options.afterExtract?.(toolRoot);
  const executable = await findFileRecursive(toolRoot, source.executable);
  if (!executable) {
    throw new CppxError(
      `${tool} 설치 후 ${source.executable}을(를) 찾을 수 없습니다`
    );
  }

  const record: ArchiveInstallResult = {
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
    verifiedSha256: normalizedSha256,
    provider: inferProviderFromSourceKind(source.sourceKind),
    ownership: "cppx"
  };
  await registerTool(record);
  logger.success("install-tools", `${tool} 설치됨: ${executable}`);
  return record;
}

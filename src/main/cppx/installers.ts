import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ToolStatus } from "@shared/contracts";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { ensureDir, findFileRecursive, pathExists } from "./fs-utils";
import type { CppxLogger } from "./logger";
import {
  ensureCppxLayout,
  getDownloadsRoot,
  getToolRoot,
  upsertToolRecord
} from "./paths";
import type { ToolName, Toolchain } from "./types";

interface ArchiveToolSource {
  version: string;
  url: string;
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

const STATIC_ARCHIVE_TOOL_SOURCES: Record<"cmake" | "ninja", ArchiveToolSource> = {
  cmake: {
    version: "3.30.5",
    url: "https://github.com/Kitware/CMake/releases/download/v3.30.5/cmake-3.30.5-windows-x86_64.zip",
    executable: "cmake.exe"
  },
  ninja: {
    version: "1.12.1",
    url: "https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip",
    executable: "ninja.exe"
  }
};

const EXECUTABLE_BY_TOOL: Record<ToolName, string> = {
  cmake: "cmake.exe",
  ninja: "ninja.exe",
  vcpkg: "vcpkg.exe",
  clangd: "clangd.exe",
  cxx: "clang++.exe"
};

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "cppx"
};

function sanitizeVersionToken(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
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

async function resolveLatestClangdSource(
  logger: CppxLogger
): Promise<ArchiveToolSource> {
  logger.info("install-tools", "GitHub 릴리스에서 clangd Windows 패키지 조회 중");

  const response = await fetch(
    "https://api.github.com/repos/clangd/clangd/releases?per_page=30",
    {
      headers: GITHUB_API_HEADERS
    }
  );

  if (!response.ok) {
    throw new CppxError(
      "clangd 릴리스 메타데이터를 조회할 수 없습니다",
      `HTTP status: ${response.status}`
    );
  }

  const releases = (await response.json()) as GitHubRelease[];
  for (const release of releases) {
    if (release.draft) {
      continue;
    }

    const windowsAsset = release.assets.find((asset) =>
      /^clangd-windows-.*\.zip$/i.test(asset.name)
    );

    if (windowsAsset) {
      logger.info(
        "install-tools",
        `clangd 릴리스 사용: ${release.tag_name} (${windowsAsset.name})`
      );
      return {
        version: sanitizeVersionToken(release.tag_name),
        url: windowsAsset.browser_download_url,
        executable: "clangd.exe"
      };
    }
  }

  throw new CppxError("다운로드 가능한 clangd Windows zip 에셋을 찾지 못했습니다");
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
        url: selected.browser_download_url,
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
    await downloadFile(source.url, archivePath, logger);
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

async function installClangd(logger: CppxLogger): Promise<string> {
  const source = await resolveLatestClangdSource(logger);
  return installArchiveToolFromSource("clangd", source, logger);
}

async function installCxxCompiler(logger: CppxLogger): Promise<string> {
  const source = await resolveLatestCxxSource(logger);
  return installArchiveToolFromSource("cxx", source, logger);
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

export async function installAllTools(logger: CppxLogger): Promise<Toolchain> {
  await ensureCppxLayout();

  let cmake: string | undefined;
  let ninja: string | undefined;
  let vcpkg: string | undefined;
  let clangd: string | undefined;
  let cxx: string | undefined;
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

  try {
    clangd = await installClangd(logger);
  } catch (error) {
    errors.push(formatInstallError("clangd", error));
  }

  try {
    cxx = await installCxxCompiler(logger);
  } catch (error) {
    errors.push(formatInstallError("cxx", error));
  }

  if (!cmake || !ninja || !vcpkg || !clangd || !cxx) {
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
      path.dirname(clangd),
      path.dirname(cxx)
    ])
  );

  return { cmake, ninja, vcpkg, clangd, cxx, envPath };
}

async function resolveToolExecutable(tool: ToolName): Promise<string | null> {
  const toolRoot = getToolRoot(tool);
  if (!(await pathExists(toolRoot))) {
    return null;
  }

  return findFileRecursive(toolRoot, EXECUTABLE_BY_TOOL[tool]);
}

export async function getToolStatus(): Promise<ToolStatus> {
  const [cmake, ninja, vcpkg, clangd, cxx] = await Promise.all([
    resolveToolExecutable("cmake"),
    resolveToolExecutable("ninja"),
    resolveToolExecutable("vcpkg"),
    resolveToolExecutable("clangd"),
    resolveToolExecutable("cxx")
  ]);

  return {
    cmake: Boolean(cmake),
    ninja: Boolean(ninja),
    vcpkg: Boolean(vcpkg),
    clangd: Boolean(clangd),
    cxx: Boolean(cxx)
  };
}

export async function resolveToolchainOrThrow(
  logger: CppxLogger
): Promise<Toolchain> {
  await ensureCppxLayout();

  const [cmake, ninja, vcpkg, clangd, cxx] = await Promise.all([
    resolveToolExecutable("cmake"),
    resolveToolExecutable("ninja"),
    resolveToolExecutable("vcpkg"),
    resolveToolExecutable("clangd"),
    resolveToolExecutable("cxx")
  ]);

  const missing: string[] = [];
  if (!cmake) missing.push("cmake");
  if (!ninja) missing.push("ninja");
  if (!vcpkg) missing.push("vcpkg");
  if (!clangd) missing.push("clangd");
  if (!cxx) missing.push("cxx-compiler");

  if (missing.length > 0) {
    throw new CppxError(
      `누락된 도구: ${missing.join(", ")}. 먼저 install-tools를 실행하세요.`
    );
  }

  if (!cmake || !ninja || !vcpkg || !clangd || !cxx) {
    throw new CppxError("도구 확인 중 예기치 않은 오류가 발생했습니다.");
  }

  const envPath = Array.from(
    new Set([
      path.dirname(cmake),
      path.dirname(ninja),
      path.dirname(vcpkg),
      path.dirname(clangd),
      path.dirname(cxx)
    ])
  );

  logger.info("system", `사용 중인 toolchain 루트: ${path.dirname(vcpkg)}`);
  return { cmake, ninja, vcpkg, clangd, cxx, envPath };
}


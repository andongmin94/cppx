import { CppxError } from "./errors";
import { createHostAdapter } from "./platform";
import type { CompilerFamily, ToolCatalogEntry, ToolName } from "./types";

export const DEFAULT_TOOL_VERSION_TOKEN = "default";
export const LATEST_TOOL_VERSION_TOKEN = "latest";

function getHostArchLabel(): "x64" | "arm64" {
  return process.arch === "arm64" ? "arm64" : "x64";
}

function getExecutableName(platform: ToolCatalogEntry["platform"], baseName: string): string {
  return createHostAdapter(platform).getExecutableName(baseName);
}

const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: "cmake-3.30.5-windows-x64",
    tool: "cmake",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("win32", "cmake"),
    version: "3.30.5",
    sha256: "5ab6e1faf20256ee4f04886597e8b6c3b1bd1297b58a68a58511af013710004b",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v3.30.5/cmake-3.30.5-windows-x86_64.zip",
      "https://cmake.org/files/v3.30/cmake-3.30.5-windows-x86_64.zip"
    ]
  },
  {
    id: "ninja-1.12.1-windows-x64",
    tool: "ninja",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("win32", "ninja"),
    version: "1.12.1",
    sha256: "f550fec705b6d6ff58f2db3c374c2277a37691678d6aba463adcbb129108467a",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip"]
  },
  {
    id: "vcpkg-2026.03.18-windows-x64",
    tool: "vcpkg",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("win32", "vcpkg"),
    version: "2026.03.18",
    sha256: "528ff8708702e296b5744d9168c3fb4343c015fa024cd3770ede8ac94d9971b9",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.03.18",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.03.18.zip"
    ]
  },
  {
    id: "vcpkg-2026.02.27-windows-x64",
    tool: "vcpkg",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("win32", "vcpkg"),
    version: "2026.02.27",
    sha256: "792b608bb511d350cbb5cb6175728f98490370b3ed45327b90b5a922cdde6094",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.02.27",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.02.27.zip"
    ]
  },
  {
    id: "llvm-mingw-latest-windows-x64",
    tool: "cxx",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-github-release",
    executable: getExecutableName("win32", "clang++"),
    repoUrl: "https://api.github.com/repos/mstorsjo/llvm-mingw/releases?per_page=20",
    assetPatterns: [
      "^llvm-mingw-.*-ucrt-x86_64\\.zip$",
      "^llvm-mingw-.*-msvcrt-x86_64\\.zip$"
    ],
    compilerFamily: "mingw"
  },
  {
    id: "vcpkg-2026.03.18-darwin-x64",
    tool: "vcpkg",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "vcpkg"),
    version: "2026.03.18",
    sha256: "528ff8708702e296b5744d9168c3fb4343c015fa024cd3770ede8ac94d9971b9",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.03.18",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.03.18.zip"
    ]
  },
  {
    id: "vcpkg-2026.03.18-darwin-arm64",
    tool: "vcpkg",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "vcpkg"),
    version: "2026.03.18",
    sha256: "528ff8708702e296b5744d9168c3fb4343c015fa024cd3770ede8ac94d9971b9",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.03.18",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.03.18.zip"
    ]
  },
  {
    id: "vcpkg-2026.02.27-darwin-x64",
    tool: "vcpkg",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "vcpkg"),
    version: "2026.02.27",
    sha256: "792b608bb511d350cbb5cb6175728f98490370b3ed45327b90b5a922cdde6094",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.02.27",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.02.27.zip"
    ]
  },
  {
    id: "vcpkg-2026.02.27-darwin-arm64",
    tool: "vcpkg",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "vcpkg"),
    version: "2026.02.27",
    sha256: "792b608bb511d350cbb5cb6175728f98490370b3ed45327b90b5a922cdde6094",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.02.27",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.02.27.zip"
    ]
  }
];

function compareVersionDesc(left?: string, right?: string): number {
  const leftParts = (left ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const rightParts = (right ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return 0;
}

export function getToolCatalogEntries(
  tool: ToolName,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry[] {
  const arch = getHostArchLabel();

  return TOOL_CATALOG
    .filter((entry) => entry.platform === process.platform)
    .filter((entry) => entry.arch === arch)
    .filter((entry) => entry.tool === tool)
    .filter((entry) => !compilerFamily || !entry.compilerFamily || entry.compilerFamily === compilerFamily)
    .sort((left, right) => compareVersionDesc(left.version, right.version));
}

export function resolveToolCatalogEntry(
  tool: ToolName,
  version: string,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry {
  const entries = getToolCatalogEntries(tool, compilerFamily);
  const fallback = entries[0];

  if (!fallback) {
    throw new CppxError(`현재 호스트에서 ${tool} catalog 항목을 찾지 못했습니다.`);
  }

  const normalizedVersion = version.trim().length > 0 ? version.trim() : DEFAULT_TOOL_VERSION_TOKEN;
  if (
    normalizedVersion === DEFAULT_TOOL_VERSION_TOKEN ||
    normalizedVersion === LATEST_TOOL_VERSION_TOKEN
  ) {
    return fallback;
  }

  const exact = entries.find((entry) => entry.version === normalizedVersion);
  if (exact) {
    return exact;
  }

  if (tool === "cxx") {
    return {
      ...fallback,
      version: normalizedVersion
    };
  }

  throw new CppxError(
    `${tool} exact version은 현재 catalog에 등록된 버전만 지원합니다.`,
    `requested=${normalizedVersion}`
  );
}

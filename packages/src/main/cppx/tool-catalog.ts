import { CppxError } from "./errors";
import { getHostAdapter } from "./platform";
import type { CompilerFamily, ToolCatalogEntry, ToolName } from "./types";

export const DEFAULT_TOOL_VERSION_TOKEN = "default";
export const LATEST_TOOL_VERSION_TOKEN = "latest";

const hostAdapter = getHostAdapter();

const WINDOWS_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: "cmake-3.30.5-windows-x64",
    tool: "cmake",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: hostAdapter.getExecutableName("cmake"),
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
    executable: hostAdapter.getExecutableName("ninja"),
    version: "1.12.1",
    sha256: "f550fec705b6d6ff58f2db3c374c2277a37691678d6aba463adcbb129108467a",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip"]
  },
  {
    id: "vcpkg-rolling-windows-x64",
    tool: "vcpkg",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-git",
    executable: hostAdapter.getExecutableName("vcpkg"),
    version: "rolling",
    repoUrl: "https://github.com/microsoft/vcpkg.git"
  },
  {
    id: "llvm-mingw-latest-windows-x64",
    tool: "cxx",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-github-release",
    executable: hostAdapter.getExecutableName("clang++"),
    repoUrl: "https://api.github.com/repos/mstorsjo/llvm-mingw/releases?per_page=20",
    assetPatterns: [
      "^llvm-mingw-.*-ucrt-x86_64\\.zip$",
      "^llvm-mingw-.*-msvcrt-x86_64\\.zip$"
    ],
    compilerFamily: "mingw"
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
  return WINDOWS_TOOL_CATALOG
    .filter((entry) => entry.platform === hostAdapter.platform)
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

  if (tool === "vcpkg" || tool === "cxx") {
    return {
      ...fallback,
      version: normalizedVersion
    };
  }

  throw new CppxError(
    `${tool} exact version 정책을 현재 catalog가 지원하지 않습니다.`,
    `requested=${normalizedVersion}`
  );
}

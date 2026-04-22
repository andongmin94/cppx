import { CppxError } from "./errors";
import { createHostAdapter, type HostPlatform } from "./platform";
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
    id: "conan-latest-windows-x64",
    tool: "conan",
    platform: "win32",
    arch: "x64",
    sourceKind: "catalog-github-release",
    executable: getExecutableName("win32", "conan"),
    repoUrl: "https://api.github.com/repos/conan-io/conan/releases?per_page=20",
    assetPatterns: ["^conan-.*-windows-x86_64\\.zip$"]
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
  },
  {
    id: "cmake-4.3.0-darwin-x64",
    tool: "cmake",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "cmake"),
    version: "4.3.0",
    sha256: "5bd933daf6e9234a53a9a43092746993870d9f162b6c399fd6e4a05cdd475e67",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.3.0/cmake-4.3.0-macos-universal.tar.gz",
      "https://cmake.org/files/v4.3/cmake-4.3.0-macos-universal.tar.gz"
    ]
  },
  {
    id: "cmake-4.2.3-darwin-x64",
    tool: "cmake",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "cmake"),
    version: "4.2.3",
    sha256: "c2302d3e9c48daabee5ea7c4db4b2b93b989bcc89dae8b760880e00120641b5b",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.2.3/cmake-4.2.3-macos-universal.tar.gz",
      "https://cmake.org/files/v4.2/cmake-4.2.3-macos-universal.tar.gz"
    ]
  },
  {
    id: "cmake-4.3.0-darwin-arm64",
    tool: "cmake",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "cmake"),
    version: "4.3.0",
    sha256: "5bd933daf6e9234a53a9a43092746993870d9f162b6c399fd6e4a05cdd475e67",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.3.0/cmake-4.3.0-macos-universal.tar.gz",
      "https://cmake.org/files/v4.3/cmake-4.3.0-macos-universal.tar.gz"
    ]
  },
  {
    id: "cmake-4.2.3-darwin-arm64",
    tool: "cmake",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "cmake"),
    version: "4.2.3",
    sha256: "c2302d3e9c48daabee5ea7c4db4b2b93b989bcc89dae8b760880e00120641b5b",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.2.3/cmake-4.2.3-macos-universal.tar.gz",
      "https://cmake.org/files/v4.2/cmake-4.2.3-macos-universal.tar.gz"
    ]
  },
  {
    id: "ninja-1.12.1-darwin-x64",
    tool: "ninja",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "ninja"),
    version: "1.12.1",
    sha256: "89a287444b5b3e98f88a945afa50ce937b8ffd1dcc59c555ad9b1baf855298c9",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-mac.zip"]
  },
  {
    id: "ninja-1.11.1-darwin-x64",
    tool: "ninja",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "ninja"),
    version: "1.11.1",
    sha256: "482ecb23c59ae3d4f158029112de172dd96bb0e97549c4b1ca32d8fad11f873e",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.11.1/ninja-mac.zip"]
  },
  {
    id: "ninja-1.12.1-darwin-arm64",
    tool: "ninja",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("darwin", "ninja"),
    version: "1.12.1",
    sha256: "89a287444b5b3e98f88a945afa50ce937b8ffd1dcc59c555ad9b1baf855298c9",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-mac.zip"]
  },
  {
    id: "conan-latest-darwin-x64",
    tool: "conan",
    platform: "darwin",
    arch: "x64",
    sourceKind: "catalog-github-release",
    executable: getExecutableName("darwin", "conan"),
    repoUrl: "https://api.github.com/repos/conan-io/conan/releases?per_page=20",
    assetPatterns: ["^conan-.*-macos-x86_64\\.tgz$"]
  },
  {
    id: "conan-latest-darwin-arm64",
    tool: "conan",
    platform: "darwin",
    arch: "arm64",
    sourceKind: "catalog-github-release",
    executable: getExecutableName("darwin", "conan"),
    repoUrl: "https://api.github.com/repos/conan-io/conan/releases?per_page=20",
    assetPatterns: ["^conan-.*-macos-arm64\\.tgz$"]
  },
  {
    id: "vcpkg-2026.03.18-linux-x64",
    tool: "vcpkg",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "vcpkg"),
    version: "2026.03.18",
    sha256: "528ff8708702e296b5744d9168c3fb4343c015fa024cd3770ede8ac94d9971b9",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.03.18",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.03.18.zip"
    ]
  },
  {
    id: "vcpkg-2026.03.18-linux-arm64",
    tool: "vcpkg",
    platform: "linux",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "vcpkg"),
    version: "2026.03.18",
    sha256: "528ff8708702e296b5744d9168c3fb4343c015fa024cd3770ede8ac94d9971b9",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.03.18",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.03.18.zip"
    ]
  },
  {
    id: "vcpkg-2026.02.27-linux-x64",
    tool: "vcpkg",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "vcpkg"),
    version: "2026.02.27",
    sha256: "792b608bb511d350cbb5cb6175728f98490370b3ed45327b90b5a922cdde6094",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.02.27",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.02.27.zip"
    ]
  },
  {
    id: "vcpkg-2026.02.27-linux-arm64",
    tool: "vcpkg",
    platform: "linux",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "vcpkg"),
    version: "2026.02.27",
    sha256: "792b608bb511d350cbb5cb6175728f98490370b3ed45327b90b5a922cdde6094",
    urls: [
      "https://codeload.github.com/microsoft/vcpkg/zip/refs/tags/2026.02.27",
      "https://github.com/microsoft/vcpkg/archive/refs/tags/2026.02.27.zip"
    ]
  },
  {
    id: "cmake-4.3.0-linux-x64",
    tool: "cmake",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "cmake"),
    version: "4.3.0",
    sha256: "201bdabe17a54e017f119cffa247648e9c44327e52473c2cc60a88fded94652a",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.3.0/cmake-4.3.0-linux-x86_64.tar.gz",
      "https://cmake.org/files/v4.3/cmake-4.3.0-linux-x86_64.tar.gz"
    ]
  },
  {
    id: "cmake-4.2.3-linux-x64",
    tool: "cmake",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "cmake"),
    version: "4.2.3",
    sha256: "5bb505d5e0cca0480a330f7f27ccf52c2b8b5214c5bba97df08899f5ef650c23",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.2.3/cmake-4.2.3-linux-x86_64.tar.gz",
      "https://cmake.org/files/v4.2/cmake-4.2.3-linux-x86_64.tar.gz"
    ]
  },
  {
    id: "ninja-1.12.1-linux-x64",
    tool: "ninja",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "ninja"),
    version: "1.12.1",
    sha256: "6f98805688d19672bd699fbbfa2c2cf0fc054ac3df1f0e6a47664d963d530255",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux.zip"]
  },
  {
    id: "ninja-1.11.1-linux-x64",
    tool: "ninja",
    platform: "linux",
    arch: "x64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "ninja"),
    version: "1.11.1",
    sha256: "b901ba96e486dce377f9a070ed4ef3f79deb45f4ffe2938f8e7ddc69cfb3df77",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.11.1/ninja-linux.zip"]
  },
  {
    id: "cmake-4.3.0-linux-arm64",
    tool: "cmake",
    platform: "linux",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "cmake"),
    version: "4.3.0",
    sha256: "26fe3011f497eb9398115dcabcc094685e634b1841f7c01dc01c5a89b8b0ea0d",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.3.0/cmake-4.3.0-linux-aarch64.tar.gz",
      "https://cmake.org/files/v4.3/cmake-4.3.0-linux-aarch64.tar.gz"
    ]
  },
  {
    id: "cmake-4.2.3-linux-arm64",
    tool: "cmake",
    platform: "linux",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "cmake"),
    version: "4.2.3",
    sha256: "e529c75f18f27ba27c52b329efe7b1f98dc32ccc0c6d193c7ab343f888962672",
    urls: [
      "https://github.com/Kitware/CMake/releases/download/v4.2.3/cmake-4.2.3-linux-aarch64.tar.gz",
      "https://cmake.org/files/v4.2/cmake-4.2.3-linux-aarch64.tar.gz"
    ]
  },
  {
    id: "ninja-1.12.1-linux-arm64",
    tool: "ninja",
    platform: "linux",
    arch: "arm64",
    sourceKind: "catalog-archive",
    executable: getExecutableName("linux", "ninja"),
    version: "1.12.1",
    sha256: "5c25c6570b0155e95fce5918cb95f1ad9870df5768653afe128db822301a05a1",
    urls: ["https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux-aarch64.zip"]
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

export function getToolCatalogEntriesForTarget(
  platform: HostPlatform,
  arch: "x64" | "arm64",
  tool: ToolName,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry[] {
  return TOOL_CATALOG
    .filter((entry) => entry.platform === platform)
    .filter((entry) => entry.arch === arch)
    .filter((entry) => entry.tool === tool)
    .filter((entry) => !compilerFamily || !entry.compilerFamily || entry.compilerFamily === compilerFamily)
    .sort((left, right) => compareVersionDesc(left.version, right.version));
}

export function getToolCatalogEntries(
  tool: ToolName,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry[] {
  return getToolCatalogEntriesForTarget(
    process.platform as HostPlatform,
    getHostArchLabel(),
    tool,
    compilerFamily
  );
}

export function resolveToolCatalogEntryForTarget(
  platform: HostPlatform,
  arch: "x64" | "arm64",
  tool: ToolName,
  version: string,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry {
  const entries = getToolCatalogEntriesForTarget(platform, arch, tool, compilerFamily);
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

  if (fallback.sourceKind === "catalog-github-release") {
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

export function resolveToolCatalogEntry(
  tool: ToolName,
  version: string,
  compilerFamily?: CompilerFamily
): ToolCatalogEntry {
  return resolveToolCatalogEntryForTarget(
    process.platform as HostPlatform,
    getHostArchLabel(),
    tool,
    version,
    compilerFamily
  );
}

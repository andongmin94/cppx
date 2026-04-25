import type {
  CompilerPreference,
  DependencyBackend,
  HostSupportPayload,
  HostPlatformPayload,
  ToolInstallMode,
  ToolStatusDetail
} from "@shared/contracts";
import {
  formatLifecycleSummary,
  formatLifecycleVersionSupport,
  getToolOwnershipLabel,
  getVersionSourceLabel
} from "@shared/tooling-display";

export type InstallToolKey = "cmake" | "ninja" | "vcpkg" | "conan" | "cxx";
export type EditableToolId = InstallToolKey;
export type InstallProgressStatus = "idle" | "running" | "success" | "error";

export interface InstallToolProgress {
  percent: number;
  status: InstallProgressStatus;
}

export const INSTALL_TOOL_ORDER: InstallToolKey[] = ["cmake", "ninja", "vcpkg", "conan", "cxx"];
export const EDITABLE_TOOL_IDS: EditableToolId[] = ["cmake", "ninja", "vcpkg", "conan", "cxx"];
const DEFAULT_TOOL_MODE_OPTIONS: { value: ToolInstallMode; label: string }[] = [
  { value: "managed", label: "managed" },
  { value: "system", label: "system" }
];
export const toolLabels: Record<EditableToolId, string> = {
  cmake: "CMake",
  ninja: "Ninja",
  vcpkg: "vcpkg",
  conan: "conan",
  cxx: "C++"
};

export function getDefaultCompilerPreference(
  platform: HostPlatformPayload
): CompilerPreference {
  return platform === "win32" ? "mingw" : "clang";
}

export function supportsExactManagedCxxVersion(
  platform: HostPlatformPayload,
  compilerPreference: CompilerPreference
): boolean {
  return platform === "win32" && compilerPreference === "mingw";
}

export function supportsMsvcInstallationPath(
  platform: HostPlatformPayload,
  compilerPreference: CompilerPreference | undefined
): boolean {
  return platform === "win32" && compilerPreference === "msvc";
}

export function getCxxVersionPlaceholder(
  platform: HostPlatformPayload,
  compilerPreference: CompilerPreference
): string {
  return supportsExactManagedCxxVersion(platform, compilerPreference)
    ? "default / latest / exact"
    : "latest / default";
}

export function getTargetTripletPlaceholder(platform: HostPlatformPayload): string {
  switch (platform) {
    case "win32":
      return "x64-mingw-dynamic / x64-windows";
    case "darwin":
      return "arm64-osx / x64-osx";
    default:
      return "arm64-linux / x64-linux";
  }
}

export function getDependencyBackendValue(
  configuredBackend: DependencyBackend | undefined,
  hostDefaultBackend: DependencyBackend
): DependencyBackend {
  return configuredBackend ?? hostDefaultBackend;
}

export function getToolModeOptions(
  hostSupport: Pick<HostSupportPayload, "tier">,
  currentMode: ToolInstallMode | undefined
): Array<{ value: ToolInstallMode; label: string }> {
  if (hostSupport.tier === "unsupported") {
    return currentMode
      ? [{ value: currentMode, label: `${currentMode} (unsupported)` }]
      : [];
  }

  const options =
    hostSupport.tier === "best-effort"
      ? DEFAULT_TOOL_MODE_OPTIONS.filter((option) => option.value === "system")
      : DEFAULT_TOOL_MODE_OPTIONS;

  if (currentMode && !options.some((option) => option.value === currentMode)) {
    return [...options, { value: currentMode, label: `${currentMode} (legacy)` }];
  }

  return options;
}

export function getWindowsConanCompilerGuidance(
  platform: HostPlatformPayload,
  dependencyBackend: DependencyBackend,
  compilerPreference: CompilerPreference
): string | null {
  if (
    platform === "win32" &&
    dependencyBackend === "conan" &&
    compilerPreference === "mingw"
  ) {
    return "Windows에서 conan backend는 현재 system MSVC compiler path 기준으로 검증됩니다. MinGW는 none/vcpkg 경로에 더 적합합니다.";
  }

  return null;
}

export function getCxxModeGuidance(
  hostSupport: Pick<HostSupportPayload, "platform" | "tier" | "managedLifecycleReady">
): string | null {
  switch (hostSupport.platform) {
    case "darwin":
      if (hostSupport.tier === "best-effort") {
        return "이 macOS host는 best-effort system 경로만 지원합니다. C++는 PATH의 Apple Clang/clang++ 중심으로 사용하세요.";
      }
      if (!hostSupport.managedLifecycleReady) {
        return "macOS 14+ 공식 host에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있지만, managed install을 실행하려면 Homebrew가 먼저 필요합니다.";
      }
      return "macOS에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있습니다.";
    case "linux":
      if (hostSupport.tier === "unsupported") {
        return "Other Linux는 cppx 지원 대상이 아닙니다. 공식 Linux host는 Ubuntu 22.04/24.04/26.04 LTS입니다.";
      }
      if (!hostSupport.managedLifecycleReady) {
        return "Ubuntu LTS 공식 host에서는 C++를 managed(apt Clang / GCC) 또는 system(PATH의 clang++ / g++)으로 선택할 수 있지만, managed install을 실행하려면 apt-get이 먼저 필요합니다.";
      }
      return "Ubuntu LTS 공식 host에서는 C++를 managed(apt Clang / GCC) 또는 system(PATH의 clang++ / g++)으로 선택할 수 있습니다.";
    default:
      return null;
  }
}

export function getToolchainInstallGuidance(
  hostSupport: Pick<HostSupportPayload, "tier" | "managedLifecycleReady">
): string {
  if (hostSupport.tier === "unsupported") {
    return "이 host는 cppx 지원 대상이 아닙니다. Windows, macOS 14+, Ubuntu LTS 중 하나에서 실행하세요.";
  }

  if (hostSupport.tier === "best-effort") {
    return "이 host는 best-effort system 중심 경로입니다. managed install보다 system 도구 준비와 doctor 안내를 먼저 확인하세요.";
  }

  if (hostSupport.managedLifecycleReady) {
    return "도구 누락 상태에서는 install-tools를 먼저 실행하는 것이 안전합니다.";
  }

  return "이 host는 공식 지원 범위이지만 managed lifecycle prerequisite가 아직 충족되지 않았습니다. 각 툴 행의 lifecycle 안내와 doctor 출력을 확인하세요.";
}

export function getToolStatusSummary(detail: ToolStatusDetail | undefined): string | null {
  const parts = [
    detail?.ready ? detail.mode : undefined,
    detail?.provider,
    detail?.ownership ? getToolOwnershipLabel(detail.ownership) : undefined,
    detail?.ready ? detail.resolvedVersion ?? detail.requestedVersion : undefined,
    detail?.ready ? detail.sourceKind : undefined,
    detail?.capabilities ? formatLifecycleSummary(detail.capabilities) : undefined
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function getToolCapabilityNote(detail: ToolStatusDetail | undefined): string | null {
  const note = detail?.capabilities?.note?.trim();
  return note && note.length > 0 ? note : null;
}

export function getToolVersionGuidance(detail: ToolStatusDetail | undefined): string | null {
  const capabilities = detail?.capabilities;
  if (!capabilities) {
    return null;
  }

  if (!capabilities.detect) {
    return "이 host는 cppx 지원 대상이 아니므로 도구 감지를 수행하지 않습니다.";
  }

  if (
    !capabilities.install &&
    !capabilities.supportsExactPin &&
    !capabilities.supportsFloatingVersion
  ) {
    return "이 host에서는 managed 버전 선택보다 system 감지가 우선입니다.";
  }

  const parts = [
    `버전 선택: ${formatLifecycleVersionSupport(capabilities)}`,
    `버전 소스: ${getVersionSourceLabel(capabilities.versionSource)}`,
    capabilities.supportsInstanceSelection ? "instance 선택 지원" : undefined
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return parts.length > 0 ? parts.join(" · ") : null;
}

import type {
  CompilerPreference,
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
export const toolModeOptions: { value: ToolInstallMode; label: string }[] = [
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

export function getCxxModeGuidance(platform: HostPlatformPayload): string | null {
  switch (platform) {
    case "darwin":
      return "macOS에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있습니다.";
    case "linux":
      return "Ubuntu LTS 공식 host에서는 C++를 managed(apt Clang / GCC) 또는 system(PATH의 clang++ / g++)으로 선택할 수 있습니다. Other Linux는 conservative system detection 중심입니다.";
    default:
      return null;
  }
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

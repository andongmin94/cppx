import type {
  CompilerPreference,
  HostPlatformPayload,
  ToolInstallMode,
  ToolStatusDetail
} from "@shared/contracts";
import {
  formatLifecycleSummary,
  getToolOwnershipLabel
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

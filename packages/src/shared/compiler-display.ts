import type { CompilerPreference, HostPlatformPayload } from "./contracts";

type DisplayPlatform = HostPlatformPayload | NodeJS.Platform;

export function formatCompilerPreference(
  platform: DisplayPlatform,
  compilerPreference: CompilerPreference
): string {
  if (compilerPreference === "msvc") {
    return "msvc";
  }

  return platform === "win32" ? "mingw" : "native";
}

export function getCompilerPreferenceLabel(
  platform: DisplayPlatform,
  compilerPreference: CompilerPreference
): string {
  if (compilerPreference === "msvc") {
    return "MSVC";
  }

  return platform === "win32" ? "MinGW" : "Native (clang/g++)";
}

export function getCompilerPreferenceOptions(
  platform: DisplayPlatform
): Array<{ value: CompilerPreference; label: string }> {
  if (platform === "win32") {
    return [
      { value: "mingw", label: getCompilerPreferenceLabel(platform, "mingw") },
      { value: "msvc", label: "MSVC" }
    ];
  }

  return [{ value: "mingw", label: getCompilerPreferenceLabel(platform, "mingw") }];
}

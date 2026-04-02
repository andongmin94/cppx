import type { CompilerPreference, HostPlatformPayload } from "./contracts";

type DisplayPlatform = HostPlatformPayload | NodeJS.Platform;

function normalizeDisplayCompilerPreference(
  platform: DisplayPlatform,
  compilerPreference: CompilerPreference
): CompilerPreference {
  if (compilerPreference === "msvc") {
    return "msvc";
  }

  if (compilerPreference === "mingw") {
    return platform === "win32" ? "mingw" : "clang";
  }

  if (compilerPreference === "gcc") {
    return platform === "linux" ? "gcc" : "clang";
  }

  return "clang";
}

export function formatCompilerPreference(
  platform: DisplayPlatform,
  compilerPreference: CompilerPreference
): string {
  const normalized = normalizeDisplayCompilerPreference(platform, compilerPreference);

  if (normalized === "msvc") {
    return "msvc";
  }

  return normalized;
}

export function getCompilerPreferenceLabel(
  platform: DisplayPlatform,
  compilerPreference: CompilerPreference
): string {
  const normalized = normalizeDisplayCompilerPreference(platform, compilerPreference);

  if (normalized === "msvc") {
    return "MSVC";
  }

  if (normalized === "mingw") {
    return "MinGW";
  }

  return normalized === "gcc" ? "GCC" : "Clang";
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

  if (platform === "linux") {
    return [
      { value: "clang", label: getCompilerPreferenceLabel(platform, "clang") },
      { value: "gcc", label: getCompilerPreferenceLabel(platform, "gcc") }
    ];
  }

  return [{ value: "clang", label: getCompilerPreferenceLabel(platform, "clang") }];
}

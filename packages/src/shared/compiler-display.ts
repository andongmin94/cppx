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

  return normalized === "mingw" ? "MinGW" : "Clang";
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

  return [{ value: "clang", label: getCompilerPreferenceLabel(platform, "clang") }];
}

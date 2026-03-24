import type { HostAdapter, HostPlatform } from "./types";
import { windowsHostAdapter, getWindowsAppDataRoot } from "./windows";
import { darwinHostAdapter, linuxHostAdapter } from "./posix";
import { createUnsupportedHostAdapter } from "./unsupported";

export type { HostAdapter, HostCommand, HostPlatform, HostShellKind } from "./types";
export { getDefaultExecutableSuffix, getDefaultPathSeparator } from "./types";
export { windowsHostAdapter, getWindowsAppDataRoot } from "./windows";

export function createHostAdapter(platform: HostPlatform): HostAdapter {
  switch (platform) {
    case "win32":
      return windowsHostAdapter;
    case "darwin":
      return darwinHostAdapter;
    case "linux":
      return linuxHostAdapter;
    default:
      return createUnsupportedHostAdapter(platform);
  }
}

export function resolveHostPlatform(rawPlatform = process.platform): HostPlatform {
  if (rawPlatform === "win32" || rawPlatform === "darwin" || rawPlatform === "linux") {
    return rawPlatform;
  }

  throw new Error(`지원하지 않는 host platform: ${rawPlatform}`);
}

export function getHostAdapter(platform = resolveHostPlatform()): HostAdapter {
  return createHostAdapter(platform);
}

import type { HostAdapter, HostCommand, HostPlatform, HostScriptKind } from "./types";
import {
  getDefaultExecutableSuffix,
  getDefaultPathSeparator,
  joinWithExecutableSuffix,
  normalizePosixPath
} from "./types";
import type { ToolName } from "../types";

function makeCommand(command: string, args: string[]): HostCommand {
  return { command, args };
}

function getUnsupportedMessage(platform: HostPlatform, capability: string): string {
  return `Host adapter for ${platform} does not yet support ${capability}.`;
}

export function createUnsupportedHostAdapter(platform: Exclude<HostPlatform, "win32">): HostAdapter {
  const suffix = getDefaultExecutableSuffix(platform);

  return {
    platform,
    compilerFamily: "mingw",

    getAppDataRoot(): string {
      throw new Error(getUnsupportedMessage(platform, "app data root"));
    },

    getCppxRoot(): string {
      throw new Error(getUnsupportedMessage(platform, "cppx root"));
    },

    getDownloadsRoot(): string {
      throw new Error(getUnsupportedMessage(platform, "downloads root"));
    },

    getToolRoot(tool: ToolName): string {
      throw new Error(getUnsupportedMessage(platform, `tool root: ${tool}`));
    },

    getExecutableSuffix(): string {
      return suffix;
    },

    getExecutableName(baseName: string): string {
      return joinWithExecutableSuffix(baseName, suffix);
    },

    getBinaryName(baseName: string): string {
      return joinWithExecutableSuffix(baseName, suffix);
    },

    getCtestExecutableName(): string {
      return joinWithExecutableSuffix("ctest", suffix);
    },

    getCpackExecutableName(): string {
      return joinWithExecutableSuffix("cpack", suffix);
    },

    getPathSeparator(): string {
      return getDefaultPathSeparator(platform);
    },

    normalizePath(value: string): string {
      return normalizePosixPath(value);
    },

    comparePaths(left: string, right: string): number {
      return this.normalizePath(left).localeCompare(this.normalizePath(right));
    },

    getDefaultDependencyBackend() {
      throw new Error(getUnsupportedMessage(platform, "default dependency backend"));
    },

    getDefaultToolMode() {
      throw new Error(getUnsupportedMessage(platform, "default tool mode"));
    },

    getDefaultTargetTriplet() {
      throw new Error(getUnsupportedMessage(platform, "default target triplet"));
    },

    getCommandScriptName(baseName: string, kind: HostScriptKind): string {
      return `${baseName}.${kind}`;
    },

    getVsWherePath(): string | null {
      return null;
    },

    getShellCommand(kind: "cmd" | "powershell" | "sh"): HostCommand {
      if (kind === "sh") {
        return makeCommand("sh", ["-lc"]);
      }

      throw new Error(getUnsupportedMessage(platform, `shell command selection: ${kind}`));
    },

    getExecutableLookupCommand(): HostCommand {
      throw new Error(getUnsupportedMessage(platform, "path lookup"));
    },

    getArchiveExtractCommand(): HostCommand {
      throw new Error(getUnsupportedMessage(platform, "archive extraction"));
    },

    getVcpkgBootstrapCommand(): HostCommand {
      throw new Error(getUnsupportedMessage(platform, "vcpkg bootstrap"));
    }
  };
}

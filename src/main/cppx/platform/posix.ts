import os from "node:os";
import path from "node:path";

import type { HostAdapter, HostCommand, HostPlatform, HostScriptKind } from "./types";
import {
  compareNormalizedPaths,
  getDefaultExecutableSuffix,
  getDefaultPathSeparator,
  joinWithExecutableSuffix,
  normalizePosixPath
} from "./types";
import {
  parseLinuxOsRelease,
  readLinuxOsReleaseTextSync,
  resolveLinuxHostProfile
} from "../linux-profiles";
import type { CompilerFamily, ToolName } from "../types";

function makeCommand(command: string, args: string[]): HostCommand {
  return { command, args };
}

function quoteForSh(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function getPosixDataHome(platform: HostPlatform): string {
  if (platform === "darwin") {
    return path.join(process.env.HOME ?? os.homedir(), "Library", "Application Support");
  }

  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
}

function getNativePosixTriplet(platform: HostPlatform): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (platform === "darwin") {
    return `${arch}-osx`;
  }

  return `${arch}-linux`;
}

function isSupportedManagedLinuxHost(): boolean {
  const releaseText = readLinuxOsReleaseTextSync();
  if (!releaseText) {
    return false;
  }

  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
  return Boolean(resolveLinuxHostProfile(parseLinuxOsRelease(releaseText), arch));
}

function getDefaultManagedModeForPosixTool(
  platform: Extract<HostPlatform, "darwin" | "linux">,
  tool: ToolName
): "managed" | "system" {
  if (platform === "darwin") {
    return tool === "cxx" || tool === "cmake" || tool === "ninja" || tool === "vcpkg" || tool === "conan"
      ? "managed"
      : "system";
  }

  if (isSupportedManagedLinuxHost()) {
    return tool === "cmake" || tool === "ninja" || tool === "vcpkg" || tool === "cxx" || tool === "conan"
      ? "managed"
      : "system";
  }

  return "system";
}

function createPosixHostAdapter(platform: Extract<HostPlatform, "darwin" | "linux">): HostAdapter {
  const suffix = getDefaultExecutableSuffix(platform);

  return {
    platform,
    compilerFamily: "clang",

    getAppDataRoot(): string {
      return getPosixDataHome(platform);
    },

    getCppxRoot(): string {
      return path.join(getPosixDataHome(platform), "cppx");
    },

    getDownloadsRoot(): string {
      return path.join(this.getCppxRoot(), "downloads");
    },

    getToolRoot(tool: ToolName): string {
      return path.join(this.getCppxRoot(), tool);
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
      return normalizePosixPath(path.resolve(value));
    },

    comparePaths(left: string, right: string): number {
      return compareNormalizedPaths(this.normalizePath(left), this.normalizePath(right));
    },

    getDefaultDependencyBackend() {
      return "none";
    },

    getDefaultToolMode(tool: ToolName, _compilerFamily?: CompilerFamily) {
      return getDefaultManagedModeForPosixTool(platform, tool);
    },

    getDefaultTargetTriplet(_compilerFamily: CompilerFamily): string {
      return getNativePosixTriplet(platform);
    },

    getCommandScriptName(baseName: string, kind: HostScriptKind): string {
      return `${baseName}.${kind}`;
    },

    getVsWherePath(): string | null {
      return null;
    },

    getShellCommand(_kind: "cmd" | "powershell" | "sh"): HostCommand {
      return makeCommand("sh", ["-lc"]);
    },

    getExecutableLookupCommand(candidate: string): HostCommand {
      return makeCommand("which", ["-a", candidate]);
    },

    getArchiveExtractCommand(archivePath: string, destination: string): HostCommand {
      const quotedArchive = quoteForSh(archivePath);
      const quotedDestination = quoteForSh(destination);
      const command = archivePath.toLowerCase().endsWith(".zip")
        ? `mkdir -p ${quotedDestination} && unzip -oq ${quotedArchive} -d ${quotedDestination}`
        : `mkdir -p ${quotedDestination} && tar -xf ${quotedArchive} -C ${quotedDestination}`;
      return makeCommand("sh", ["-lc", command]);
    },

    getVcpkgBootstrapCommand(_toolRoot: string): HostCommand {
      return makeCommand("sh", ["-lc", "./bootstrap-vcpkg.sh -disableMetrics"]);
    }
  };
}

export const darwinHostAdapter = createPosixHostAdapter("darwin");
export const linuxHostAdapter = createPosixHostAdapter("linux");

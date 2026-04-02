import os from "node:os";
import path from "node:path";

import type { HostAdapter, HostCommand, HostScriptKind } from "./types";
import {
  compareNormalizedPaths,
  getDefaultExecutableSuffix,
  getDefaultPathSeparator,
  joinWithExecutableSuffix,
  normalizePosixPath
} from "./types";
import type { ToolName } from "../types";

function getProgramFilesX86Root(): string {
  return process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
}

function getLocalAppDataRoot(): string {
  return process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
}

function getAppDataRoot(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

function makeCommand(command: string, args: string[]): HostCommand {
  return { command, args };
}

function getCommandScriptName(baseName: string, kind: HostScriptKind): string {
  return `${baseName}.${kind}`;
}

function getWindowsCppxRoot(): string {
  return path.join(getLocalAppDataRoot(), "cppx");
}

export const windowsHostAdapter: HostAdapter = {
  platform: "win32",
  compilerFamily: "mingw",

  getAppDataRoot(): string {
    return getLocalAppDataRoot();
  },

  getCppxRoot(): string {
    return getWindowsCppxRoot();
  },

  getDownloadsRoot(): string {
    return path.join(getWindowsCppxRoot(), "downloads");
  },

  getToolRoot(tool: ToolName): string {
    return path.join(getWindowsCppxRoot(), tool);
  },

  getExecutableSuffix(): string {
    return getDefaultExecutableSuffix("win32");
  },

  getExecutableName(baseName: string): string {
    return joinWithExecutableSuffix(baseName, getDefaultExecutableSuffix("win32"));
  },

  getBinaryName(baseName: string): string {
    return joinWithExecutableSuffix(baseName, getDefaultExecutableSuffix("win32"));
  },

  getCtestExecutableName(): string {
    return joinWithExecutableSuffix("ctest", getDefaultExecutableSuffix("win32"));
  },

  getCpackExecutableName(): string {
    return joinWithExecutableSuffix("cpack", getDefaultExecutableSuffix("win32"));
  },

  getPathSeparator(): string {
    return getDefaultPathSeparator("win32");
  },

  normalizePath(value: string): string {
    return normalizePosixPath(value).replaceAll("/", "\\").toLowerCase();
  },

  comparePaths(left: string, right: string): number {
    return compareNormalizedPaths(this.normalizePath(left), this.normalizePath(right));
  },

  getDefaultDependencyBackend() {
    return "none";
  },

  getDefaultToolMode(tool: ToolName, compilerFamily?: "mingw" | "msvc") {
    if (tool === "cxx") {
      return compilerFamily === "msvc" ? "system" : "managed";
    }

    return "managed";
  },

  getDefaultTargetTriplet(compilerFamily) {
    return compilerFamily === "msvc" ? "x64-windows" : "x64-mingw-dynamic";
  },

  getCommandScriptName(baseName: string, kind: HostScriptKind): string {
    return getCommandScriptName(baseName, kind);
  },

  getVsWherePath(): string {
    return path.join(
      getProgramFilesX86Root(),
      "Microsoft Visual Studio",
      "Installer",
      "vswhere.exe"
    );
  },

  getShellCommand(kind: "cmd" | "powershell" | "sh"): HostCommand {
    if (kind === "powershell") {
      return makeCommand("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass"]);
    }

    if (kind === "sh") {
      return makeCommand("cmd.exe", ["/d", "/s", "/c"]);
    }

    return makeCommand("cmd.exe", ["/d", "/c"]);
  },

  getExecutableLookupCommand(candidate: string): HostCommand {
    return makeCommand("where", [candidate]);
  },

  getArchiveExtractCommand(archivePath: string, destination: string): HostCommand {
    return makeCommand("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${destination}' -Force`
    ]);
  },

  getVcpkgBootstrapCommand(toolRoot: string): HostCommand {
    return makeCommand("cmd.exe", [
      "/d",
      "/s",
      "/c",
      "bootstrap-vcpkg.bat -disableMetrics"
    ]);
  }
};

export function getWindowsAppDataRoot(): string {
  return getAppDataRoot();
}

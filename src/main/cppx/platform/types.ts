import path from "node:path";

import type { DependencyBackend, ToolInstallMode } from "@shared/contracts";
import type { CompilerFamily, ToolName } from "../types";

export type HostPlatform = "win32" | "darwin" | "linux";

export type HostShellKind = "cmd" | "powershell" | "sh";
export type HostScriptKind = "bat" | "cmd";

export interface HostCommand {
  command: string;
  args: string[];
}

export interface HostAdapter {
  readonly platform: HostPlatform;
  readonly compilerFamily: CompilerFamily;

  getAppDataRoot(): string;
  getCppxRoot(): string;
  getDownloadsRoot(): string;
  getToolRoot(tool: ToolName): string;
  getExecutableSuffix(): string;
  getExecutableName(baseName: string): string;
  getBinaryName(baseName: string): string;
  getCtestExecutableName(): string;
  getCpackExecutableName(): string;
  getPathSeparator(): string;
  normalizePath(value: string): string;
  comparePaths(left: string, right: string): number;
  getDefaultDependencyBackend(): DependencyBackend;
  getDefaultToolMode(tool: ToolName, compilerFamily?: CompilerFamily): ToolInstallMode;
  getDefaultTargetTriplet(compilerFamily: CompilerFamily): string;
  getCommandScriptName(baseName: string, kind: HostScriptKind): string;
  getVsWherePath(): string | null;
  getShellCommand(kind: HostShellKind): HostCommand;
  getExecutableLookupCommand(candidate: string): HostCommand;
  getArchiveExtractCommand(archivePath: string, destination: string): HostCommand;
  getVcpkgBootstrapCommand(toolRoot: string): HostCommand;
}

export function normalizePosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function compareNormalizedPaths(left: string, right: string): number {
  return normalizePosixPath(left).localeCompare(normalizePosixPath(right));
}

export function joinWithExecutableSuffix(baseName: string, suffix: string): string {
  return suffix.length > 0 ? `${baseName}${suffix}` : baseName;
}

export function getDefaultExecutableSuffix(platform: HostPlatform): string {
  return platform === "win32" ? ".exe" : "";
}

export function getDefaultPathSeparator(platform: HostPlatform): string {
  return platform === "win32" ? ";" : ":";
}

import { execFile as execFileCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CompilerScanResult,
  MsvcCandidate
} from "@shared/contracts";
import { pathExists } from "./fs-utils";
import { getHostAdapter } from "./platform";

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

export interface MsvcCompilerInfo {
  installationPath: string;
  displayName?: string;
  version?: string;
  devCmdPath: string;
  clPath: string;
}

interface VswhereMsvcInstance {
  installationPath: string;
  displayName?: string;
  version?: string;
}

function getVswherePath(): string {
  return hostAdapter.getVsWherePath() ?? "";
}

async function runVsDevCmdAndCapture(devCmdPath: string, command: string): Promise<string> {
  const scriptPath = path.join(
    os.tmpdir(),
    hostAdapter.getCommandScriptName(`cppx-msvc-${randomUUID()}`, "cmd")
  );
  const scriptContent = [
    "@echo off",
    `call "${devCmdPath}" -arch=x64 -host_arch=x64 >nul`,
    "if errorlevel 1 exit /b %errorlevel%",
    command
  ].join("\r\n");

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  try {
    const shellCommand = hostAdapter.getShellCommand("cmd");
    const { stdout } = await execFile(
      shellCommand.command,
      [...shellCommand.args, scriptPath],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await fs.rm(scriptPath, { force: true });
  }
}

function normalizePath(value: string): string {
  return hostAdapter.normalizePath(path.resolve(value));
}

function compareVersionDesc(a?: string, b?: string): number {
  const aParts = (a ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const bParts = (b ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const maxLength = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLength; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left !== right) {
      return right - left;
    }
  }
  return 0;
}

export function inferMsvcInstallationPathFromCl(clPath: string): string | null {
  const normalized = path.resolve(clPath).replace(/\//g, "\\");
  const marker = "\\VC\\Tools\\MSVC\\";
  const markerIndex = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex < 0) {
    return null;
  }
  return normalized.slice(0, markerIndex);
}

async function resolveVswhereMsvcInstances(): Promise<VswhereMsvcInstance[]> {
  const vswherePath = getVswherePath();
  if (!vswherePath || !(await pathExists(vswherePath))) {
    return [];
  }

  const { stdout } = await execFile(
    vswherePath,
    [
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-format",
      "json"
    ],
    { windowsHide: true }
  );

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const instances: VswhereMsvcInstance[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const installationPath = typeof record.installationPath === "string"
      ? record.installationPath.trim()
      : "";
    if (!installationPath) {
      continue;
    }

    const fallbackVersion = typeof record.installationVersion === "string"
      ? record.installationVersion.trim()
      : undefined;
    const catalog =
      record.catalog && typeof record.catalog === "object"
        ? (record.catalog as Record<string, unknown>)
        : undefined;
    const displayName =
      typeof record.displayName === "string"
        ? record.displayName.trim()
        : undefined;
    const versionFromCatalog =
      catalog && typeof catalog.productDisplayVersion === "string"
        ? catalog.productDisplayVersion.trim()
        : undefined;

    instances.push({
      installationPath,
      displayName: displayName || undefined,
      version: versionFromCatalog || fallbackVersion || undefined
    });
  }

  return instances.sort((left, right) => {
    const versionCompare = compareVersionDesc(left.version, right.version);
    if (versionCompare !== 0) {
      return versionCompare;
    }
    return hostAdapter.comparePaths(left.installationPath, right.installationPath);
  });
}

async function resolveMsvcCompilerInfoFromInstance(
  instance: VswhereMsvcInstance
): Promise<MsvcCompilerInfo | null> {
  const installationPath = instance.installationPath;
  const devCmdPath = path.join(
    installationPath,
    "Common7",
    "Tools",
    hostAdapter.getCommandScriptName("VsDevCmd", "bat")
  );
  if (!(await pathExists(devCmdPath))) {
    return null;
  }

  const whereOutput = await runVsDevCmdAndCapture(devCmdPath, "where cl");
  const clPath = whereOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!clPath || !(await pathExists(clPath))) {
    return null;
  }

  return {
    installationPath,
    displayName: instance.displayName,
    version: instance.version,
    devCmdPath,
    clPath
  };
}

async function resolveAllMsvcCompilerInfos(): Promise<MsvcCompilerInfo[]> {
  const instances = await resolveVswhereMsvcInstances();
  const infos: MsvcCompilerInfo[] = [];

  for (const instance of instances) {
    try {
      const info = await resolveMsvcCompilerInfoFromInstance(instance);
      if (info) {
        infos.push(info);
      }
    } catch {
      // Ignore a broken instance and continue with the rest.
    }
  }

  return infos.sort((left, right) => {
    const versionCompare = compareVersionDesc(left.version, right.version);
    if (versionCompare !== 0) {
      return versionCompare;
    }
    return hostAdapter.comparePaths(left.installationPath, right.installationPath);
  });
}

export async function resolveMsvcCompilerInfo(
  preferredInstallationPath?: string
): Promise<MsvcCompilerInfo | null> {
  const infos = await resolveAllMsvcCompilerInfos();
  if (infos.length === 0) {
    return null;
  }

  if (preferredInstallationPath && preferredInstallationPath.trim().length > 0) {
    const targetPath = normalizePath(preferredInstallationPath);
    const matched = infos.find(
      (info) => normalizePath(info.installationPath) === targetPath
    );
    return matched ?? null;
  }

  return infos[0] ?? null;
}

export async function captureMsvcEnvironment(devCmdPath: string): Promise<NodeJS.ProcessEnv> {
  const output = await runVsDevCmdAndCapture(devCmdPath, "set");
  const env: NodeJS.ProcessEnv = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (key.length === 0) {
      continue;
    }
    const normalizedKey = /^path$/i.test(key) ? "PATH" : key;
    env[normalizedKey] = value;
  }
  return env;
}

export function buildCompilerScanResult(msvcInfos: MsvcCompilerInfo[]): CompilerScanResult {
  const candidates: MsvcCandidate[] = msvcInfos.map((info) => ({
    installationPath: info.installationPath,
    displayName: info.displayName,
    version: info.version,
    devCmdPath: info.devCmdPath,
    clPath: info.clPath
  }));
  const primary = candidates[0];

  return {
    msvcAvailable: candidates.length > 0,
    msvcCandidates: candidates,
    msvcDisplayName: primary?.displayName,
    msvcVersion: primary?.version,
    msvcClPath: primary?.clPath
  };
}

export async function getCompilerScan(): Promise<CompilerScanResult> {
  try {
    const msvcInfos = await resolveAllMsvcCompilerInfos();
    return buildCompilerScanResult(msvcInfos);
  } catch {
    return {
      msvcAvailable: false,
      msvcCandidates: []
    };
  }
}

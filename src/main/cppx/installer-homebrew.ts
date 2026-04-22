import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { runSpawn } from "./command-runner";
import { DEFAULT_TOOL_VERSION_TOKEN } from "./tool-catalog";
import { CppxError } from "./errors";
import { pathExists } from "./fs-utils";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import { readToolManifest, upsertToolRecord } from "./paths";
import type {
  CompilerFamily,
  CompilerToolPolicy,
  ToolName,
  ToolPolicy
} from "./types";

const execFile = promisify(execFileCb);
const hostAdapter = getHostAdapter();

type HomebrewTool = Exclude<ToolName, "vcpkg">;

interface HomebrewToolSpec {
  formula: string;
  executable: string;
  compilerFamily?: CompilerFamily;
}

export interface ResolvedHomebrewFormulaExecutable {
  executable: string;
  root: string;
  version: string;
  compilerFamily?: CompilerFamily;
}

export interface HomebrewInstallResult {
  name: HomebrewTool;
  executable: string;
  root: string;
  version: string;
  mode: "managed";
  sourceKind: "homebrew-managed";
  requestedVersion: string;
  resolvedVersion: string;
  compilerFamily?: CompilerFamily;
  provider: "homebrew";
  ownership: "cppx" | "external";
}

function getHostArchLabel(): string {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
}

function isPinnedToolVersion(version: string): boolean {
  const normalizedVersion = version.trim();
  return (
    normalizedVersion.length > 0 &&
    normalizedVersion !== DEFAULT_TOOL_VERSION_TOKEN &&
    normalizedVersion !== "latest"
  );
}

function getHomebrewToolSpec(tool: HomebrewTool): HomebrewToolSpec {
  switch (tool) {
    case "cmake":
      return { formula: "cmake", executable: "cmake" };
    case "ninja":
      return { formula: "ninja", executable: "ninja" };
    case "conan":
      return { formula: "conan", executable: "conan" };
    case "cxx":
      return {
        formula: "llvm",
        executable: "clang++",
        compilerFamily: "clang"
      };
    default: {
      const neverTool: never = tool;
      throw new CppxError(`지원하지 않는 Homebrew 도구: ${String(neverTool)}`);
    }
  }
}

export async function resolveHomebrewExecutable(): Promise<string | null> {
  if (hostAdapter.platform !== "darwin") {
    return null;
  }

  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  const pathEntries = pathValue
    .split(hostAdapter.getPathSeparator())
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of pathEntries) {
    const resolved = path.join(entry, "brew");
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  try {
    const lookupCommand = hostAdapter.getExecutableLookupCommand("brew");
    const { stdout } = await execFile(lookupCommand.command, lookupCommand.args, {
      windowsHide: true
    });
    const resolved = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return resolved && (await pathExists(resolved)) ? resolved : null;
  } catch {
    return null;
  }
}

async function getHomebrewFormulaVersion(
  brewExecutable: string,
  formula: string
): Promise<string | null> {
  try {
    const { stdout } = await execFile(brewExecutable, ["list", "--versions", formula], {
      windowsHide: true
    });
    const line = stdout.trim();
    if (!line) {
      return null;
    }

    const [name, ...versions] = line.split(/\s+/);
    if (name !== formula || versions.length === 0) {
      return null;
    }

    return versions[0] ?? null;
  } catch {
    return null;
  }
}

export async function resolveHomebrewFormulaExecutable(
  brewExecutable: string,
  tool: HomebrewTool
): Promise<ResolvedHomebrewFormulaExecutable | null> {
  const spec = getHomebrewToolSpec(tool);
  const version = await getHomebrewFormulaVersion(brewExecutable, spec.formula);
  if (!version) {
    return null;
  }

  const { stdout } = await execFile(brewExecutable, ["--prefix", spec.formula], {
    windowsHide: true
  });
  const formulaRoot = stdout.trim();
  if (!formulaRoot) {
    return null;
  }

  const executable = path.join(formulaRoot, "bin", hostAdapter.getExecutableName(spec.executable));
  if (!(await pathExists(executable))) {
    return null;
  }

  return {
    executable,
    root: formulaRoot,
    version,
    compilerFamily: spec.compilerFamily
  };
}

function ensureSupportedHomebrewVersionPolicy(
  tool: HomebrewTool,
  policy: ToolPolicy | CompilerToolPolicy
): void {
  if (!isPinnedToolVersion(policy.version)) {
    return;
  }

  throw new CppxError(
    `${tool} Homebrew exact version은 아직 지원되지 않습니다.`,
    `requested=${policy.version}`
  );
}

async function registerTool(record: HomebrewInstallResult): Promise<void> {
  await upsertToolRecord({
    name: record.name,
    executable: record.executable,
    root: record.root,
    version: record.version,
    installedAt: new Date().toISOString(),
    mode: record.mode,
    sourceKind: record.sourceKind,
    requestedVersion: record.requestedVersion,
    resolvedVersion: record.resolvedVersion,
    platform: hostAdapter.platform,
    arch: getHostArchLabel(),
    compilerFamily: record.compilerFamily,
    provider: record.provider,
    ownership: record.ownership
  });
}

export async function installHomebrewManagedTool(
  tool: HomebrewTool,
  policy: ToolPolicy | CompilerToolPolicy,
  logger: CppxLogger
): Promise<HomebrewInstallResult> {
  if (hostAdapter.platform !== "darwin") {
    throw new CppxError(`${tool} Homebrew managed 경로는 macOS에서만 지원됩니다.`);
  }

  ensureSupportedHomebrewVersionPolicy(tool, policy);

  const brewExecutable = await resolveHomebrewExecutable();
  if (!brewExecutable) {
    throw new CppxError(
      "Homebrew를 찾지 못했습니다.",
      "macOS managed 도구 설치를 사용하려면 먼저 Homebrew가 준비되어야 합니다."
    );
  }

  const spec = getHomebrewToolSpec(tool);
  const manifest = await readToolManifest();
  const existingRecord = manifest.tools[tool];
  const existing = await resolveHomebrewFormulaExecutable(brewExecutable, tool);

  if (existing) {
    const ownedByCppx =
      existingRecord?.provider === "homebrew" &&
      (existingRecord.ownership ?? "unknown") === "cppx" &&
      (existingRecord.mode ?? "managed") === "managed";
    const record: HomebrewInstallResult = {
      name: tool,
      executable: existing.executable,
      root: existing.root,
      version: existing.version,
      mode: "managed",
      sourceKind: "homebrew-managed",
      requestedVersion: policy.version,
      resolvedVersion: existing.version,
      compilerFamily: existing.compilerFamily,
      provider: "homebrew",
      ownership: ownedByCppx ? "cppx" : "external"
    };
    logger.info("install-tools", `${tool} 이미 설치됨 (Homebrew: ${spec.formula})`);
    await registerTool(record);
    return record;
  }

  await runSpawn(
    {
      action: "install-tools",
      command: brewExecutable,
      args: ["install", spec.formula]
    },
    logger
  );

  const installed = await resolveHomebrewFormulaExecutable(brewExecutable, tool);
  if (!installed) {
    throw new CppxError(
      `${tool} Homebrew 설치 후 실행 파일을 찾지 못했습니다.`,
      spec.formula
    );
  }

  const record: HomebrewInstallResult = {
    name: tool,
    executable: installed.executable,
    root: installed.root,
    version: installed.version,
    mode: "managed",
    sourceKind: "homebrew-managed",
    requestedVersion: policy.version,
    resolvedVersion: installed.version,
    compilerFamily: installed.compilerFamily,
    provider: "homebrew",
    ownership: "cppx"
  };
  await registerTool(record);
  logger.success("install-tools", `${tool} 설치됨: ${installed.executable}`);
  return record;
}

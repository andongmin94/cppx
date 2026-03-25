import type {
  CompilerPreference,
  CppxAction,
  DependencyBackend,
  ToolLifecycleProvider,
  ToolOwnership,
  PresetConfigPayload,
  ProjectConfigPayload,
  ToolInstallMode
} from "@shared/contracts";
import type { HostPlatform } from "./platform";

export type ToolName = "cmake" | "ninja" | "vcpkg" | "conan" | "cxx";
export type CompilerFamily = "mingw" | "msvc";
export type ToolSourceKind =
  | "catalog-archive"
  | "catalog-git"
  | "catalog-github-release"
  | "apt-managed"
  | "pipx-managed"
  | "homebrew-managed"
  | "system-detected"
  | "msvc-detected";

export interface ToolPolicy {
  mode: ToolInstallMode;
  version: string;
}

export interface CompilerToolPolicy extends ToolPolicy {
  preferredFamily?: CompilerPreference;
  msvcInstallationPath?: string;
}

export interface NormalizedProjectConfig extends ProjectConfigPayload {
  schemaVersion: number;
  targetName: string;
  dependencyBackend: DependencyBackend;
  compiler: {
    preferredFamily?: CompilerPreference;
    msvcInstallationPath?: string;
  };
  package: NonNullable<ProjectConfigPayload["package"]>;
  tools: {
    cmake: ToolPolicy;
    ninja: ToolPolicy;
    vcpkg: ToolPolicy;
    conan: ToolPolicy;
    cxx: CompilerToolPolicy;
  };
  presets: PresetConfigPayload[];
}

export interface ToolCatalogEntry {
  id: string;
  tool: ToolName;
  platform: HostPlatform;
  arch: "x64" | "arm64";
  sourceKind: ToolSourceKind;
  executable: string;
  version?: string;
  urls?: string[];
  sha256?: string;
  repoUrl?: string;
  assetPatterns?: string[];
  trustedRefPatterns?: string[];
  compilerFamily?: CompilerFamily;
}

export interface ToolRecord {
  name: ToolName;
  executable: string;
  root: string;
  version: string;
  installedAt: string;
  mode?: ToolInstallMode;
  sourceKind?: ToolSourceKind;
  requestedVersion?: string;
  resolvedVersion?: string;
  platform?: HostPlatform;
  arch?: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
}

export interface ToolManifest {
  tools: Partial<Record<ToolName, ToolRecord>>;
}

export interface Toolchain {
  cmake: string;
  ninja: string;
  vcpkg?: string;
  cxx: string;
  envPath: string[];
  compilerFamily: CompilerFamily;
  baseEnv?: NodeJS.ProcessEnv;
}

export interface CommandContext {
  action: CppxAction | "system";
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

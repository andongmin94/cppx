export type CppxAction =
  | "install-tools"
  | "init"
  | "add"
  | "build"
  | "run"
  | "test"
  | "pack";

export type CompilerPreference = "mingw" | "msvc";
export type ToolInstallMode = "managed" | "system";
export type DependencyBackend = "vcpkg" | "conan" | "none";
export type ToolId = "cmake" | "ninja" | "vcpkg" | "conan" | "cxx";
export type HostPlatformPayload = "win32" | "darwin" | "linux";
export type ToolLifecycleProvider =
  | "archive"
  | "git"
  | "homebrew"
  | "apt"
  | "system"
  | "msvc"
  | "unknown";
export type ToolOwnership = "cppx" | "external" | "unknown";
export type HostSupportTier = "official" | "best-effort";

export type LogLevel =
  | "info"
  | "warn"
  | "error"
  | "stdout"
  | "stderr"
  | "success";

export interface LogEntry {
  id: string;
  timestamp: string;
  action: CppxAction | "system";
  level: LogLevel;
  message: string;
}

export interface CmakeConfig {
  compileDefinitions: string[];
  compileOptions: string[];
  includeDirectories: string[];
  linkLibraries: string[];
}

export interface ToolPolicyPayload {
  mode?: ToolInstallMode;
  version?: string;
}

export interface CompilerToolPolicyPayload extends ToolPolicyPayload {
  preferredFamily?: CompilerPreference;
  msvcInstallationPath?: string;
}

export interface ProjectToolPoliciesPayload {
  cmake?: ToolPolicyPayload;
  ninja?: ToolPolicyPayload;
  vcpkg?: ToolPolicyPayload;
  conan?: ToolPolicyPayload;
  cxx?: CompilerToolPolicyPayload;
}

export interface PresetConfigPayload {
  name: string;
  displayName?: string;
  buildType?: string;
  targetTriplet?: string;
  runnable?: boolean;
}

export interface CompilerConfigPayload {
  preferredFamily?: CompilerPreference;
  msvcInstallationPath?: string;
}

export interface PackageConfigPayload {
  version: string;
  vendor: string;
  generators: string[];
  outputDir: string;
  licenseFile?: string;
  readmeFile?: string;
  icon?: string;
}

export interface ProjectConfigPayload {
  name: string;
  targetName?: string;
  defaultPreset: string;
  sourceFile: string;
  cxxStandard: number;
  targetTriplet: string;
  dependencies: string[];
  cmake: CmakeConfig;
  schemaVersion?: number;
  dependencyBackend?: DependencyBackend;
  compiler?: CompilerConfigPayload;
  package?: PackageConfigPayload;
  tools?: ProjectToolPoliciesPayload;
  presets?: PresetConfigPayload[];
}

export interface HostDefaultsPayload {
  platform: HostPlatformPayload;
  defaultPreset: string;
  dependencyBackend: DependencyBackend;
  toolPolicies: Required<ProjectToolPoliciesPayload>;
  hostSupport: HostSupportPayload;
  toolCapabilities: Record<ToolId, ToolLifecycleCapabilities>;
}

export interface HostSupportPayload {
  platform: HostPlatformPayload;
  arch: string;
  hostLabel: string;
  tier: HostSupportTier;
  managedLifecycleReady: boolean;
  recommendedProvider: ToolLifecycleProvider;
  distroId?: string;
  distroVersion?: string;
  notes: string[];
}

export interface ToolLifecycleCapabilities {
  provider: ToolLifecycleProvider;
  detect: boolean;
  install: boolean;
  repair: boolean;
  remove: boolean;
  note?: string;
}

export interface RunCommandPayload {
  action: CppxAction;
  workspace: string;
  projectName?: string;
  dependency?: string;
  preset?: string;
  dependencyBackend?: DependencyBackend;
  compilerPreference?: CompilerPreference;
  msvcInstallationPath?: string;
  toolPolicies?: ProjectToolPoliciesPayload;
}

export interface RunCommandResult {
  action: CppxAction;
  ok: boolean;
  code: number;
  message: string;
  workspace?: string;
}

export interface ToolStatus {
  cmake: boolean;
  ninja: boolean;
  vcpkg: boolean;
  conan: boolean;
  cxx: boolean;
  details?: Partial<Record<ToolId, ToolStatusDetail>>;
}

export interface ToolStatusDetail {
  ready: boolean;
  mode?: ToolInstallMode;
  sourceKind?: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  executable?: string;
  verifiedSha256?: string;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
  capabilities?: ToolLifecycleCapabilities;
}

export interface CompilerScanResult {
  msvcAvailable: boolean;
  msvcCandidates: MsvcCandidate[];
  msvcDisplayName?: string;
  msvcVersion?: string;
  msvcClPath?: string;
}

export interface MsvcCandidate {
  installationPath: string;
  displayName?: string;
  version?: string;
  clPath: string;
}

export interface CppxApi {
  runCommand: (payload: RunCommandPayload) => Promise<RunCommandResult>;
  selectWorkspace: () => Promise<string | null>;
  getDefaultWorkspace: () => Promise<string>;
  getCppxRoot: () => Promise<string>;
  getHostDefaults: () => Promise<HostDefaultsPayload>;
  getCompilerScan: () => Promise<CompilerScanResult>;
  getToolStatus: () => Promise<ToolStatus>;
  getProjectConfig: (workspace: string) => Promise<ProjectConfigPayload>;
  saveProjectConfig: (
    workspace: string,
    config: ProjectConfigPayload
  ) => Promise<ProjectConfigPayload>;
  onLog: (listener: (entry: LogEntry) => void) => () => void;
}

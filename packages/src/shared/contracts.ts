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
export type ToolId = "cmake" | "ninja" | "vcpkg" | "cxx";

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

export interface ProjectConfigPayload {
  name: string;
  defaultPreset: string;
  sourceFile: string;
  cxxStandard: number;
  targetTriplet: string;
  dependencies: string[];
  cmake: CmakeConfig;
  schemaVersion?: number;
  dependencyBackend?: DependencyBackend;
  compiler?: CompilerConfigPayload;
  tools?: ProjectToolPoliciesPayload;
  presets?: PresetConfigPayload[];
}

export interface RunCommandPayload {
  action: CppxAction;
  workspace: string;
  projectName?: string;
  dependency?: string;
  preset?: string;
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
  getCompilerScan: () => Promise<CompilerScanResult>;
  getToolStatus: () => Promise<ToolStatus>;
  getProjectConfig: (workspace: string) => Promise<ProjectConfigPayload>;
  saveProjectConfig: (
    workspace: string,
    config: ProjectConfigPayload
  ) => Promise<ProjectConfigPayload>;
  onLog: (listener: (entry: LogEntry) => void) => () => void;
}

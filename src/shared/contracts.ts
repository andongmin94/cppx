export type CppxAction =
  | "install-tools"
  | "init"
  | "add"
  | "build"
  | "run"
  | "test"
  | "pack";

export type CompilerPreference = "mingw" | "msvc";

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

export interface ProjectConfigPayload {
  name: string;
  defaultPreset: string;
  sourceFile: string;
  cxxStandard: number;
  targetTriplet: string;
  dependencies: string[];
  cmake: CmakeConfig;
}

export interface RunCommandPayload {
  action: CppxAction;
  workspace: string;
  projectName?: string;
  dependency?: string;
  preset?: string;
  compilerPreference?: CompilerPreference;
  msvcInstallationPath?: string;
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

export type CppxAction =
  | "install-tools"
  | "init"
  | "add"
  | "build"
  | "run"
  | "test"
  | "pack";

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
}

export interface RunCommandResult {
  action: CppxAction;
  ok: boolean;
  code: number;
  message: string;
}

export interface ToolStatus {
  cmake: boolean;
  ninja: boolean;
  vcpkg: boolean;
  clangd: boolean;
  cxx: boolean;
}

export interface CppxApi {
  runCommand: (payload: RunCommandPayload) => Promise<RunCommandResult>;
  selectWorkspace: () => Promise<string | null>;
  getDefaultWorkspace: () => Promise<string>;
  getToolStatus: () => Promise<ToolStatus>;
  getProjectConfig: (workspace: string) => Promise<ProjectConfigPayload>;
  saveProjectConfig: (
    workspace: string,
    config: ProjectConfigPayload
  ) => Promise<ProjectConfigPayload>;
  onLog: (listener: (entry: LogEntry) => void) => () => void;
}

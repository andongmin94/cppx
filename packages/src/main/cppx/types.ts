import type { CppxAction } from "@shared/contracts";

export type ToolName = "cmake" | "ninja" | "vcpkg" | "cxx";
export type CompilerFamily = "mingw" | "msvc";

export interface ToolRecord {
  name: ToolName;
  executable: string;
  root: string;
  version: string;
  installedAt: string;
}

export interface ToolManifest {
  tools: Partial<Record<ToolName, ToolRecord>>;
}

export interface Toolchain {
  cmake: string;
  ninja: string;
  vcpkg: string;
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

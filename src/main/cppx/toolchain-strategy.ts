import type {
  CompilerPreference,
  ProjectToolPoliciesPayload,
  ToolInstallMode,
  ToolchainStrategy
} from "@shared/contracts";
import type { ResolvedToolPolicies } from "./installer-runtime";
import { getHostAdapter } from "./platform";
import { DEFAULT_TOOL_VERSION_TOKEN } from "./tool-catalog";
import type { CompilerFamily, CompilerToolPolicy, ToolName, ToolPolicy } from "./types";

export const DEFAULT_TOOLCHAIN_STRATEGY: ToolchainStrategy = "recommended";
const DEFAULT_COMPILER_VERSION = "latest";
const hostAdapter = getHostAdapter();

function isCompilerFamily(value: unknown): value is CompilerFamily {
  return value === "clang" || value === "gcc" || value === "mingw" || value === "msvc";
}

export function isToolchainStrategy(value: unknown): value is ToolchainStrategy {
  return (
    value === "recommended" ||
    value === "portable" ||
    value === "provider" ||
    value === "system"
  );
}

export function normalizeToolchainStrategy(
  value: unknown,
  fallback: ToolchainStrategy = DEFAULT_TOOLCHAIN_STRATEGY
): ToolchainStrategy {
  const strategy = isToolchainStrategy(value) ? value : fallback;

  if (hostAdapter.platform === "win32" && strategy === "provider") {
    return "portable";
  }

  if (hostAdapter.platform !== "win32" && strategy === "portable") {
    return "provider";
  }

  return strategy;
}

export function normalizeCompilerPreferenceForHost(
  value: unknown,
  fallback: CompilerPreference = hostAdapter.compilerFamily
): CompilerPreference {
  if (value === "msvc") {
    return "msvc";
  }

  if (value === "mingw") {
    return hostAdapter.platform === "win32" ? "mingw" : hostAdapter.compilerFamily;
  }

  if (value === "gcc") {
    return hostAdapter.platform === "linux" ? "gcc" : hostAdapter.compilerFamily;
  }

  if (value === "clang") {
    return hostAdapter.platform === "win32" ? fallback : "clang";
  }

  return fallback;
}

function normalizeCompilerFamily(value: unknown, fallback: CompilerFamily): CompilerFamily {
  const normalized = normalizeCompilerPreferenceForHost(value, fallback);
  return isCompilerFamily(normalized) ? normalized : fallback;
}

function getStrategyToolMode(
  tool: ToolName,
  compilerFamily: CompilerFamily,
  strategyRaw: ToolchainStrategy
): ToolInstallMode {
  const strategy = normalizeToolchainStrategy(strategyRaw);

  if (tool === "cxx" && compilerFamily === "msvc") {
    return "system";
  }

  if (strategy === "system") {
    return "system";
  }

  if (strategy === "recommended") {
    return hostAdapter.getDefaultToolMode(tool, compilerFamily);
  }

  return "managed";
}

function getDefaultToolVersion(
  tool: ToolName,
  mode: ToolInstallMode,
  compilerFamily: CompilerFamily
): string {
  if (tool === "cxx" && mode === "managed" && compilerFamily !== "msvc") {
    return DEFAULT_COMPILER_VERSION;
  }

  return DEFAULT_TOOL_VERSION_TOKEN;
}

function toPreferredFamily(compilerFamily: CompilerFamily): CompilerPreference {
  if (compilerFamily === "clang" || compilerFamily === "gcc" || compilerFamily === "msvc") {
    return compilerFamily;
  }

  return "mingw";
}

export function createDefaultToolPolicy(
  tool: Exclude<ToolName, "cxx">,
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily,
  strategy: ToolchainStrategy = DEFAULT_TOOLCHAIN_STRATEGY
): ToolPolicy {
  const mode = getStrategyToolMode(tool, compilerFamily, strategy);
  return {
    mode,
    version: getDefaultToolVersion(tool, mode, compilerFamily)
  };
}

export function createDefaultCompilerPolicy(
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily,
  strategy: ToolchainStrategy = DEFAULT_TOOLCHAIN_STRATEGY
): CompilerToolPolicy {
  const mode = getStrategyToolMode("cxx", compilerFamily, strategy);
  return {
    mode,
    version: getDefaultToolVersion("cxx", mode, compilerFamily),
    preferredFamily: toPreferredFamily(compilerFamily)
  };
}

export function createDefaultToolPolicies(
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily,
  strategy: ToolchainStrategy = DEFAULT_TOOLCHAIN_STRATEGY
): ResolvedToolPolicies {
  return {
    cmake: createDefaultToolPolicy("cmake", compilerFamily, strategy),
    ninja: createDefaultToolPolicy("ninja", compilerFamily, strategy),
    vcpkg: createDefaultToolPolicy("vcpkg", compilerFamily, strategy),
    conan: createDefaultToolPolicy("conan", compilerFamily, strategy),
    cxx: createDefaultCompilerPolicy(compilerFamily, strategy)
  };
}

function normalizeToolMode(value: unknown, fallback: ToolInstallMode): ToolInstallMode {
  return value === "system" || value === "managed" ? value : fallback;
}

function normalizeToolVersion(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeToolPolicy(raw: unknown, fallback: ToolPolicy): ToolPolicy {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = normalizeToolMode(record.mode, fallback.mode);

  return {
    mode,
    version: normalizeToolVersion(record.version, fallback.version)
  };
}

function normalizeCompilerPolicy(
  raw: unknown,
  fallback: CompilerToolPolicy
): CompilerToolPolicy {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const preferredFamily = normalizeCompilerFamily(
    record.preferredFamily,
    fallback.preferredFamily ?? hostAdapter.compilerFamily
  );
  const requestedMode = normalizeToolMode(record.mode, fallback.mode);
  const mode = preferredFamily === "msvc" ? "system" : requestedMode;
  const versionFallback =
    fallback.version ??
    getDefaultToolVersion("cxx", mode, preferredFamily);

  return {
    mode,
    version: normalizeToolVersion(record.version, versionFallback),
    preferredFamily,
    msvcInstallationPath:
      typeof record.msvcInstallationPath === "string" &&
      record.msvcInstallationPath.trim().length > 0
        ? record.msvcInstallationPath.trim()
        : fallback.msvcInstallationPath
  };
}

export function resolveRequestedPolicies(
  toolPolicies?: ProjectToolPoliciesPayload,
  options: { strategy?: ToolchainStrategy } = {}
): ResolvedToolPolicies {
  const compilerFamily = normalizeCompilerFamily(
    toolPolicies?.cxx?.preferredFamily,
    hostAdapter.compilerFamily
  );
  const defaults = createDefaultToolPolicies(
    compilerFamily,
    options.strategy ?? DEFAULT_TOOLCHAIN_STRATEGY
  );

  return {
    cmake: normalizeToolPolicy(toolPolicies?.cmake, defaults.cmake),
    ninja: normalizeToolPolicy(toolPolicies?.ninja, defaults.ninja),
    vcpkg: normalizeToolPolicy(toolPolicies?.vcpkg, defaults.vcpkg),
    conan: normalizeToolPolicy(toolPolicies?.conan, defaults.conan),
    cxx: normalizeCompilerPolicy(toolPolicies?.cxx, defaults.cxx)
  };
}

export function mergeToolPolicies(
  current: ProjectToolPoliciesPayload | undefined,
  next: ProjectToolPoliciesPayload | undefined
): ProjectToolPoliciesPayload | undefined {
  if (!current && !next) {
    return undefined;
  }

  return {
    cmake: { ...current?.cmake, ...next?.cmake },
    ninja: { ...current?.ninja, ...next?.ninja },
    vcpkg: { ...current?.vcpkg, ...next?.vcpkg },
    conan: { ...current?.conan, ...next?.conan },
    cxx: { ...current?.cxx, ...next?.cxx }
  };
}

export function createToolPoliciesPayload(
  policies: ResolvedToolPolicies
): Required<ProjectToolPoliciesPayload> {
  return {
    cmake: { ...policies.cmake },
    ninja: { ...policies.ninja },
    vcpkg: { ...policies.vcpkg },
    conan: { ...policies.conan },
    cxx: { ...policies.cxx }
  };
}

export function createRequestedToolPolicies(options: {
  toolPolicies?: ProjectToolPoliciesPayload;
  compilerPreference?: CompilerPreference;
  msvcInstallationPath?: string;
  strategy?: ToolchainStrategy;
}): ProjectToolPoliciesPayload | undefined {
  const requestedCompiler = normalizeCompilerFamily(
    options.compilerPreference ?? options.toolPolicies?.cxx?.preferredFamily,
    hostAdapter.compilerFamily
  );
  const normalizedStrategy = options.strategy
    ? normalizeToolchainStrategy(options.strategy)
    : undefined;
  const strategyPolicies = normalizedStrategy
    ? createToolPoliciesPayload(createDefaultToolPolicies(requestedCompiler, normalizedStrategy))
    : undefined;
  const policies = mergeToolPolicies(strategyPolicies, options.toolPolicies);

  if (!options.compilerPreference && !options.msvcInstallationPath) {
    return policies;
  }

  const compilerDefaults = createDefaultCompilerPolicy(
    requestedCompiler,
    normalizedStrategy ?? DEFAULT_TOOLCHAIN_STRATEGY
  );
  const cxxPolicy = { ...(policies?.cxx ?? {}) };
  cxxPolicy.preferredFamily = requestedCompiler;
  cxxPolicy.mode =
    requestedCompiler === "msvc"
      ? "system"
      : cxxPolicy.mode ?? compilerDefaults.mode;
  cxxPolicy.version = cxxPolicy.version ?? compilerDefaults.version;

  if (options.msvcInstallationPath?.trim()) {
    cxxPolicy.msvcInstallationPath = options.msvcInstallationPath.trim();
  }

  return {
    ...(policies ?? {}),
    cxx: cxxPolicy
  };
}

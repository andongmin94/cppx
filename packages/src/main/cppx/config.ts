import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CmakeConfig,
  CompilerConfigPayload,
  CompilerPreference,
  DependencyBackend,
  PackageConfigPayload,
  PresetConfigPayload,
  ProjectConfigPayload,
  ProjectToolPoliciesPayload,
  ToolInstallMode
} from "@shared/contracts";
import { CppxError } from "./errors";
import { pathExists, readJsonFile, writeTextFile } from "./fs-utils";
import { getHostAdapter } from "./platform";
import type {
  CompilerFamily,
  CompilerToolPolicy,
  NormalizedProjectConfig,
  ToolName,
  ToolPolicy
} from "./types";

export const CPPX_CONFIG_PATH = path.join(".cppx", "config.toml");
const LEGACY_PROJECT_CONFIG_PATH = path.join(".cppx", "project.json");
const CONFIG_SCHEMA_VERSION = 3;
const DEFAULT_MANAGED_VERSION = "default";
const DEFAULT_COMPILER_VERSION = "latest";
const hostAdapter = getHostAdapter();

type PartialProjectConfig = Partial<ProjectConfigPayload>;

function isCompilerPreference(value: unknown): value is CompilerPreference {
  return value === "clang" || value === "mingw" || value === "msvc";
}

function normalizeCompilerPreferenceForHost(
  value: unknown,
  fallback: CompilerPreference
): CompilerPreference {
  if (value === "msvc") {
    return "msvc";
  }

  if (value === "mingw") {
    return hostAdapter.platform === "win32" ? "mingw" : hostAdapter.compilerFamily;
  }

  if (value === "clang") {
    return hostAdapter.platform === "win32" ? fallback : "clang";
  }

  return fallback;
}

function isDependencyBackend(value: unknown): value is DependencyBackend {
  return value === "vcpkg" || value === "conan" || value === "none";
}

function isToolInstallMode(value: unknown): value is ToolInstallMode {
  return value === "managed" || value === "system";
}

export function defaultCmakeConfig(): CmakeConfig {
  return {
    compileDefinitions: [],
    compileOptions: [],
    includeDirectories: [],
    linkLibraries: []
  };
}

function getDefaultPresetArchLabel(): string {
  if (process.arch === "arm64") {
    return "arm64";
  }

  if (process.arch === "x64") {
    return "x64";
  }

  return process.arch;
}

export function getDefaultPresetNames(): { debug: string; release: string } {
  const arch = getDefaultPresetArchLabel();
  return {
    debug: `debug-${arch}`,
    release: `release-${arch}`
  };
}

export function getDefaultPresetName(): string {
  return getDefaultPresetNames().debug;
}

export function defaultTargetTripletForCompiler(compilerFamily: CompilerFamily): string {
  return hostAdapter.getDefaultTargetTriplet(compilerFamily);
}

export function resolveEffectiveTargetTriplet(
  rawTriplet: string,
  compilerFamily: CompilerFamily
): string {
  const triplet = rawTriplet.trim();
  if (triplet.length === 0) {
    return defaultTargetTripletForCompiler(compilerFamily);
  }

  if (compilerFamily === "msvc" && /mingw/i.test(triplet)) {
    return hostAdapter.getDefaultTargetTriplet("msvc");
  }

  return triplet;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeNonEmptyStringArray(values: unknown, fallback: string[]): string[] {
  const normalized = normalizeStringArray(values);
  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  const parsed = typeof value === "string" ? Number.parseInt(value.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") {
      return true;
    }
    if (lowered === "false") {
      return false;
    }
  }

  return fallback;
}

export function createSafeTargetName(projectName: string): string {
  const base = projectName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-");
  const trimmed = base.replace(/^-+|-+$/g, "");

  if (trimmed.length === 0) {
    return "app";
  }

  if (/^[A-Za-z_]/.test(trimmed)) {
    return trimmed;
  }

  return `app-${trimmed}`;
}

export function defaultPackageConfig(projectName: string): PackageConfigPayload {
  return {
    version: "0.1.0",
    vendor: projectName,
    generators: ["ZIP"],
    outputDir: "dist"
  };
}

function createDefaultPresets(targetTriplet: string): PresetConfigPayload[] {
  const presetNames = getDefaultPresetNames();

  return [
    {
      name: presetNames.debug,
      displayName: `Debug ${getDefaultPresetArchLabel()}`,
      buildType: "Debug",
      targetTriplet,
      runnable: true
    },
    {
      name: presetNames.release,
      displayName: `Release ${getDefaultPresetArchLabel()}`,
      buildType: "Release",
      targetTriplet,
      runnable: true
    }
  ];
}

function defaultToolPolicy(tool: Exclude<ToolName, "cxx">): ToolPolicy {
  return {
    mode: hostAdapter.getDefaultToolMode(tool),
    version: DEFAULT_MANAGED_VERSION
  };
}

function defaultCompilerPolicy(compilerFamily: CompilerFamily): CompilerToolPolicy {
  const mode = hostAdapter.getDefaultToolMode("cxx", compilerFamily);

  if (compilerFamily === "msvc") {
    return {
      mode,
      version: DEFAULT_MANAGED_VERSION,
      preferredFamily: "msvc"
    };
  }

  return {
    mode,
    version: mode === "managed" ? DEFAULT_COMPILER_VERSION : DEFAULT_MANAGED_VERSION,
    preferredFamily: compilerFamily === "clang" ? "clang" : "mingw"
  };
}

function normalizeToolPolicy(raw: unknown, fallback: ToolPolicy): ToolPolicy {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mode: isToolInstallMode(record.mode) ? record.mode : fallback.mode,
    version: normalizeString(record.version, fallback.version)
  };
}

function normalizeCompilerPolicy(
  raw: unknown,
  fallback: CompilerToolPolicy,
  compiler: CompilerConfigPayload
): CompilerToolPolicy {
  const base = normalizeToolPolicy(raw, fallback);
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallbackPreference =
    compiler.preferredFamily ?? fallback.preferredFamily ?? hostAdapter.compilerFamily;

  return {
    ...base,
    preferredFamily: normalizeCompilerPreferenceForHost(
      record.preferredFamily,
      fallbackPreference
    ),
    msvcInstallationPath:
      normalizeOptionalString(record.msvcInstallationPath) ??
      compiler.msvcInstallationPath ??
      fallback.msvcInstallationPath
  };
}

function normalizeCompilerConfig(
  raw: unknown,
  fallback: CompilerConfigPayload
): CompilerConfigPayload {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallbackPreference = fallback.preferredFamily ?? hostAdapter.compilerFamily;

  return {
    preferredFamily: normalizeCompilerPreferenceForHost(
      record.preferredFamily,
      fallbackPreference
    ),
    msvcInstallationPath:
      normalizeOptionalString(record.msvcInstallationPath) ??
      fallback.msvcInstallationPath
  };
}

function normalizePackageConfig(
  raw: unknown,
  fallback: PackageConfigPayload
): PackageConfigPayload {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    version: normalizeString(record.version, fallback.version),
    vendor: normalizeString(record.vendor, fallback.vendor),
    generators: normalizeNonEmptyStringArray(record.generators, fallback.generators),
    outputDir: normalizeString(record.outputDir, fallback.outputDir),
    licenseFile: normalizeOptionalString(record.licenseFile),
    readmeFile: normalizeOptionalString(record.readmeFile),
    icon: normalizeOptionalString(record.icon)
  };
}

function normalizePresetConfig(
  raw: unknown,
  index: number,
  fallbackTargetTriplet: string
): PresetConfigPayload | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!record) {
    return null;
  }

  const presetNames = getDefaultPresetNames();
  const fallbackName =
    index === 0 ? presetNames.debug : index === 1 ? presetNames.release : `preset-${index + 1}`;
  const name = normalizeString(record.name, fallbackName);
  if (name.length === 0) {
    return null;
  }

  return {
    name,
    displayName: normalizeOptionalString(record.displayName),
    buildType: normalizeOptionalString(record.buildType),
    targetTriplet: normalizeOptionalString(record.targetTriplet) ?? fallbackTargetTriplet,
    runnable: normalizeBoolean(record.runnable, true)
  };
}

function mergeToolPolicies(
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

function mergeCompilerConfig(
  current: CompilerConfigPayload | undefined,
  next: CompilerConfigPayload | undefined
): CompilerConfigPayload | undefined {
  if (!current && !next) {
    return undefined;
  }

  return {
    ...current,
    ...next
  };
}

function mergePackageConfig(
  current: PackageConfigPayload | undefined,
  next: PackageConfigPayload | undefined
): PackageConfigPayload | undefined {
  if (!current && !next) {
    return undefined;
  }

  const seed = next ?? current;
  if (!seed) {
    return undefined;
  }

  return {
    version: next?.version ?? current?.version ?? seed.version,
    vendor: next?.vendor ?? current?.vendor ?? seed.vendor,
    generators: next?.generators ?? current?.generators ?? ["ZIP"],
    outputDir: next?.outputDir ?? current?.outputDir ?? seed.outputDir,
    licenseFile: next?.licenseFile ?? current?.licenseFile,
    readmeFile: next?.readmeFile ?? current?.readmeFile,
    icon: next?.icon ?? current?.icon
  };
}

export function defaultProjectConfig(
  projectName: string,
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily
): NormalizedProjectConfig {
  const targetTriplet = defaultTargetTripletForCompiler(compilerFamily);
  const targetName = createSafeTargetName(projectName);
  const compiler =
    compilerFamily === "msvc"
      ? { preferredFamily: "msvc" as const }
      : compilerFamily === "clang"
        ? { preferredFamily: "clang" as const }
      : { preferredFamily: "mingw" as const };

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    name: projectName,
    targetName,
    defaultPreset: getDefaultPresetName(),
    sourceFile: "src/main.cpp",
    cxxStandard: 20,
    targetTriplet,
    dependencyBackend: hostAdapter.getDefaultDependencyBackend(),
    dependencies: [],
    cmake: defaultCmakeConfig(),
    compiler,
    package: defaultPackageConfig(projectName),
    tools: {
      cmake: defaultToolPolicy("cmake"),
      ninja: defaultToolPolicy("ninja"),
      vcpkg: defaultToolPolicy("vcpkg"),
      conan: defaultToolPolicy("conan"),
      cxx: defaultCompilerPolicy(compilerFamily)
    },
    presets: createDefaultPresets(targetTriplet)
  };
}

export function normalizeProjectConfig(
  raw: PartialProjectConfig,
  fallbackName: string,
  options: {
    base?: NormalizedProjectConfig;
    compilerFamily?: CompilerFamily;
  } = {}
): NormalizedProjectConfig {
  const inferredCompilerFamily =
    options.compilerFamily ??
    normalizeCompilerPreferenceForHost(
      raw.compiler?.preferredFamily,
      normalizeCompilerPreferenceForHost(
        raw.tools?.cxx?.preferredFamily,
        options.base?.compiler.preferredFamily ?? hostAdapter.compilerFamily
      )
    );
  const seed = options.base ?? defaultProjectConfig(fallbackName, inferredCompilerFamily);
  const name = normalizeString(raw.name, seed.name) || fallbackName;
  const packageSeed =
    options.base && options.base.name === name
      ? options.base.package
      : defaultPackageConfig(name);

  const compiler = normalizeCompilerConfig(
    mergeCompilerConfig(raw.compiler, raw.tools?.cxx),
    seed.compiler
  );
  const derivedTargetName = createSafeTargetName(name);
  const targetName = normalizeString(
    raw.targetName,
    options.base && options.base.name === name
      ? options.base.targetName
      : derivedTargetName
  );
  const targetTriplet = normalizeString(raw.targetTriplet, seed.targetTriplet);
  const dependencyBackend = isDependencyBackend(raw.dependencyBackend)
    ? raw.dependencyBackend
    : seed.dependencyBackend;
  const presetsSource = Array.isArray(raw.presets) ? raw.presets : seed.presets;
  const normalizedPresets = presetsSource
    .map((preset, index) => normalizePresetConfig(preset, index, targetTriplet))
    .filter((preset): preset is PresetConfigPayload => preset !== null);
  const presets =
    normalizedPresets.length > 0 ? normalizedPresets : createDefaultPresets(targetTriplet);
  const requestedDefaultPreset = normalizeString(raw.defaultPreset, seed.defaultPreset);
  const defaultPreset = presets.some((preset) => preset.name === requestedDefaultPreset)
    ? requestedDefaultPreset
    : presets[0]?.name ?? seed.defaultPreset;

  return {
    schemaVersion: normalizePositiveInteger(raw.schemaVersion, seed.schemaVersion),
    name,
    targetName,
    defaultPreset,
    sourceFile: normalizeString(raw.sourceFile, seed.sourceFile),
    cxxStandard: normalizePositiveInteger(raw.cxxStandard, seed.cxxStandard),
    targetTriplet,
    dependencyBackend,
    dependencies:
      raw.dependencies !== undefined
        ? normalizeStringArray(raw.dependencies)
        : [...seed.dependencies],
    cmake: {
      compileDefinitions:
        raw.cmake?.compileDefinitions !== undefined
          ? normalizeStringArray(raw.cmake.compileDefinitions)
          : [...seed.cmake.compileDefinitions],
      compileOptions:
        raw.cmake?.compileOptions !== undefined
          ? normalizeStringArray(raw.cmake.compileOptions)
          : [...seed.cmake.compileOptions],
      includeDirectories:
        raw.cmake?.includeDirectories !== undefined
          ? normalizeStringArray(raw.cmake.includeDirectories)
          : [...seed.cmake.includeDirectories],
      linkLibraries:
        raw.cmake?.linkLibraries !== undefined
          ? normalizeStringArray(raw.cmake.linkLibraries)
          : [...seed.cmake.linkLibraries]
    },
    compiler,
    package: normalizePackageConfig(raw.package, packageSeed),
    tools: {
      cmake: normalizeToolPolicy(raw.tools?.cmake, seed.tools.cmake),
      ninja: normalizeToolPolicy(raw.tools?.ninja, seed.tools.ninja),
      vcpkg: normalizeToolPolicy(raw.tools?.vcpkg, seed.tools.vcpkg),
      conan: normalizeToolPolicy(raw.tools?.conan, seed.tools.conan),
      cxx: normalizeCompilerPolicy(raw.tools?.cxx, seed.tools.cxx, compiler)
    },
    presets
  };
}

export function mergeProjectConfigPayload(
  current: NormalizedProjectConfig,
  payload: ProjectConfigPayload,
  fallbackName: string
): NormalizedProjectConfig {
  return normalizeProjectConfig(
    {
      ...current,
      ...payload,
      compiler: mergeCompilerConfig(current.compiler, payload.compiler),
      package: mergePackageConfig(current.package, payload.package),
      tools: mergeToolPolicies(current.tools, payload.tools),
      cmake: {
        ...current.cmake,
        ...(payload.cmake ?? {})
      },
      dependencies: payload.dependencies ?? current.dependencies,
      presets: payload.presets ?? current.presets
    },
    fallbackName,
    { base: current }
  );
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTomlString(raw: string): string {
  const trimmed = raw.trim();
  const quoted = trimmed.match(/^"(.*)"$/);
  if (!quoted) {
    return trimmed;
  }

  return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseTomlNumber(raw: string, fallback: number): number {
  return normalizePositiveInteger(raw, fallback);
}

function splitTomlArrayTokens(body: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaped = false;

  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      current += char;
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        tokens.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    tokens.push(trimmed);
  }

  return tokens;
}

function parseTomlStringArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [];
  }

  const body = trimmed.slice(1, -1).trim();
  if (body.length === 0) {
    return [];
  }

  return splitTomlArrayTokens(body)
    .map((token) => parseTomlString(token))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseTomlBoolean(raw: string, fallback: boolean): boolean {
  return normalizeBoolean(raw.trim(), fallback);
}

function tomlArray(values: string[]): string {
  if (values.length === 0) {
    return "[]";
  }

  return `[${values.map((item) => `"${escapeTomlString(item)}"`).join(", ")}]`;
}

function isPresetConfigPayload(value: unknown): value is PresetConfigPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as PresetConfigPayload).name === "string"
  );
}

export function parseConfigToml(
  content: string,
  fallbackName: string,
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily
): NormalizedProjectConfig {
  const seed = defaultProjectConfig(fallbackName, compilerFamily);
  const raw: PartialProjectConfig = {
    cmake: defaultCmakeConfig(),
    dependencies: [],
    compiler: {},
    package: undefined,
    tools: {},
    presets: []
  };
  let section = "";
  let activePreset: PresetConfigPayload | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const arraySectionMatch = trimmed.match(/^\[\[([a-zA-Z0-9_.-]+)\]\]$/);
    if (arraySectionMatch) {
      section = arraySectionMatch[1] ?? "";
      activePreset = null;

      if (section === "presets") {
        activePreset = {
          name: "",
          targetTriplet: seed.targetTriplet,
          runnable: true
        };
        raw.presets = [...(raw.presets ?? []), activePreset];
      }

      continue;
    }

    const sectionMatch = trimmed.match(/^\[([a-zA-Z0-9_.-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1] ?? "";
      activePreset = null;

      if (section.startsWith("presets.")) {
        const name = section.slice("presets.".length).trim();
        if (name.length > 0) {
          activePreset = {
            name,
            targetTriplet: seed.targetTriplet,
            runnable: true
          };
          raw.presets = [...(raw.presets ?? []), activePreset];
        }
      }

      continue;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (!kvMatch) {
      continue;
    }

    const key = kvMatch[1] ?? "";
    const value = kvMatch[2] ?? "";

    if (section === "project") {
      if (key === "schema_version") {
        raw.schemaVersion = parseTomlNumber(value, seed.schemaVersion);
      } else if (key === "name") {
        raw.name = parseTomlString(value);
      } else if (key === "default_preset") {
        raw.defaultPreset = parseTomlString(value);
      } else if (key === "target_name") {
        raw.targetName = parseTomlString(value);
      } else if (key === "source_file") {
        raw.sourceFile = parseTomlString(value);
      } else if (key === "cxx_standard") {
        raw.cxxStandard = parseTomlNumber(value, seed.cxxStandard);
      } else if (key === "target_triplet") {
        raw.targetTriplet = parseTomlString(value);
      } else if (key === "dependency_backend") {
        raw.dependencyBackend = parseTomlString(value) as DependencyBackend;
      }
      continue;
    }

    if (section === "package") {
      raw.package = {
        ...(raw.package ?? defaultPackageConfig(seed.name)),
        ...(key === "version" ? { version: parseTomlString(value) } : {}),
        ...(key === "vendor" ? { vendor: parseTomlString(value) } : {}),
        ...(key === "generators" ? { generators: parseTomlStringArray(value) } : {}),
        ...(key === "output_dir" ? { outputDir: parseTomlString(value) } : {}),
        ...(key === "license_file" ? { licenseFile: parseTomlString(value) } : {}),
        ...(key === "readme_file" ? { readmeFile: parseTomlString(value) } : {}),
        ...(key === "icon" ? { icon: parseTomlString(value) } : {})
      };
      continue;
    }

    if (section === "compiler") {
      if (key === "preferred_family") {
        raw.compiler = {
          ...(raw.compiler ?? {}),
          preferredFamily: parseTomlString(value) as CompilerPreference
        };
      } else if (key === "msvc_installation_path") {
        raw.compiler = {
          ...(raw.compiler ?? {}),
          msvcInstallationPath: parseTomlString(value)
        };
      }
      continue;
    }

    if (section === "dependencies") {
      if (key === "packages") {
        raw.dependencies = parseTomlStringArray(value);
      }
      continue;
    }

    if (section === "cmake") {
      if (key === "compile_definitions") {
        raw.cmake = {
          ...(raw.cmake ?? defaultCmakeConfig()),
          compileDefinitions: parseTomlStringArray(value)
        };
      } else if (key === "compile_options") {
        raw.cmake = {
          ...(raw.cmake ?? defaultCmakeConfig()),
          compileOptions: parseTomlStringArray(value)
        };
      } else if (key === "include_directories") {
        raw.cmake = {
          ...(raw.cmake ?? defaultCmakeConfig()),
          includeDirectories: parseTomlStringArray(value)
        };
      } else if (key === "link_libraries") {
        raw.cmake = {
          ...(raw.cmake ?? defaultCmakeConfig()),
          linkLibraries: parseTomlStringArray(value)
        };
      }
      continue;
    }

    if (section.startsWith("tools.")) {
      const tool = section.slice("tools.".length) as ToolName;
      const currentTools = raw.tools ?? {};
      const currentPolicy = currentTools[tool] ?? {};
      const nextPolicy =
        key === "mode"
          ? { ...currentPolicy, mode: parseTomlString(value) as ToolInstallMode }
          : key === "version"
            ? { ...currentPolicy, version: parseTomlString(value) }
            : key === "preferred_family"
              ? {
                  ...currentPolicy,
                  preferredFamily: parseTomlString(value) as CompilerPreference
                }
              : key === "msvc_installation_path"
                ? {
                    ...currentPolicy,
                    msvcInstallationPath: parseTomlString(value)
                  }
                : currentPolicy;
      raw.tools = {
        ...currentTools,
        [tool]: nextPolicy
      };
      continue;
    }

    if ((section === "presets" || section.startsWith("presets.")) && activePreset) {
      if (key === "name") {
        activePreset.name = parseTomlString(value);
      } else if (key === "display_name") {
        activePreset.displayName = parseTomlString(value);
      } else if (key === "build_type") {
        activePreset.buildType = parseTomlString(value);
      } else if (key === "target_triplet") {
        activePreset.targetTriplet = parseTomlString(value);
      } else if (key === "runnable") {
        activePreset.runnable = parseTomlBoolean(value, true);
      }
    }
  }

  raw.presets = (raw.presets ?? []).filter(isPresetConfigPayload);
  return normalizeProjectConfig(raw, fallbackName, { base: seed });
}

function formatToolPolicySection(name: ToolName, policy: ToolPolicy | CompilerToolPolicy): string {
  const lines = [
    `[tools.${name}]`,
    `mode = "${escapeTomlString(policy.mode)}"`,
    `version = "${escapeTomlString(policy.version)}"`
  ];

  if ("preferredFamily" in policy && policy.preferredFamily) {
    lines.push(`preferred_family = "${escapeTomlString(policy.preferredFamily)}"`);
  }

  if ("msvcInstallationPath" in policy && policy.msvcInstallationPath) {
    lines.push(
      `msvc_installation_path = "${escapeTomlString(policy.msvcInstallationPath)}"`
    );
  }

  return lines.join("\n");
}

export function configToToml(config: NormalizedProjectConfig): string {
  const sections: string[] = [
    "# cppx configuration",
    "[project]",
    `schema_version = ${Math.max(config.schemaVersion, CONFIG_SCHEMA_VERSION)}`,
    `name = "${escapeTomlString(config.name)}"`,
    `target_name = "${escapeTomlString(config.targetName)}"`,
    `default_preset = "${escapeTomlString(config.defaultPreset)}"`,
    `source_file = "${escapeTomlString(config.sourceFile)}"`,
    `cxx_standard = ${config.cxxStandard}`,
    `target_triplet = "${escapeTomlString(config.targetTriplet)}"`,
    `dependency_backend = "${escapeTomlString(config.dependencyBackend)}"`,
    "",
    "[package]",
    `version = "${escapeTomlString(config.package.version)}"`,
    `vendor = "${escapeTomlString(config.package.vendor)}"`,
    `generators = ${tomlArray(config.package.generators)}`,
    `output_dir = "${escapeTomlString(config.package.outputDir)}"`,
    ...(config.package.licenseFile
      ? [`license_file = "${escapeTomlString(config.package.licenseFile)}"`]
      : []),
    ...(config.package.readmeFile
      ? [`readme_file = "${escapeTomlString(config.package.readmeFile)}"`]
      : []),
    ...(config.package.icon ? [`icon = "${escapeTomlString(config.package.icon)}"`] : []),
    "",
    "[compiler]"
  ];

  if (config.compiler.preferredFamily) {
    sections.push(
      `preferred_family = "${escapeTomlString(config.compiler.preferredFamily)}"`
    );
  }
  if (config.compiler.msvcInstallationPath) {
    sections.push(
      `msvc_installation_path = "${escapeTomlString(config.compiler.msvcInstallationPath)}"`
    );
  }

  sections.push(
    "",
    "[dependencies]",
    `packages = ${tomlArray(config.dependencies)}`,
    "",
    "[cmake]",
    `compile_definitions = ${tomlArray(config.cmake.compileDefinitions)}`,
    `compile_options = ${tomlArray(config.cmake.compileOptions)}`,
    `include_directories = ${tomlArray(config.cmake.includeDirectories)}`,
    `link_libraries = ${tomlArray(config.cmake.linkLibraries)}`,
    "",
    formatToolPolicySection("cmake", config.tools.cmake),
    "",
    formatToolPolicySection("ninja", config.tools.ninja),
    "",
    formatToolPolicySection("vcpkg", config.tools.vcpkg),
    "",
    formatToolPolicySection("conan", config.tools.conan),
    "",
    formatToolPolicySection("cxx", config.tools.cxx)
  );

  for (const preset of config.presets) {
    sections.push(
      "",
      "[[presets]]",
      `name = "${escapeTomlString(preset.name)}"`
    );

    if (preset.displayName) {
      sections.push(`display_name = "${escapeTomlString(preset.displayName)}"`);
    }
    if (preset.buildType) {
      sections.push(`build_type = "${escapeTomlString(preset.buildType)}"`);
    }
    if (preset.targetTriplet) {
      sections.push(`target_triplet = "${escapeTomlString(preset.targetTriplet)}"`);
    }
    if (preset.runnable !== undefined) {
      sections.push(`runnable = ${preset.runnable ? "true" : "false"}`);
    }
  }

  return `${sections.join("\n")}\n`;
}

export async function writeProjectConfigToml(
  workspace: string,
  config: NormalizedProjectConfig
): Promise<void> {
  const targetPath = path.join(workspace, CPPX_CONFIG_PATH);
  await writeTextFile(targetPath, configToToml({ ...config, schemaVersion: CONFIG_SCHEMA_VERSION }));
}

async function migrateLegacyConfig(
  workspace: string,
  compilerFamily: CompilerFamily
): Promise<NormalizedProjectConfig | null> {
  const legacyPath = path.join(workspace, LEGACY_PROJECT_CONFIG_PATH);
  if (!(await pathExists(legacyPath))) {
    return null;
  }

  const legacy = await readJsonFile<{ name?: string }>(legacyPath, {});
  const config = defaultProjectConfig(
    legacy.name?.trim() || path.basename(workspace),
    compilerFamily
  );

  const legacyVcpkg = path.join(workspace, "vcpkg.json");
  if (await pathExists(legacyVcpkg)) {
    const vcpkg = await readJsonFile<{ dependencies?: unknown }>(legacyVcpkg, {});
    if (Array.isArray(vcpkg.dependencies)) {
      config.dependencies = vcpkg.dependencies
        .filter((dep): dep is string => typeof dep === "string")
        .map((dep) => dep.trim())
        .filter((dep) => dep.length > 0);
    }
  }

  await writeProjectConfigToml(workspace, config);
  return config;
}

export async function readProjectConfig(
  workspace: string,
  compilerFamily: CompilerFamily = hostAdapter.compilerFamily
): Promise<NormalizedProjectConfig> {
  const configPath = path.join(workspace, CPPX_CONFIG_PATH);
  const fallbackName = path.basename(workspace);

  if (await pathExists(configPath)) {
    const content = await fs.readFile(configPath, "utf-8");
    return parseConfigToml(content, fallbackName, compilerFamily);
  }

  const migrated = await migrateLegacyConfig(workspace, compilerFamily);
  if (migrated) {
    return migrated;
  }

  throw new CppxError(
    "cppx 설정을 찾을 수 없습니다.",
    `${CPPX_CONFIG_PATH} 경로를 기대했습니다. 먼저 cppx init을 실행하세요.`
  );
}

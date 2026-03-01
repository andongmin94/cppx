import { promises as fs } from "node:fs";
import path from "node:path";
import type { CmakeConfig, ProjectConfigPayload } from "@shared/contracts";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import { ensureDir, pathExists, readJsonFile, writeJsonFile, writeTextFile } from "./fs-utils";
import type { CppxLogger } from "./logger";
import type { Toolchain } from "./types";

type ProjectConfig = ProjectConfigPayload;

const CPPX_CONFIG_PATH = path.join(".cppx", "config.toml");
const LEGACY_PROJECT_CONFIG_PATH = path.join(".cppx", "project.json");
const GENERATED_ROOT = ".cppx";
const LEGACY_GENERATED_ROOT = path.join(".cppx", "generated");

function defaultCmakeConfig(): CmakeConfig {
  return {
    compileDefinitions: [],
    compileOptions: [],
    includeDirectories: [],
    linkLibraries: []
  };
}

function defaultTargetTripletForCompiler(compilerFamily: Toolchain["compilerFamily"]): string {
  return compilerFamily === "msvc" ? "x64-windows" : "x64-mingw-dynamic";
}

function resolveEffectiveTargetTriplet(
  rawTriplet: string,
  compilerFamily: Toolchain["compilerFamily"]
): string {
  const triplet = rawTriplet.trim();
  if (triplet.length === 0) {
    return defaultTargetTripletForCompiler(compilerFamily);
  }

  if (compilerFamily === "msvc" && /mingw/i.test(triplet)) {
    return "x64-windows";
  }

  return triplet;
}

function defaultConfig(
  projectName: string,
  compilerFamily: Toolchain["compilerFamily"] = "mingw"
): ProjectConfig {
  return {
    name: projectName,
    defaultPreset: "debug-x64",
    sourceFile: "src/main.cpp",
    cxxStandard: 20,
    targetTriplet: defaultTargetTripletForCompiler(compilerFamily),
    dependencies: [],
    cmake: defaultCmakeConfig()
  };
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
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  return body
    .split(",")
    .map((token) => parseTomlString(token))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
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

function normalizeConfig(
  raw: Partial<ProjectConfig>,
  fallbackName: string,
  base?: ProjectConfig
): ProjectConfig {
  const seed = base ?? defaultConfig(fallbackName);

  const rawCmake =
    raw.cmake && typeof raw.cmake === "object"
      ? (raw.cmake as Partial<CmakeConfig>)
      : undefined;

  const nextName = (typeof raw.name === "string" ? raw.name : seed.name).trim() || fallbackName;
  const nextDefaultPreset =
    (typeof raw.defaultPreset === "string" ? raw.defaultPreset : seed.defaultPreset).trim() ||
    "debug-x64";
  const nextSourceFile =
    (typeof raw.sourceFile === "string" ? raw.sourceFile : seed.sourceFile).trim() ||
    "src/main.cpp";
  const nextTargetTriplet =
    (typeof raw.targetTriplet === "string" ? raw.targetTriplet : seed.targetTriplet).trim() ||
    "x64-mingw-dynamic";

  const cxxCandidate =
    typeof raw.cxxStandard === "number" ? raw.cxxStandard : seed.cxxStandard;
  const nextCxxStandard = Number.isFinite(cxxCandidate) && cxxCandidate > 0
    ? Math.trunc(cxxCandidate)
    : seed.cxxStandard;

  return {
    name: nextName,
    defaultPreset: nextDefaultPreset,
    sourceFile: nextSourceFile,
    cxxStandard: nextCxxStandard,
    targetTriplet: nextTargetTriplet,
    dependencies:
      raw.dependencies !== undefined
        ? normalizeStringArray(raw.dependencies)
        : [...seed.dependencies],
    cmake: {
      compileDefinitions:
        rawCmake && rawCmake.compileDefinitions !== undefined
          ? normalizeStringArray(rawCmake.compileDefinitions)
          : [...seed.cmake.compileDefinitions],
      compileOptions:
        rawCmake && rawCmake.compileOptions !== undefined
          ? normalizeStringArray(rawCmake.compileOptions)
          : [...seed.cmake.compileOptions],
      includeDirectories:
        rawCmake && rawCmake.includeDirectories !== undefined
          ? normalizeStringArray(rawCmake.includeDirectories)
          : [...seed.cmake.includeDirectories],
      linkLibraries:
        rawCmake && rawCmake.linkLibraries !== undefined
          ? normalizeStringArray(rawCmake.linkLibraries)
          : [...seed.cmake.linkLibraries]
    }
  };
}

function parseConfigToml(content: string, fallbackName: string): ProjectConfig {
  const config = defaultConfig(fallbackName);
  let section = "";

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([a-zA-Z0-9_-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1] ?? "";
      continue;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (!kvMatch) {
      continue;
    }

    const key = kvMatch[1] ?? "";
    const value = kvMatch[2] ?? "";

    if (section === "project") {
      if (key === "name") {
        config.name = parseTomlString(value);
      } else if (key === "default_preset") {
        config.defaultPreset = parseTomlString(value);
      } else if (key === "source_file") {
        config.sourceFile = parseTomlString(value);
      } else if (key === "cxx_standard") {
        config.cxxStandard = parseTomlNumber(value, config.cxxStandard);
      } else if (key === "target_triplet") {
        config.targetTriplet = parseTomlString(value);
      }
    } else if (section === "dependencies" && key === "packages") {
      config.dependencies = parseTomlStringArray(value);
    } else if (section === "cmake") {
      if (key === "compile_definitions") {
        config.cmake.compileDefinitions = parseTomlStringArray(value);
      } else if (key === "compile_options") {
        config.cmake.compileOptions = parseTomlStringArray(value);
      } else if (key === "include_directories") {
        config.cmake.includeDirectories = parseTomlStringArray(value);
      } else if (key === "link_libraries") {
        config.cmake.linkLibraries = parseTomlStringArray(value);
      }
    }
  }

  return normalizeConfig(config, fallbackName);
}

function tomlArray(values: string[]): string {
  if (values.length === 0) {
    return "[]";
  }
  return `[${values.map((item) => `"${escapeTomlString(item)}"`).join(", ")}]`;
}

function configToToml(config: ProjectConfig): string {
  return `# cppx configuration
[project]
name = "${escapeTomlString(config.name)}"
default_preset = "${escapeTomlString(config.defaultPreset)}"
source_file = "${escapeTomlString(config.sourceFile)}"
cxx_standard = ${config.cxxStandard}
target_triplet = "${escapeTomlString(config.targetTriplet)}"

[dependencies]
packages = ${tomlArray(config.dependencies)}

[cmake]
compile_definitions = ${tomlArray(config.cmake.compileDefinitions)}
compile_options = ${tomlArray(config.cmake.compileOptions)}
include_directories = ${tomlArray(config.cmake.includeDirectories)}
link_libraries = ${tomlArray(config.cmake.linkLibraries)}
`;
}

async function writeProjectConfigToml(workspace: string, config: ProjectConfig): Promise<void> {
  const targetPath = path.join(workspace, CPPX_CONFIG_PATH);
  await writeTextFile(targetPath, configToToml(config));
}

async function migrateLegacyConfig(workspace: string): Promise<ProjectConfig | null> {
  const legacyPath = path.join(workspace, LEGACY_PROJECT_CONFIG_PATH);
  if (!(await pathExists(legacyPath))) {
    return null;
  }

  const legacy = await readJsonFile<{ name?: string }>(legacyPath, {});
  const config = defaultConfig(legacy.name?.trim() || path.basename(workspace));

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

async function readProjectConfig(workspace: string): Promise<ProjectConfig> {
  const configPath = path.join(workspace, CPPX_CONFIG_PATH);
  const fallbackName = path.basename(workspace);

  if (await pathExists(configPath)) {
    const content = await fs.readFile(configPath, "utf-8");
    return parseConfigToml(content, fallbackName);
  }

  const migrated = await migrateLegacyConfig(workspace);
  if (migrated) {
    return migrated;
  }

  throw new CppxError(
    "cppx 설정을 찾을 수 없습니다.",
    `${CPPX_CONFIG_PATH} 경로를 기대했습니다. 먼저 cppx init을 실행하세요.`
  );
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeCmakeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderCmakeArgs(values: string[]): string {
  return values.map((value) => `"${escapeCmakeString(value)}"`).join(" ");
}

function createCmakeCustomizationBlock(config: ProjectConfig): string {
  const lines: string[] = [];

  if (config.cmake.compileDefinitions.length > 0) {
    lines.push(
      `target_compile_definitions(${config.name} PRIVATE ${renderCmakeArgs(config.cmake.compileDefinitions)})`
    );
  }

  if (config.cmake.compileOptions.length > 0) {
    lines.push(
      `target_compile_options(${config.name} PRIVATE ${renderCmakeArgs(config.cmake.compileOptions)})`
    );
  }

  if (config.cmake.includeDirectories.length > 0) {
    lines.push(
      `target_include_directories(${config.name} PRIVATE ${renderCmakeArgs(config.cmake.includeDirectories)})`
    );
  }

  if (config.cmake.linkLibraries.length > 0) {
    lines.push(
      `target_link_libraries(${config.name} PRIVATE ${renderCmakeArgs(config.cmake.linkLibraries)})`
    );
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function createMainCppTemplate(projectName: string): string {
  return `#include <iostream>

int main() {
  std::cout << "${projectName} is running via cppx!\\n";
  return 0;
}
`;
}

function createGeneratedCMakeLists(config: ProjectConfig): string {
  const sourceExpr = `\${CMAKE_CURRENT_LIST_DIR}/../${toPosixPath(config.sourceFile)}`;
  const customization = createCmakeCustomizationBlock(config);

  return `cmake_minimum_required(VERSION 3.28)
project(${config.name} VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD ${config.cxxStandard})
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(${config.name} "${sourceExpr}")
${customization}include(CTest)
if(BUILD_TESTING)
  add_test(NAME ${config.name}_runs COMMAND ${config.name})
endif()

install(TARGETS ${config.name} RUNTIME DESTINATION bin)

set(CPACK_PACKAGE_NAME "${config.name}")
set(CPACK_PACKAGE_VENDOR "cppx")
set(CPACK_PACKAGE_VERSION "\${PROJECT_VERSION}")
set(CPACK_GENERATOR "ZIP")
include(CPack)
`;
}

function createGeneratedPresets(
  config: ProjectConfig,
  toolchain: Toolchain
): Record<string, unknown> {
  const vcpkgRoot = path.dirname(toolchain.vcpkg);
  const vcpkgToolchain = path.join(vcpkgRoot, "scripts", "buildsystems", "vcpkg.cmake");
  const targetTriplet = resolveEffectiveTargetTriplet(
    config.targetTriplet,
    toolchain.compilerFamily
  );

  const common = {
    generator: "Ninja",
    toolchainFile: vcpkgToolchain,
    cacheVariables: {
      CMAKE_MAKE_PROGRAM: toolchain.ninja,
      CMAKE_CXX_COMPILER: toolchain.cxx,
      VCPKG_TARGET_TRIPLET: targetTriplet
    },
    environment: {
      VCPKG_ROOT: vcpkgRoot,
      VCPKG_MANIFEST_DIR: "${sourceDir}"
    }
  };

  return {
    version: 6,
    cmakeMinimumRequired: { major: 3, minor: 28, patch: 0 },
    configurePresets: [
      {
        name: "debug-x64",
        displayName: "Debug x64",
        binaryDir: "${sourceDir}/../build/debug-x64",
        ...common,
        cacheVariables: {
          ...common.cacheVariables,
          CMAKE_BUILD_TYPE: "Debug"
        }
      },
      {
        name: "release-x64",
        displayName: "Release x64",
        binaryDir: "${sourceDir}/../build/release-x64",
        ...common,
        cacheVariables: {
          ...common.cacheVariables,
          CMAKE_BUILD_TYPE: "Release"
        }
      }
    ],
    buildPresets: [
      { name: "debug-x64", configurePreset: "debug-x64" },
      { name: "release-x64", configurePreset: "release-x64" }
    ],
    testPresets: [
      {
        name: "debug-x64",
        configurePreset: "debug-x64",
        output: { outputOnFailure: true }
      },
      {
        name: "release-x64",
        configurePreset: "release-x64",
        output: { outputOnFailure: true }
      }
    ],
    packagePresets: [
      { name: "debug-x64", configurePreset: "debug-x64", generators: ["ZIP"] },
      { name: "release-x64", configurePreset: "release-x64", generators: ["ZIP"] }
    ]
  };
}

function createGeneratedVcpkgManifest(config: ProjectConfig): Record<string, unknown> {
  return {
    name: config.name.toLowerCase().replace(/\s+/g, "-"),
    version: "0.1.0",
    dependencies: config.dependencies
  };
}

async function syncGeneratedFiles(
  workspace: string,
  config: ProjectConfig,
  toolchain: Toolchain
): Promise<void> {
  const generatedRoot = path.join(workspace, GENERATED_ROOT);
  await ensureDir(generatedRoot);

  await writeTextFile(
    path.join(generatedRoot, "CMakeLists.txt"),
    createGeneratedCMakeLists(config)
  );
  await writeJsonFile(
    path.join(generatedRoot, "CMakePresets.json"),
    createGeneratedPresets(config, toolchain)
  );
  await writeJsonFile(
    path.join(generatedRoot, "vcpkg.json"),
    createGeneratedVcpkgManifest(config)
  );
}

function buildToolEnv(toolchain: Toolchain, manifestDir: string): NodeJS.ProcessEnv {
  const vcpkgRoot = path.dirname(toolchain.vcpkg);
  const baseEnv = toolchain.baseEnv ?? process.env;
  const basePath = baseEnv.PATH ?? process.env.PATH ?? "";

  return {
    ...baseEnv,
    PATH: `${toolchain.envPath.join(";")};${basePath}`,
    VCPKG_ROOT: vcpkgRoot,
    VCPKG_MANIFEST_DIR: manifestDir,
    CXX: toolchain.cxx
  };
}

function normalizePathForCompare(value: string): string {
  return path.normalize(value).replace(/\//g, "\\").toLowerCase();
}

async function ensureBuildDirUsesCompiler(
  workspace: string,
  preset: string,
  cxxCompiler: string,
  sourceRoot: string,
  logger: CppxLogger
): Promise<void> {
  const buildDir = path.join(workspace, "build", preset);
  const cachePath = path.join(buildDir, "CMakeCache.txt");
  if (!(await pathExists(cachePath))) {
    return;
  }

  const cache = await fs.readFile(cachePath, "utf-8");
  const match = cache.match(/^CMAKE_CXX_COMPILER:FILEPATH=(.+)$/m);
  if (!match || !match[1]) {
    return;
  }

  const configuredCompiler = normalizePathForCompare(match[1].trim());
  const expectedCompiler = normalizePathForCompare(cxxCompiler);
  const sourceMatch = cache.match(/^CMAKE_HOME_DIRECTORY:INTERNAL=(.+)$/m);
  const configuredSource = sourceMatch?.[1]?.trim();
  const expectedSource = path.resolve(sourceRoot);
  const isSourceMatched =
    configuredSource
      ? normalizePathForCompare(configuredSource) === normalizePathForCompare(expectedSource)
      : true;

  if (configuredCompiler === expectedCompiler && isSourceMatched) {
    return;
  }

  if (configuredCompiler !== expectedCompiler) {
    logger.warn("build", `컴파일러가 변경되어 preset '${preset}'의 build 디렉터리를 다시 생성합니다.`);
  } else {
    logger.warn("build", `CMake source 경로가 변경되어 preset '${preset}'의 build 디렉터리를 다시 생성합니다.`);
  }
  await fs.rm(buildDir, { recursive: true, force: true });
}

function createVSCodeTasks(projectName: string): Record<string, unknown> {
  return {
    version: "2.0.0",
    tasks: [
      {
        label: "cppx: configure debug",
        type: "shell",
        command: "cmake --preset debug-x64",
        options: { cwd: "${workspaceFolder}/.cppx" },
        group: "build"
      },
      {
        label: "cppx: build debug",
        type: "shell",
        command: "cmake --build --preset debug-x64",
        options: { cwd: "${workspaceFolder}/.cppx" },
        dependsOn: "cppx: configure debug",
        group: "build"
      },
      {
        label: "cppx: run debug",
        type: "shell",
        command: `\${workspaceFolder}/build/debug-x64/${projectName}.exe`,
        dependsOn: "cppx: build debug"
      }
    ]
  };
}

function createVSCodeLaunch(projectName: string): Record<string, unknown> {
  return {
    version: "0.2.0",
    configurations: [
      {
        name: "cppx: Launch Debug",
        type: "cppdbg",
        request: "launch",
        program: `\${workspaceFolder}/build/debug-x64/${projectName}.exe`,
        args: [],
        stopAtEntry: false,
        cwd: "\${workspaceFolder}",
        environment: [],
        externalConsole: false,
        MIMode: "gdb"
      }
    ]
  };
}

export async function loadProjectConfig(workspace: string): Promise<ProjectConfigPayload> {
  return readProjectConfig(workspace);
}

export async function saveProjectConfig(
  workspace: string,
  payload: ProjectConfigPayload
): Promise<ProjectConfigPayload> {
  const current = await readProjectConfig(workspace);
  const merged = normalizeConfig(
    {
      ...current,
      ...payload,
      cmake: {
        ...current.cmake,
        ...(payload?.cmake ?? {})
      },
      dependencies: payload?.dependencies ?? current.dependencies
    },
    path.basename(workspace),
    current
  );

  await writeProjectConfigToml(workspace, merged);
  return merged;
}

export async function initProject(
  workspace: string,
  projectName: string | undefined,
  toolchain: Toolchain,
  logger: CppxLogger
): Promise<string> {
  const parentWorkspace = path.resolve(workspace);
  const requestedName = projectName?.trim() ?? "";
  const name = requestedName.length > 0 ? requestedName : path.basename(parentWorkspace);

  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new CppxError("프로젝트 이름이 올바르지 않습니다.");
  }

  const targetWorkspace = parentWorkspace;

  const configPath = path.join(targetWorkspace, CPPX_CONFIG_PATH);

  if (await pathExists(configPath)) {
    throw new CppxError("이 작업 폴더는 이미 cppx로 초기화되어 있습니다.");
  }

  await ensureDir(targetWorkspace);
  await ensureDir(path.join(targetWorkspace, "src"));
  await ensureDir(path.join(targetWorkspace, ".vscode"));
  await ensureDir(path.join(targetWorkspace, ".cppx"));

  const config = defaultConfig(name, toolchain.compilerFamily);
  await writeProjectConfigToml(targetWorkspace, config);

  const sourcePath = path.join(targetWorkspace, config.sourceFile);
  if (!(await pathExists(sourcePath))) {
    await writeTextFile(sourcePath, createMainCppTemplate(name));
  }

  await syncGeneratedFiles(targetWorkspace, config, toolchain);
  await writeJsonFile(path.join(targetWorkspace, ".vscode", "tasks.json"), createVSCodeTasks(name));
  await writeJsonFile(path.join(targetWorkspace, ".vscode", "launch.json"), createVSCodeLaunch(name));

  const gitignorePath = path.join(targetWorkspace, ".gitignore");
  if (!(await pathExists(gitignorePath))) {
    await writeTextFile(gitignorePath, "build/\n.vscode/*.log\n*.obj\n*.pdb\n");
  }

  logger.success("init", `프로젝트 '${name}' 초기화 완료: ${targetWorkspace}`);
  return targetWorkspace;
}

export async function cleanupLegacyWorkspaceFiles(
  workspace: string,
  logger: CppxLogger
): Promise<void> {
  const legacyPaths = [
    "CMakeLists.txt",
    "CMakePresets.json",
    "vcpkg.json"
  ].map((file) => path.join(workspace, file));

  for (const target of legacyPaths) {
    if (await pathExists(target)) {
      await fs.rm(target, { force: true });
      logger.info("system", `레거시 파일 삭제: ${target}`);
    }
  }

  const legacyGeneratedPath = path.join(workspace, LEGACY_GENERATED_ROOT);
  if (await pathExists(legacyGeneratedPath)) {
    await fs.rm(legacyGeneratedPath, { recursive: true, force: true });
    logger.info("system", `레거시 generated 폴더 삭제: ${legacyGeneratedPath}`);
  }
}

export async function addDependency(
  workspace: string,
  dependency: string | undefined,
  logger: CppxLogger
): Promise<void> {
  if (!dependency || dependency.trim().length === 0) {
    throw new CppxError("cppx add에는 의존성 이름이 필요합니다");
  }

  const config = await readProjectConfig(workspace);
  const dep = dependency.trim();
  if (!config.dependencies.includes(dep)) {
    config.dependencies.push(dep);
  }

  await writeProjectConfigToml(workspace, config);
  logger.success("add", `의존성 '${dep}'이(가) ${CPPX_CONFIG_PATH}에 추가되었습니다`);
}

export async function buildWithPreset(
  workspace: string,
  preset: string,
  toolchain: Toolchain,
  logger: CppxLogger
): Promise<void> {
  const config = await readProjectConfig(workspace);
  await syncGeneratedFiles(workspace, config, toolchain);

  const generatedRoot = path.join(workspace, GENERATED_ROOT);
  const env = buildToolEnv(toolchain, generatedRoot);

  logger.info("build", `컴파일러: ${toolchain.cxx}`);
  await ensureBuildDirUsesCompiler(workspace, preset, toolchain.cxx, generatedRoot, logger);

  await runSpawn(
    {
      action: "build",
      command: toolchain.cmake,
      args: ["--preset", preset, "--no-warn-unused-cli"],
      cwd: generatedRoot,
      env
    },
    logger
  );
  await runSpawn(
    {
      action: "build",
      command: toolchain.cmake,
      args: ["--build", "--preset", preset],
      cwd: generatedRoot,
      env
    },
    logger
  );

  logger.success("build", `preset '${preset}' build 완료`);
}

export async function runPresetBinary(
  workspace: string,
  preset: string,
  toolchain: Toolchain,
  logger: CppxLogger
): Promise<void> {
  const config = await readProjectConfig(workspace);
  const binary = path.join(workspace, "build", preset, `${config.name}.exe`);

  if (!(await pathExists(binary))) {
    throw new CppxError(
      `${binary}에 실행 파일이 없습니다. 먼저 cppx build --preset ${preset}을 실행하세요.`
    );
  }

  await runSpawn(
    {
      action: "run",
      command: binary,
      cwd: workspace,
      env: buildToolEnv(toolchain, path.join(workspace, GENERATED_ROOT))
    },
    logger
  );
  logger.success("run", `${binary} 실행 완료`);
}

export async function testPreset(
  workspace: string,
  preset: string,
  toolchain: Toolchain,
  logger: CppxLogger
): Promise<void> {
  const ctest = path.join(path.dirname(toolchain.cmake), "ctest.exe");
  if (!(await pathExists(ctest))) {
    throw new CppxError(`cmake 옆에서 ctest.exe를 찾지 못했습니다: ${ctest}`);
  }

  const config = await readProjectConfig(workspace);
  await syncGeneratedFiles(workspace, config, toolchain);

  await runSpawn(
    {
      action: "test",
      command: ctest,
      args: ["--preset", preset, "--output-on-failure"],
      cwd: path.join(workspace, GENERATED_ROOT),
      env: buildToolEnv(toolchain, path.join(workspace, GENERATED_ROOT))
    },
    logger
  );
  logger.success("test", `preset '${preset}' test 완료`);
}

export async function packagePreset(
  workspace: string,
  preset: string,
  toolchain: Toolchain,
  logger: CppxLogger
): Promise<void> {
  const cpack = path.join(path.dirname(toolchain.cmake), "cpack.exe");
  if (!(await pathExists(cpack))) {
    throw new CppxError(`cmake 옆에서 cpack.exe를 찾지 못했습니다: ${cpack}`);
  }

  const config = await readProjectConfig(workspace);
  await syncGeneratedFiles(workspace, config, toolchain);

  await runSpawn(
    {
      action: "pack",
      command: cpack,
      args: ["--preset", preset],
      cwd: path.join(workspace, GENERATED_ROOT),
      env: buildToolEnv(toolchain, path.join(workspace, GENERATED_ROOT))
    },
    logger
  );
  logger.success("pack", `preset '${preset}' package 생성 완료`);
}

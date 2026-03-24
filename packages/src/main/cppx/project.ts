import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectConfigPayload } from "@shared/contracts";
import { runSpawn } from "./command-runner";
import {
  CPPX_CONFIG_PATH,
  defaultProjectConfig,
  mergeProjectConfigPayload,
  readProjectConfig,
  resolveEffectiveTargetTriplet,
  writeProjectConfigToml
} from "./config";
import {
  getDependencyBackendAdapter,
  type BackendPresetIntegration
} from "./dependency-backends";
import { CppxError } from "./errors";
import { ensureDir, pathExists, writeJsonFile, writeTextFile } from "./fs-utils";
import type { CppxLogger } from "./logger";
import { getHostAdapter } from "./platform";
import type { NormalizedProjectConfig, Toolchain } from "./types";

type ProjectConfig = NormalizedProjectConfig;

const GENERATED_ROOT = ".cppx";
const LEGACY_GENERATED_ROOT = path.join(".cppx", "generated");
const hostAdapter = getHostAdapter();

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
  const common = {
    generator: "Ninja",
    cacheVariables: {
      CMAKE_MAKE_PROGRAM: toolchain.ninja,
      CMAKE_CXX_COMPILER: toolchain.cxx
    }
  };
  const presets = config.presets.length > 0 ? config.presets : [];

  const configurePresets = presets.map((preset) => {
    const { integration } = resolvePresetGeneration(config, toolchain, preset);

    const configurePreset: Record<string, unknown> = {
      name: preset.name,
      displayName: preset.displayName ?? preset.name,
      binaryDir: `\${sourceDir}/../build/${preset.name}`,
      generator: common.generator,
      cacheVariables: {
        ...common.cacheVariables,
        ...(preset.buildType ? { CMAKE_BUILD_TYPE: preset.buildType } : {}),
        ...(integration.cacheVariables ?? {})
      }
    };

    if (integration.toolchainFile) {
      configurePreset.toolchainFile = integration.toolchainFile;
    }

    if (integration.environment && Object.keys(integration.environment).length > 0) {
      configurePreset.environment = integration.environment;
    }

    return configurePreset;
  });

  return {
    version: 6,
    cmakeMinimumRequired: { major: 3, minor: 28, patch: 0 },
    configurePresets,
    buildPresets: presets.map((preset) => ({
      name: preset.name,
      configurePreset: preset.name
    })),
    testPresets: presets.map((preset) => ({
      name: preset.name,
      configurePreset: preset.name,
      output: { outputOnFailure: true }
    })),
    packagePresets: presets.map((preset) => ({
      name: preset.name,
      configurePreset: preset.name,
      generators: ["ZIP"]
    }))
  };
}

async function removeStaleGeneratedFiles(
  generatedRoot: string,
  relativePaths: string[]
): Promise<void> {
  for (const relativePath of relativePaths) {
    await fs.rm(path.join(generatedRoot, relativePath), { force: true });
  }
}

export async function syncGeneratedFiles(
  workspace: string,
  config: ProjectConfig,
  toolchain: Toolchain
): Promise<void> {
  const backend = getDependencyBackendAdapter(config.dependencyBackend);
  const generatedRoot = path.join(workspace, GENERATED_ROOT);
  await ensureDir(generatedRoot);
  await ensureDir(path.join(workspace, ".vscode"));
  await removeStaleGeneratedFiles(generatedRoot, backend.getStaleGeneratedFiles());

  await writeTextFile(
    path.join(generatedRoot, "CMakeLists.txt"),
    createGeneratedCMakeLists(config)
  );
  await writeJsonFile(
    path.join(generatedRoot, "CMakePresets.json"),
    createGeneratedPresets(config, toolchain)
  );

  const artifacts = backend.createArtifacts(config, toolchain);
  for (const artifact of artifacts) {
    if (artifact.kind === "json") {
      await writeJsonFile(path.join(generatedRoot, artifact.relativePath), artifact.content);
    } else {
      await writeTextFile(
        path.join(generatedRoot, artifact.relativePath),
        artifact.content as string
      );
    }
  }

  await writeJsonFile(path.join(workspace, ".vscode", "tasks.json"), createVSCodeTasks(config));
  await writeJsonFile(path.join(workspace, ".vscode", "launch.json"), createVSCodeLaunch(config));
}

function buildToolEnv(
  config: ProjectConfig,
  toolchain: Toolchain,
  manifestDir: string
): NodeJS.ProcessEnv {
  const backend = getDependencyBackendAdapter(config.dependencyBackend);
  const baseEnv = toolchain.baseEnv ?? process.env;
  const basePath = baseEnv.PATH ?? process.env.PATH ?? "";
  const prefix = toolchain.envPath.join(hostAdapter.getPathSeparator());

  return {
    ...baseEnv,
    ...backend.getBuildEnv(config, toolchain, manifestDir),
    PATH:
      prefix.length > 0
        ? `${prefix}${hostAdapter.getPathSeparator()}${basePath}`
        : basePath,
    CXX: toolchain.cxx
  };
}

function normalizePathForCompare(value: string): string {
  return hostAdapter.normalizePath(path.normalize(value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCmakeCacheValue(cache: string, key: string): string | undefined {
  const match = cache.match(new RegExp(`^${escapeRegex(key)}(?::[^=]+)?=(.+)$`, "m"));
  return match?.[1]?.trim();
}

function resolveSourceDirExpression(value: string, sourceRoot: string): string {
  return path.resolve(value.replaceAll("${sourceDir}", sourceRoot));
}

function resolvePresetGeneration(
  config: ProjectConfig,
  toolchain: Toolchain,
  preset: ProjectConfig["presets"][number]
): { targetTriplet: string; integration: BackendPresetIntegration } {
  const backend = getDependencyBackendAdapter(config.dependencyBackend);
  const targetTriplet = resolveEffectiveTargetTriplet(
    preset.targetTriplet ?? config.targetTriplet,
    toolchain.compilerFamily
  );

  return {
    targetTriplet,
    integration: backend.getPresetIntegration(
      {
        ...config,
        targetTriplet
      },
      toolchain,
      {
        ...preset,
        targetTriplet
      }
    )
  };
}

async function ensureBuildDirUsesCompiler(
  workspace: string,
  preset: string,
  cxxCompiler: string,
  sourceRoot: string,
  logger: CppxLogger,
  expectedToolchainFile?: string,
  expectedCacheVariables: Record<string, string> = {}
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
  const configuredToolchainFile = readCmakeCacheValue(cache, "CMAKE_TOOLCHAIN_FILE");
  const isToolchainMatched =
    expectedToolchainFile === undefined
      ? configuredToolchainFile === undefined
      : configuredToolchainFile !== undefined &&
        normalizePathForCompare(configuredToolchainFile) ===
          normalizePathForCompare(expectedToolchainFile);

  if (configuredCompiler === expectedCompiler && isSourceMatched) {
    const hasCacheVariableMismatch = Object.entries(expectedCacheVariables).some(
      ([key, expectedValue]) => readCmakeCacheValue(cache, key) !== expectedValue
    );
    if (!isToolchainMatched || hasCacheVariableMismatch) {
      if (!isToolchainMatched) {
        logger.warn("build", `toolchain 설정이 변경되어 preset '${preset}'의 build 디렉터리를 다시 생성합니다.`);
      } else {
        logger.warn("build", `preset 설정이 변경되어 '${preset}'의 build 디렉터리를 다시 생성합니다.`);
      }
      await fs.rm(buildDir, { recursive: true, force: true });
    }
    return;
  }

  if (configuredCompiler !== expectedCompiler) {
    logger.warn("build", `컴파일러가 변경되어 preset '${preset}'의 build 디렉터리를 다시 생성합니다.`);
  } else {
    logger.warn("build", `CMake source 경로가 변경되어 preset '${preset}'의 build 디렉터리를 다시 생성합니다.`);
  }
  await fs.rm(buildDir, { recursive: true, force: true });
}

function getPresetConfigOrThrow(
  config: ProjectConfig,
  presetName: string
): NonNullable<ProjectConfig["presets"]>[number] {
  const preset = config.presets.find((item) => item.name === presetName);
  if (!preset) {
    throw new CppxError(
      `프리셋 '${presetName}'을(를) 찾지 못했습니다.`,
      `사용 가능한 프리셋: ${config.presets.map((item) => item.name).join(", ")}`
    );
  }
  return preset;
}

function getRunnablePresetOrThrow(
  config: ProjectConfig,
  presetName: string
): NonNullable<ProjectConfig["presets"]>[number] {
  const preset = getPresetConfigOrThrow(config, presetName);
  if (preset.runnable === false) {
    throw new CppxError(
      `프리셋 '${presetName}'은(는) 실행 가능한 preset으로 표시되지 않았습니다.`
    );
  }
  return preset;
}

function getRunnablePresets(config: ProjectConfig): ProjectConfig["presets"] {
  return config.presets.filter((preset) => preset.runnable !== false);
}

function createVSCodeTasks(config: ProjectConfig): Record<string, unknown> {
  const backend = getDependencyBackendAdapter(config.dependencyBackend);
  const backendIntegration = backend.getVSCodeIntegration(config);
  const runnablePresets = getRunnablePresets(config);
  const presetsForTasks = config.presets;

  return {
    version: "2.0.0",
    tasks: [
      ...backendIntegration.tasks,
      ...presetsForTasks.flatMap((preset) => [
        {
          label: `cppx: configure ${preset.name}`,
          type: "shell",
          command: `cmake --preset ${preset.name}`,
          options: { cwd: "${workspaceFolder}/.cppx" },
          ...(backendIntegration.configureDependsOn.length > 0
            ? {
                dependsOn:
                  backendIntegration.configureDependsOn.length === 1
                    ? backendIntegration.configureDependsOn[0]
                    : backendIntegration.configureDependsOn
              }
            : {}),
          group: "build"
        },
        {
          label: `cppx: build ${preset.name}`,
          type: "shell",
          command: `cmake --build --preset ${preset.name}`,
          options: { cwd: "${workspaceFolder}/.cppx" },
          dependsOn: `cppx: configure ${preset.name}`,
          group: "build"
        },
        {
          label: `cppx: test ${preset.name}`,
          type: "shell",
          command: `ctest --preset ${preset.name} --output-on-failure`,
          options: { cwd: "${workspaceFolder}/.cppx" },
          dependsOn: `cppx: build ${preset.name}`,
          group: "test"
        },
        {
          label: `cppx: pack ${preset.name}`,
          type: "shell",
          command: `cpack --preset ${preset.name}`,
          options: { cwd: "${workspaceFolder}/.cppx" },
          dependsOn: `cppx: build ${preset.name}`,
          group: "build"
        }
      ]),
      ...runnablePresets.map((preset) => ({
        label: `cppx: run ${preset.name}`,
        type: "shell",
        command: `\${workspaceFolder}/build/${preset.name}/${hostAdapter.getBinaryName(config.name)}`,
        dependsOn: `cppx: build ${preset.name}`
      }))
    ]
  };
}

function createVSCodeLaunch(config: ProjectConfig): Record<string, unknown> {
  return {
    version: "0.2.0",
    configurations: getRunnablePresets(config).map((preset) => ({
      name: `cppx: Launch ${preset.displayName ?? preset.name}`,
      type: "cppdbg",
      request: "launch",
      program: `\${workspaceFolder}/build/${preset.name}/${hostAdapter.getBinaryName(config.name)}`,
      args: [],
      stopAtEntry: false,
      cwd: "\${workspaceFolder}",
      environment: [],
      externalConsole: false,
      MIMode: "gdb"
    }))
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
  const merged = mergeProjectConfigPayload(current, payload, path.basename(workspace));

  await writeProjectConfigToml(workspace, merged);
  return merged;
}

export async function syncProjectFiles(
  workspace: string,
  toolchain: Toolchain
): Promise<void> {
  const config = await readProjectConfig(workspace);
  await syncGeneratedFiles(workspace, config, toolchain);
}

export async function ensureRunnablePreset(
  workspace: string,
  preset: string
): Promise<void> {
  const config = await readProjectConfig(workspace);
  getRunnablePresetOrThrow(config, preset);
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

  const config = defaultProjectConfig(name, toolchain.compilerFamily);
  await writeProjectConfigToml(targetWorkspace, config);

  const sourcePath = path.join(targetWorkspace, config.sourceFile);
  if (!(await pathExists(sourcePath))) {
    await writeTextFile(sourcePath, createMainCppTemplate(name));
  }

  await syncGeneratedFiles(targetWorkspace, config, toolchain);

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
  getDependencyBackendAdapter(config.dependencyBackend).addDependency(config, dep);

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
  const presetConfig = getPresetConfigOrThrow(config, preset);
  await syncGeneratedFiles(workspace, config, toolchain);

  const generatedRoot = path.join(workspace, GENERATED_ROOT);
  await getDependencyBackendAdapter(config.dependencyBackend).prepareForConfigure(
    config,
    toolchain,
    generatedRoot,
    logger
  );

  logger.info("build", `컴파일러: ${toolchain.cxx}`);
  const { integration } = resolvePresetGeneration(config, toolchain, presetConfig);
  await ensureBuildDirUsesCompiler(
    workspace,
    preset,
    toolchain.cxx,
    generatedRoot,
    logger,
    integration.toolchainFile
      ? resolveSourceDirExpression(integration.toolchainFile, generatedRoot)
      : undefined,
    {
      ...(presetConfig.buildType ? { CMAKE_BUILD_TYPE: presetConfig.buildType } : {}),
      ...integration.cacheVariables
    }
  );

  await runSpawn(
    {
      action: "build",
      command: toolchain.cmake,
      args: ["--preset", preset, "--no-warn-unused-cli"],
      cwd: generatedRoot,
      env: buildToolEnv(config, toolchain, generatedRoot)
    },
    logger
  );
  await runSpawn(
    {
      action: "build",
      command: toolchain.cmake,
      args: ["--build", "--preset", preset],
      cwd: generatedRoot,
      env: buildToolEnv(config, toolchain, generatedRoot)
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
  getRunnablePresetOrThrow(config, preset);
  const binary = path.join(workspace, "build", preset, hostAdapter.getBinaryName(config.name));

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
      env: buildToolEnv(config, toolchain, path.join(workspace, GENERATED_ROOT))
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
  const ctest = path.join(path.dirname(toolchain.cmake), hostAdapter.getCtestExecutableName());
  if (!(await pathExists(ctest))) {
    throw new CppxError(`cmake 옆에서 ${hostAdapter.getCtestExecutableName()}를 찾지 못했습니다: ${ctest}`);
  }

  const config = await readProjectConfig(workspace);
  getPresetConfigOrThrow(config, preset);
  await syncGeneratedFiles(workspace, config, toolchain);
  await getDependencyBackendAdapter(config.dependencyBackend).prepareForConfigure(
    config,
    toolchain,
    path.join(workspace, GENERATED_ROOT),
    logger
  );

  await runSpawn(
    {
      action: "test",
      command: ctest,
      args: ["--preset", preset, "--output-on-failure"],
      cwd: path.join(workspace, GENERATED_ROOT),
      env: buildToolEnv(config, toolchain, path.join(workspace, GENERATED_ROOT))
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
  const cpack = path.join(path.dirname(toolchain.cmake), hostAdapter.getCpackExecutableName());
  if (!(await pathExists(cpack))) {
    throw new CppxError(`cmake 옆에서 ${hostAdapter.getCpackExecutableName()}를 찾지 못했습니다: ${cpack}`);
  }

  const config = await readProjectConfig(workspace);
  getPresetConfigOrThrow(config, preset);
  await syncGeneratedFiles(workspace, config, toolchain);
  await getDependencyBackendAdapter(config.dependencyBackend).prepareForConfigure(
    config,
    toolchain,
    path.join(workspace, GENERATED_ROOT),
    logger
  );

  await runSpawn(
    {
      action: "pack",
      command: cpack,
      args: ["--preset", preset],
      cwd: path.join(workspace, GENERATED_ROOT),
      env: buildToolEnv(config, toolchain, path.join(workspace, GENERATED_ROOT))
    },
    logger
  );
  logger.success("pack", `preset '${preset}' package 생성 완료`);
}

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CppxError } from "../src/main/cppx/errors";
import {
  initProject,
  loadProjectConfig,
  runPresetBinary,
  saveProjectConfig,
  syncProjectFiles
} from "../src/main/cppx/project";
import {
  createLogger,
  createTempDir,
  createToolchain,
  readJson,
  removeDir,
  writeText
} from "./support/helpers";

test("loadProjectConfig falls back to the first preset when default_preset is invalid", async () => {
  const workspace = await createTempDir("preset-default-fallback");

  try {
    await writeText(
      path.join(workspace, ".cppx", "config.toml"),
      `# cppx configuration
[project]
schema_version = 2
name = "preset-app"
default_preset = "missing-preset"
source_file = "src/main.cpp"
cxx_standard = 20
target_triplet = "x64-mingw-dynamic"
dependency_backend = "vcpkg"

[compiler]
preferred_family = "mingw"

[dependencies]
packages = []

[cmake]
compile_definitions = []
compile_options = []
include_directories = []
link_libraries = []

[tools.cmake]
mode = "managed"
version = "default"

[tools.ninja]
mode = "managed"
version = "default"

[tools.vcpkg]
mode = "managed"
version = "default"

[tools.cxx]
mode = "managed"
version = "latest"
preferred_family = "mingw"

[[presets]]
name = "asan-x64"
display_name = "ASan x64"
build_type = "Debug"
target_triplet = "x64-mingw-dynamic"
runnable = true

[[presets]]
name = "release-lto"
display_name = "Release LTO"
build_type = "Release"
target_triplet = "x64-mingw-dynamic"
runnable = true
`
    );

    const config = await loadProjectConfig(workspace);
    assert.equal(config.defaultPreset, "asan-x64");
  } finally {
    await removeDir(workspace);
  }
});

test("syncProjectFiles generates preset matrix artifacts and vscode entries from config presets", async () => {
  const workspace = await createTempDir("preset-matrix");
  const { logger } = createLogger();

  try {
    await initProject(workspace, "matrix-app", createToolchain(), logger);

    const current = await loadProjectConfig(workspace);
    await saveProjectConfig(workspace, {
      ...current,
      defaultPreset: "asan-x64",
      dependencyBackend: "vcpkg",
      presets: [
        {
          name: "asan-x64",
          displayName: "ASan x64",
          buildType: "Debug",
          targetTriplet: "x64-mingw-dynamic",
          runnable: true
        },
        {
          name: "release-lto",
          displayName: "Release LTO",
          buildType: "Release",
          targetTriplet: "x64-mingw-dynamic",
          runnable: true
        },
        {
          name: "arm64-release",
          displayName: "ARM64 Release",
          buildType: "Release",
          targetTriplet: "arm64-windows",
          runnable: false
        }
      ]
    });

    await syncProjectFiles(workspace, createToolchain());

    const presets = await readJson<{
      configurePresets: Array<{
        name: string;
        displayName?: string;
        cacheVariables: Record<string, string>;
        toolchainFile?: string;
      }>;
      buildPresets: Array<{ name: string; configurePreset: string }>;
      testPresets: Array<{ name: string; configurePreset: string }>;
      packagePresets: Array<{ name: string; configurePreset: string }>;
    }>(path.join(workspace, ".cppx", "CMakePresets.json"));

    assert.deepEqual(
      presets.configurePresets.map((preset) => preset.name),
      ["asan-x64", "release-lto", "arm64-release"]
    );
    assert.deepEqual(
      presets.buildPresets.map((preset) => preset.name),
      ["asan-x64", "release-lto", "arm64-release"]
    );
    assert.deepEqual(
      presets.testPresets.map((preset) => preset.name),
      ["asan-x64", "release-lto", "arm64-release"]
    );
    assert.deepEqual(
      presets.packagePresets.map((preset) => preset.name),
      ["asan-x64", "release-lto", "arm64-release"]
    );
    assert.equal(presets.configurePresets[0]?.displayName, "ASan x64");
    assert.equal(
      presets.configurePresets[2]?.cacheVariables.VCPKG_TARGET_TRIPLET,
      "arm64-windows"
    );
    assert.match(presets.configurePresets[0]?.toolchainFile ?? "", /vcpkg\.cmake/i);

    const tasks = await readJson<{
      tasks: Array<{ label: string }>;
    }>(path.join(workspace, ".vscode", "tasks.json"));
    const labels = tasks.tasks.map((task) => task.label);
    assert.deepEqual(labels, [
      "cppx: configure asan-x64",
      "cppx: build asan-x64",
      "cppx: test asan-x64",
      "cppx: pack asan-x64",
      "cppx: configure release-lto",
      "cppx: build release-lto",
      "cppx: test release-lto",
      "cppx: pack release-lto",
      "cppx: configure arm64-release",
      "cppx: build arm64-release",
      "cppx: test arm64-release",
      "cppx: pack arm64-release",
      "cppx: run asan-x64",
      "cppx: run release-lto"
    ]);
    assert.ok(!labels.includes("cppx: run arm64-release"));

    const launch = await readJson<{
      configurations: Array<{ name: string; program: string }>;
    }>(path.join(workspace, ".vscode", "launch.json"));
    assert.deepEqual(
      launch.configurations.map((configuration) => configuration.name),
      ["cppx: Launch ASan x64", "cppx: Launch Release LTO"]
    );
    assert.ok(
      launch.configurations.every(
        (configuration) => !configuration.program.includes("arm64-release")
      )
    );
  } finally {
    await removeDir(workspace);
  }
});

test("runPresetBinary rejects non-runnable presets before checking the output binary", async () => {
  const workspace = await createTempDir("preset-run-guard");
  const { logger } = createLogger();

  try {
    await initProject(workspace, "run-guard-app", createToolchain(), logger);

    const current = await loadProjectConfig(workspace);
    await saveProjectConfig(workspace, {
      ...current,
      presets: [
        {
          name: "debug-x64",
          displayName: "Debug x64",
          buildType: "Debug",
          targetTriplet: "x64-mingw-dynamic",
          runnable: true
        },
        {
          name: "arm64-release",
          displayName: "ARM64 Release",
          buildType: "Release",
          targetTriplet: "arm64-windows",
          runnable: false
        }
      ]
    });

    await assert.rejects(
      () => runPresetBinary(workspace, "arm64-release", createToolchain(), logger),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, /실행 가능한 preset/);
        return true;
      }
    );
  } finally {
    await removeDir(workspace);
  }
});

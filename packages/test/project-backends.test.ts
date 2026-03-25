import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  initProject,
  loadProjectConfig,
  runPresetBinary,
  saveProjectConfig,
  syncGeneratedFiles
} from "../src/main/cppx/project";
import { CppxError } from "../src/main/cppx/errors";
import {
  createLogger,
  createTempDir,
  createToolchain,
  generatedRoot,
  readJson,
  readText,
  removeDir,
  withHostDataRoot
} from "./support/helpers";

test("syncGeneratedFiles supports conan backend and custom preset matrix", async () => {
  const localAppData = await createTempDir("conan-backend-root");
  const workspace = await createTempDir("conan-backend");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "conan-app", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      const updated = await saveProjectConfig(workspace, {
        ...current,
        dependencyBackend: "conan",
        dependencies: ["fmt/11.0.2", "spdlog/1.14.1"],
        presets: [
          {
            name: "asan-x64",
            displayName: "ASan x64",
            buildType: "Debug",
            targetTriplet: "x64-windows",
            runnable: true
          },
          {
            name: "release-lto",
            displayName: "Release LTO",
            buildType: "Release",
            targetTriplet: "x64-windows",
            runnable: false
          }
        ]
      });

      await syncGeneratedFiles(workspace, updated as any, createToolchain());

      assert.match(
        await readText(path.join(generatedRoot(workspace), "conanfile.txt")),
        /\[requires\][\s\S]*fmt\/11\.0\.2[\s\S]*spdlog\/1\.14\.1/
      );
      await assert.rejects(() => readText(path.join(generatedRoot(workspace), "vcpkg.json")));

      const presets = await readJson<any>(path.join(generatedRoot(workspace), "CMakePresets.json"));
      assert.deepEqual(
        presets.configurePresets.map((preset: any) => preset.name),
        ["asan-x64", "release-lto"]
      );
      assert.match(presets.configurePresets[0].toolchainFile, /conan_toolchain\.cmake/);
      assert.equal(
        presets.configurePresets[0].cacheVariables.CMAKE_BUILD_TYPE,
        "Debug"
      );
      assert.equal(
        presets.configurePresets[1].cacheVariables.CMAKE_BUILD_TYPE,
        "Release"
      );

      const tasks = await readJson<any>(path.join(workspace, ".vscode", "tasks.json"));
      const labels = tasks.tasks.map((task: any) => task.label);
      const conanProfile = tasks.tasks.find((task: any) => task.label === "cppx: conan profile");
      const configureAsan = tasks.tasks.find((task: any) => task.label === "cppx: configure asan-x64");
      assert.deepEqual(labels.slice(0, 3), [
        "cppx: conan profile",
        "cppx: deps conan",
        "cppx: configure asan-x64"
      ]);
      assert.equal(conanProfile.command, "conan profile detect --force");
      assert.deepEqual(configureAsan.dependsOn, [
        "cppx: conan profile",
        "cppx: deps conan"
      ]);
      assert.match(JSON.stringify(tasks), /build release-lto/);
      assert.match(JSON.stringify(tasks), /run asan-x64/);
      assert.doesNotMatch(JSON.stringify(tasks), /run release-lto/);

      const launch = await readJson<any>(path.join(workspace, ".vscode", "launch.json"));
      assert.equal(launch.configurations.length, 1);
      assert.match(launch.configurations[0].program, /build[\\/]asan-x64[\\/]/);
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

test("syncGeneratedFiles supports none backend without dependency manifests", async () => {
  const localAppData = await createTempDir("none-backend-root");
  const workspace = await createTempDir("none-backend");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "plain-app", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      const updated = await saveProjectConfig(workspace, {
        ...current,
        dependencyBackend: "none",
        dependencies: [],
        presets: [
          {
            name: "debug-x64",
            displayName: "Debug x64",
            buildType: "Debug",
            runnable: true
          }
        ]
      });

      await syncGeneratedFiles(workspace, updated as any, createToolchain());

      await assert.rejects(() => readText(path.join(generatedRoot(workspace), "vcpkg.json")));
      await assert.rejects(() => readText(path.join(generatedRoot(workspace), "conanfile.txt")));

      const presets = await readJson<any>(path.join(generatedRoot(workspace), "CMakePresets.json"));
      assert.equal(presets.configurePresets[0].toolchainFile, undefined);
      assert.equal(
        presets.configurePresets[0].cacheVariables.VCPKG_TARGET_TRIPLET,
        undefined
      );
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

test("runPresetBinary rejects presets marked as non-runnable", async () => {
  const localAppData = await createTempDir("non-runnable-root");
  const workspace = await createTempDir("non-runnable");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "runner-app", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      await saveProjectConfig(workspace, {
        ...current,
        presets: [
          {
            name: "release-lto",
            displayName: "Release LTO",
            buildType: "Release",
            runnable: false
          }
        ],
        defaultPreset: "release-lto"
      });

      await assert.rejects(
        () => runPresetBinary(workspace, "release-lto", createToolchain(), logger),
        (error) => {
          assert.ok(error instanceof CppxError);
          assert.match(error.message, /실행 가능한 preset/);
          return true;
        }
      );
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

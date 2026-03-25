import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  initProject,
  loadProjectConfig,
  saveProjectConfig
} from "../src/main/cppx/project";
import {
  createLogger,
  createTempDir,
  createToolchain,
  removeDir,
  withHostDataRoot,
  writeText
} from "./support/helpers";

const v2ConfigToml = `# cppx configuration
[project]
name = "v2-app"
default_preset = "release-x64"
source_file = "src/app/main.cpp"
cxx_standard = 23
target_triplet = "x64-windows"
schema_version = 2
dependency_backend = "conan"

[compiler]
preferred_family = "msvc"
msvc_installation_path = "C:\\\\VS\\\\BuildTools"

[dependencies]
packages = [" fmt ", " spdlog "]

[cmake]
compile_definitions = [" USE_SSL ", " APP_VERSION=1 "]
compile_options = [" -Wall ", " -Wextra "]
include_directories = [" include ", " third_party/fmt/include "]
link_libraries = [" bcrypt ", " ws2_32 "]

[tools.cmake]
mode = "managed"
version = "3.30.5"

[tools.ninja]
mode = "system"
version = "1.12.1"

[tools.vcpkg]
mode = "managed"
version = "2024.12.01"

[tools.cxx]
mode = "managed"
version = "17.9.0"
preferred_family = "msvc"
msvc_installation_path = "C:\\\\VS\\\\BuildTools"

[[presets]]
name = "debug-x64"
display_name = "Debug x64"
build_type = "Debug"
target_triplet = "x64-mingw-dynamic"
runnable = true

[[presets]]
name = "release-x64"
display_name = "Release x64"
build_type = "Release"
target_triplet = "x64-windows"
runnable = false
`;

test("loadProjectConfig reads schema v2 fields and normalizes them", async () => {
  const workspace = await createTempDir("config-v2-load");

  try {
    await writeText(path.join(workspace, ".cppx", "config.toml"), v2ConfigToml);

    const config = await loadProjectConfig(workspace);

    assert.equal(config.name, "v2-app");
    assert.equal(config.targetName, "v2-app");
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.defaultPreset, "release-x64");
    assert.equal(config.sourceFile, "src/app/main.cpp");
    assert.equal(config.cxxStandard, 23);
    assert.equal(config.targetTriplet, "x64-windows");
    assert.equal(config.dependencyBackend, "conan");
    assert.deepEqual(config.dependencies, ["fmt", "spdlog"]);
    assert.deepEqual(config.cmake.compileDefinitions, ["USE_SSL", "APP_VERSION=1"]);
    assert.deepEqual(config.cmake.compileOptions, ["-Wall", "-Wextra"]);
    assert.deepEqual(config.cmake.includeDirectories, ["include", "third_party/fmt/include"]);
    assert.deepEqual(config.cmake.linkLibraries, ["bcrypt", "ws2_32"]);
    assert.equal(config.compiler?.preferredFamily, "msvc");
    assert.equal(config.compiler?.msvcInstallationPath, "C:\\VS\\BuildTools");
    assert.equal(config.package?.version, "0.1.0");
    assert.equal(config.package?.vendor, "v2-app");
    assert.deepEqual(config.package?.generators, ["ZIP"]);
    assert.equal(config.package?.outputDir, "dist");
    assert.equal(config.tools?.cmake?.mode, "managed");
    assert.equal(config.tools?.cmake?.version, "3.30.5");
    assert.equal(config.tools?.ninja?.mode, "system");
    assert.equal(config.tools?.ninja?.version, "1.12.1");
    assert.equal(config.tools?.vcpkg?.mode, "managed");
    assert.equal(config.tools?.vcpkg?.version, "2024.12.01");
    assert.equal(config.tools?.cxx?.mode, "managed");
    assert.equal(config.tools?.cxx?.version, "17.9.0");
    assert.equal(config.tools?.cxx?.preferredFamily, "msvc");
    assert.equal(config.tools?.cxx?.msvcInstallationPath, "C:\\VS\\BuildTools");
    assert.deepEqual(config.presets?.map((preset) => preset.name), [
      "debug-x64",
      "release-x64"
    ]);
    assert.equal(config.presets?.[0]?.displayName, "Debug x64");
    assert.equal(config.presets?.[0]?.buildType, "Debug");
    assert.equal(config.presets?.[0]?.runnable, true);
    assert.equal(config.presets?.[1]?.displayName, "Release x64");
    assert.equal(config.presets?.[1]?.buildType, "Release");
    assert.equal(config.presets?.[1]?.runnable, false);
  } finally {
    await removeDir(workspace);
  }
});

test("saveProjectConfig upgrades writable configs to schema v3 while keeping v2 fields readable", async () => {
  const localAppData = await createTempDir("config-v2-save-root");
  const workspace = await createTempDir("config-v2-save");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "v2-save-app", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      const saved = await saveProjectConfig(workspace, {
        ...current,
        schemaVersion: 2,
        dependencyBackend: "conan",
        compiler: {
          preferredFamily: "msvc",
          msvcInstallationPath: "C:\\VS\\BuildTools"
        },
        tools: {
          cmake: { mode: "managed", version: "3.30.5" },
          ninja: { mode: "system", version: "1.12.1" },
          vcpkg: { mode: "managed", version: "2024.12.01" },
          cxx: {
            mode: "managed",
            version: "17.9.0",
            preferredFamily: "msvc",
            msvcInstallationPath: "C:\\VS\\BuildTools"
          }
        },
        presets: [
          {
            name: "debug-x64",
            displayName: "Debug x64",
            buildType: "Debug",
            targetTriplet: "x64-mingw-dynamic",
            runnable: true
          },
          {
            name: "release-x64",
            displayName: "Release x64",
            buildType: "Release",
            targetTriplet: "x64-windows",
            runnable: false
          }
        ],
        dependencies: [" fmt ", " spdlog "],
        cmake: {
          ...current.cmake,
          compileDefinitions: [" USE_SSL ", " APP_VERSION=1 "],
          compileOptions: [" -Wall ", " -Wextra "],
          includeDirectories: [" include ", " third_party/fmt/include "],
          linkLibraries: [" bcrypt ", " ws2_32 "]
        }
      });

      assert.equal(saved.schemaVersion, 3);
      assert.equal(saved.dependencyBackend, "conan");
      assert.equal(saved.compiler?.preferredFamily, "msvc");
      assert.equal(saved.compiler?.msvcInstallationPath, "C:\\VS\\BuildTools");
      assert.equal(saved.tools?.cmake?.mode, "managed");
      assert.equal(saved.tools?.cmake?.version, "3.30.5");
      assert.equal(saved.tools?.ninja?.mode, "system");
      assert.equal(saved.tools?.ninja?.version, "1.12.1");
      assert.equal(saved.tools?.vcpkg?.mode, "managed");
      assert.equal(saved.tools?.vcpkg?.version, "2024.12.01");
      assert.equal(saved.tools?.cxx?.mode, "managed");
      assert.equal(saved.tools?.cxx?.version, "17.9.0");
      assert.equal(saved.tools?.cxx?.preferredFamily, "msvc");
      assert.equal(saved.tools?.cxx?.msvcInstallationPath, "C:\\VS\\BuildTools");
      assert.equal(saved.targetName, "v2-save-app");
      assert.equal(saved.package?.version, "0.1.0");
      assert.equal(saved.package?.vendor, "v2-save-app");
      assert.deepEqual(saved.package?.generators, ["ZIP"]);
      assert.equal(saved.package?.outputDir, "dist");
      assert.deepEqual(saved.dependencies, ["fmt", "spdlog"]);
      assert.deepEqual(saved.cmake.compileDefinitions, ["USE_SSL", "APP_VERSION=1"]);
      assert.deepEqual(saved.cmake.compileOptions, ["-Wall", "-Wextra"]);
      assert.deepEqual(saved.cmake.includeDirectories, ["include", "third_party/fmt/include"]);
      assert.deepEqual(saved.cmake.linkLibraries, ["bcrypt", "ws2_32"]);
      assert.deepEqual(saved.presets?.map((preset) => preset.name), [
        "debug-x64",
        "release-x64"
      ]);

      const reloaded = await loadProjectConfig(workspace);
      assert.equal(reloaded.schemaVersion, 3);
      assert.equal(reloaded.dependencyBackend, "conan");
      assert.equal(reloaded.compiler?.preferredFamily, "msvc");
      assert.equal(reloaded.compiler?.msvcInstallationPath, "C:\\VS\\BuildTools");
      assert.equal(reloaded.tools?.cmake?.mode, "managed");
      assert.equal(reloaded.tools?.cmake?.version, "3.30.5");
      assert.equal(reloaded.tools?.ninja?.mode, "system");
      assert.equal(reloaded.tools?.ninja?.version, "1.12.1");
      assert.equal(reloaded.tools?.vcpkg?.mode, "managed");
      assert.equal(reloaded.tools?.vcpkg?.version, "2024.12.01");
      assert.equal(reloaded.tools?.cxx?.mode, "managed");
      assert.equal(reloaded.tools?.cxx?.version, "17.9.0");
      assert.equal(reloaded.tools?.cxx?.preferredFamily, "msvc");
      assert.equal(reloaded.tools?.cxx?.msvcInstallationPath, "C:\\VS\\BuildTools");
      assert.equal(reloaded.targetName, "v2-save-app");
      assert.equal(reloaded.package?.version, "0.1.0");
      assert.equal(reloaded.package?.vendor, "v2-save-app");
      assert.deepEqual(reloaded.package?.generators, ["ZIP"]);
      assert.equal(reloaded.package?.outputDir, "dist");
      assert.deepEqual(reloaded.dependencies, ["fmt", "spdlog"]);
      assert.deepEqual(reloaded.cmake.compileDefinitions, ["USE_SSL", "APP_VERSION=1"]);
      assert.deepEqual(reloaded.cmake.compileOptions, ["-Wall", "-Wextra"]);
      assert.deepEqual(reloaded.cmake.includeDirectories, ["include", "third_party/fmt/include"]);
      assert.deepEqual(reloaded.cmake.linkLibraries, ["bcrypt", "ws2_32"]);
      assert.deepEqual(reloaded.presets?.map((preset) => preset.name), [
        "debug-x64",
        "release-x64"
      ]);
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

test("saveProjectConfig persists schema v3 target_name and package metadata", async () => {
  const localAppData = await createTempDir("config-v3-root");
  const workspace = await createTempDir("config-v3");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "Fancy App", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      const saved = await saveProjectConfig(workspace, {
        ...current,
        name: "Fancy App",
        targetName: "fancy_app",
        package: {
          version: "1.2.3-beta.1",
          vendor: "Acme Tools",
          generators: ["ZIP", "TGZ"],
          outputDir: "artifacts",
          licenseFile: "LICENSE.txt",
          readmeFile: "README.md",
          icon: "assets/icon.png"
        }
      });

      assert.equal(saved.schemaVersion, 3);
      assert.equal(saved.targetName, "fancy_app");
      assert.equal(saved.package?.version, "1.2.3-beta.1");
      assert.equal(saved.package?.vendor, "Acme Tools");
      assert.deepEqual(saved.package?.generators, ["ZIP", "TGZ"]);
      assert.equal(saved.package?.outputDir, "artifacts");
      assert.equal(saved.package?.licenseFile, "LICENSE.txt");
      assert.equal(saved.package?.readmeFile, "README.md");
      assert.equal(saved.package?.icon, "assets/icon.png");

      const reloaded = await loadProjectConfig(workspace);
      assert.equal(reloaded.schemaVersion, 3);
      assert.equal(reloaded.targetName, "fancy_app");
      assert.equal(reloaded.package?.version, "1.2.3-beta.1");
      assert.equal(reloaded.package?.vendor, "Acme Tools");
      assert.deepEqual(reloaded.package?.generators, ["ZIP", "TGZ"]);
      assert.equal(reloaded.package?.outputDir, "artifacts");
      assert.equal(reloaded.package?.licenseFile, "LICENSE.txt");
      assert.equal(reloaded.package?.readmeFile, "README.md");
      assert.equal(reloaded.package?.icon, "assets/icon.png");
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

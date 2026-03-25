import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { addDependency, loadProjectConfig, saveProjectConfig } from "../src/main/cppx/project";
import { getDefaultPresetName } from "../src/main/cppx/config";
import { CppxError } from "../src/main/cppx/errors";
import { getHostAdapter } from "../src/main/cppx/platform";
import {
  createTempDir,
  createToolchain,
  createLogger,
  readText,
  removeDir,
  withHostDataRoot,
  writeJson
} from "./support/helpers";
import { initProject } from "../src/main/cppx/project";

test("loadProjectConfig migrates the legacy project.json and vcpkg.json files", async () => {
  const localAppData = await createTempDir("config-root");
  const workspace = await createTempDir("legacy-workspace");
  const hostAdapter = getHostAdapter();

  try {
    await withHostDataRoot(localAppData, async () => {
      await writeJson(path.join(workspace, ".cppx", "project.json"), {
        name: "legacy-app"
      });
      await writeJson(path.join(workspace, "vcpkg.json"), {
        dependencies: ["fmt", "boost-asio"]
      });

      const config = await loadProjectConfig(workspace);

      assert.equal(config.name, "legacy-app");
      assert.equal(config.targetName, "legacy-app");
      assert.equal(config.schemaVersion, 3);
      assert.equal(config.defaultPreset, getDefaultPresetName());
      assert.equal(config.sourceFile, "src/main.cpp");
      assert.equal(config.targetTriplet, hostAdapter.getDefaultTargetTriplet("mingw"));
      assert.deepEqual(config.dependencies, ["fmt", "boost-asio"]);
      assert.equal(config.package?.version, "0.1.0");
      assert.equal(config.package?.vendor, "legacy-app");
      assert.deepEqual(config.package?.generators, ["ZIP"]);
      assert.equal(config.package?.outputDir, "dist");
      assert.match(
        await readText(path.join(workspace, ".cppx", "config.toml")),
        /name = "legacy-app"/
      );
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

test("saveProjectConfig writes normalized config and addDependency avoids duplicates", async () => {
  const localAppData = await createTempDir("save-root");
  const workspace = await createTempDir("save-workspace");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      await initProject(workspace, "save-app", createToolchain(), logger);

      const current = await loadProjectConfig(workspace);
      const saved = await saveProjectConfig(workspace, {
        ...current,
        dependencyBackend: "vcpkg",
        dependencies: ["fmt"],
        cmake: {
          ...current.cmake,
          compileDefinitions: ["USE_SSL"],
          compileOptions: ["-Wall"],
          includeDirectories: ["include"],
          linkLibraries: ["bcrypt"]
        }
      });

      assert.deepEqual(saved.dependencies, ["fmt"]);
      assert.deepEqual(saved.cmake.compileDefinitions, ["USE_SSL"]);
      assert.deepEqual(saved.cmake.compileOptions, ["-Wall"]);
      assert.deepEqual(saved.cmake.includeDirectories, ["include"]);
      assert.deepEqual(saved.cmake.linkLibraries, ["bcrypt"]);

      await addDependency(workspace, "fmt", logger);
      await addDependency(workspace, "spdlog", logger);

      const reloaded = await loadProjectConfig(workspace);
      assert.deepEqual(reloaded.dependencies, ["fmt", "spdlog"]);
    });
  } finally {
    await removeDir(localAppData);
    await removeDir(workspace);
  }
});

test("loadProjectConfig fails clearly when cppx config is missing", async () => {
  const workspace = await createTempDir("missing-config");

  try {
    await assert.rejects(
      () => loadProjectConfig(workspace),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, /cppx 설정을 찾을 수 없습니다/);
        assert.match(error.details ?? "", /\.cppx[\\/]config\.toml/);
        return true;
      }
    );
  } finally {
    await removeDir(workspace);
  }
});

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CppxError } from "../src/main/cppx/errors";
import {
  addDependency,
  initProject,
  loadProjectConfig,
  saveProjectConfig,
  syncProjectFiles
} from "../src/main/cppx/project";
import {
  createLogger,
  createTempDir,
  createToolchain,
  generatedRoot,
  readJson,
  readText,
  removeDir
} from "./support/helpers";

test("syncProjectFiles removes vcpkg artifacts for backend none", async () => {
  const workspace = await createTempDir("backend-none");
  const { logger } = createLogger();

  try {
    await initProject(workspace, "none-app", createToolchain(), logger);

    const current = await loadProjectConfig(workspace);
    await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend: "none",
      dependencies: []
    });

    await syncProjectFiles(workspace, createToolchain());

    await assert.rejects(() => readText(path.join(generatedRoot(workspace), "vcpkg.json")));
    await assert.rejects(() => readText(path.join(generatedRoot(workspace), "conanfile.txt")));

    const presets = await readJson<Record<string, any>>(
      path.join(generatedRoot(workspace), "CMakePresets.json")
    );
    assert.equal(presets.configurePresets[0].toolchainFile, undefined);
    assert.equal(presets.configurePresets[0].environment, undefined);
    assert.equal(presets.configurePresets[0].cacheVariables.VCPKG_TARGET_TRIPLET, undefined);
  } finally {
    await removeDir(workspace);
  }
});

test("syncProjectFiles writes conanfile for conan backend", async () => {
  const workspace = await createTempDir("backend-conan");
  const { logger } = createLogger();

  try {
    await initProject(workspace, "conan-app", createToolchain(), logger);

    const current = await loadProjectConfig(workspace);
    await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend: "conan",
      dependencies: ["fmt", "spdlog"]
    });

    await syncProjectFiles(workspace, createToolchain());

    const conanfile = await readText(path.join(generatedRoot(workspace), "conanfile.txt"));
    assert.match(conanfile, /\[requires\]/);
    assert.match(conanfile, /fmt/);
    assert.match(conanfile, /spdlog/);
    await assert.rejects(() => readText(path.join(generatedRoot(workspace), "vcpkg.json")));
  } finally {
    await removeDir(workspace);
  }
});

test("addDependency rejects backend none and accepts conan", async () => {
  const workspace = await createTempDir("backend-add");
  const { logger } = createLogger();

  try {
    await initProject(workspace, "backend-add-app", createToolchain(), logger);

    const current = await loadProjectConfig(workspace);
    await saveProjectConfig(workspace, {
      ...current,
      dependencyBackend: "none",
      dependencies: []
    });

    await assert.rejects(
      () => addDependency(workspace, "fmt", logger),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, /cppx add/);
        return true;
      }
    );

    await saveProjectConfig(workspace, {
      ...(await loadProjectConfig(workspace)),
      dependencyBackend: "conan",
      dependencies: []
    });

    await addDependency(workspace, "fmt", logger);
    const reloaded = await loadProjectConfig(workspace);
    assert.deepEqual(reloaded.dependencies, ["fmt"]);
  } finally {
    await removeDir(workspace);
  }
});

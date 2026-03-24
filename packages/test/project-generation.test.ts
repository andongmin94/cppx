import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { getDefaultPresetNames } from "../src/main/cppx/config";
import { cleanupLegacyWorkspaceFiles, initProject } from "../src/main/cppx/project";
import { getHostAdapter } from "../src/main/cppx/platform";
import {
  createTempDir,
  createToolchain,
  createLogger,
  normalizeNewlines,
  readFixtureJson,
  readFixtureText,
  readJson,
  readText,
  removeDir,
  writeText
} from "./support/helpers";

test("initProject generates the current baseline files for the active host", async () => {
  const workspace = await createTempDir("init-project");
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();
  const defaultPresetNames = getDefaultPresetNames();

  try {
    await initProject(workspace, "sample-app", createToolchain(), logger);

    if (process.platform === "win32") {
      assert.equal(
        normalizeNewlines(await readText(path.join(workspace, ".cppx", "CMakeLists.txt"))),
        normalizeNewlines(await readFixtureText("init-mingw", "CMakeLists.txt"))
      );
      assert.deepEqual(
        await readJson(path.join(workspace, ".cppx", "CMakePresets.json")),
        await readFixtureJson("init-mingw", "CMakePresets.json")
      );
      assert.deepEqual(
        await readJson(path.join(workspace, ".cppx", "vcpkg.json")),
        await readFixtureJson("init-mingw", "vcpkg.json")
      );
    } else {
      const configToml = await readText(path.join(workspace, ".cppx", "config.toml"));
      assert.match(configToml, /dependency_backend = "none"/);
      await assert.rejects(() => readText(path.join(workspace, ".cppx", "vcpkg.json")));
      assert.deepEqual(
        (await readJson<any>(path.join(workspace, ".cppx", "CMakePresets.json"))).configurePresets.map(
          (preset: any) => preset.name
        ),
        [defaultPresetNames.debug, defaultPresetNames.release]
      );
    }

    assert.match(
      await readText(path.join(workspace, "src", "main.cpp")),
      /sample-app is running via cppx!/
    );
    assert.match(
      await readText(path.join(workspace, ".vscode", "tasks.json")),
      new RegExp(hostAdapter.getBinaryName("sample-app").replace(/\./g, "\\."))
    );
    assert.match(
      await readText(path.join(workspace, ".vscode", "launch.json")),
      new RegExp(hostAdapter.getBinaryName("sample-app").replace(/\./g, "\\."))
    );
    assert.match(
      await readText(path.join(workspace, ".gitignore")),
      /\*\.obj/
    );
  } finally {
    await removeDir(workspace);
  }
});

test("cleanupLegacyWorkspaceFiles removes legacy generated files from the workspace root", async () => {
  const workspace = await createTempDir("cleanup-legacy");
  const { logger } = createLogger();

  try {
    await writeText(path.join(workspace, "CMakeLists.txt"), "legacy");
    await writeText(path.join(workspace, "CMakePresets.json"), "{}");
    await writeText(path.join(workspace, "vcpkg.json"), "{}");
    await writeText(path.join(workspace, ".cppx", "generated", "old.txt"), "old");

    await cleanupLegacyWorkspaceFiles(workspace, logger);

    await assert.rejects(() => readText(path.join(workspace, "CMakeLists.txt")));
    await assert.rejects(() => readText(path.join(workspace, "CMakePresets.json")));
    await assert.rejects(() => readText(path.join(workspace, "vcpkg.json")));
    await assert.rejects(() => readText(path.join(workspace, ".cppx", "generated", "old.txt")));
  } finally {
    await removeDir(workspace);
  }
});

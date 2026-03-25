import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  ensureCppxLayout,
  getCppxRoot,
  getDownloadsRoot,
  getToolManifestPath,
  getToolRoot,
  readToolManifest,
  upsertToolRecord
} from "../src/main/cppx/paths";
import { getHostAdapter } from "../src/main/cppx/platform";
import { createTempDir, removeDir, withHostDataRoot } from "./support/helpers";

test("paths.ts derives cppx layout from the active host and persists the tool manifest", async () => {
  const hostRoot = await createTempDir("paths");
  const hostAdapter = getHostAdapter();
  const appDataRoot =
    process.platform === "darwin"
      ? path.join(hostRoot, "Library", "Application Support")
      : hostRoot;

  try {
    await withHostDataRoot(hostRoot, async () => {
      const cmakeExecutable = path.join(
        getToolRoot("cmake"),
        "bin",
        hostAdapter.getExecutableName("cmake")
      );

      assert.equal(getCppxRoot(), path.join(appDataRoot, "cppx"));
      assert.equal(getDownloadsRoot(), path.join(appDataRoot, "cppx", "downloads"));
      assert.equal(getToolRoot("cmake"), path.join(appDataRoot, "cppx", "cmake"));
      assert.equal(getToolManifestPath(), path.join(appDataRoot, "cppx", "tools-manifest.json"));

      await ensureCppxLayout();
      assert.deepEqual(await readToolManifest(), { tools: {} });

      await upsertToolRecord({
        name: "cmake",
        executable: cmakeExecutable,
        root: getToolRoot("cmake"),
        version: "3.30.5",
        installedAt: "2026-03-23T00:00:00.000Z"
      });

      assert.deepEqual(await readToolManifest(), {
        tools: {
          cmake: {
            name: "cmake",
            executable: cmakeExecutable,
            root: getToolRoot("cmake"),
            version: "3.30.5",
            installedAt: "2026-03-23T00:00:00.000Z"
          }
        }
      });
    });
  } finally {
    await removeDir(hostRoot);
  }
});

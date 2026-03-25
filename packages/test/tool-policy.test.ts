import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { ToolStatus } from "../src/shared/contracts";
import type { HostPlatform } from "../src/main/cppx/platform";
import type { ToolSourceKind } from "../src/main/cppx/types";
import { isPinnedToolVersion, shouldReuseManagedArchiveTool } from "../src/main/cppx/installers";
import {
  getCppxRoot,
  getToolManifestPath,
  getToolRoot,
  readToolManifest,
  upsertToolRecord
} from "../src/main/cppx/paths";
import {
  createTempDir,
  removeDir,
  withHostDataRoot,
  writeJson
} from "./support/helpers";

function createRichToolRecord(overrides: Partial<{
  mode: "managed" | "system";
  sourceKind: ToolSourceKind;
  requestedVersion: string;
  resolvedVersion: string;
  platform: HostPlatform;
  arch: string;
  compilerFamily: "mingw" | "msvc";
  catalogId: string;
  verifiedSha256: string;
}> = {}) {
  return {
    name: "cmake" as const,
    executable: path.join(getToolRoot("cmake"), "bin", "cmake.exe"),
    root: getToolRoot("cmake"),
    version: "3.30.5",
    installedAt: "2026-03-23T00:00:00.000Z",
    mode: overrides.mode,
    sourceKind: overrides.sourceKind,
    requestedVersion: overrides.requestedVersion,
    resolvedVersion: overrides.resolvedVersion,
    platform: overrides.platform,
    arch: overrides.arch,
    compilerFamily: overrides.compilerFamily,
    catalogId: overrides.catalogId,
    ...(overrides.verifiedSha256 ? { verifiedSha256: overrides.verifiedSha256 } : {})
  };
}

test("tool manifest preserves policy metadata for managed installs", async () => {
  const localAppData = await createTempDir("tool-policy-manifest");

  try {
    await withHostDataRoot(localAppData, async () => {
      const record = createRichToolRecord({
        mode: "managed",
        sourceKind: "catalog-archive",
        requestedVersion: "default",
        resolvedVersion: "3.30.5",
        platform: "win32" as HostPlatform,
        arch: "x64",
        compilerFamily: "mingw",
        catalogId: "cmake-win32-x64"
      });

      await upsertToolRecord(record);

      const manifest = await readToolManifest();
      assert.deepEqual(manifest.tools.cmake, record);
    });
  } finally {
    await removeDir(localAppData);
  }
});

test("legacy tool manifests keep metadata during migration", async () => {
  const localAppData = await createTempDir("tool-policy-legacy");

  try {
    await withHostDataRoot(localAppData, async () => {
      const legacyManifestPath = path.join(getCppxRoot(), "tools", "tools-manifest.json");
      const record = createRichToolRecord({
        mode: "system",
        sourceKind: "system-detected",
        requestedVersion: "latest",
        resolvedVersion: "system",
        platform: "win32" as HostPlatform,
        arch: "x64",
        compilerFamily: "msvc",
        catalogId: "cmake-system"
      });

      await writeJson(legacyManifestPath, {
        tools: {
          cmake: record
        }
      });

      const manifest = await readToolManifest();
      assert.deepEqual(manifest.tools.cmake, record);
      assert.deepEqual(await readToolManifest(), manifest);
      assert.match(getToolManifestPath(), /tools-manifest\.json$/);
    });
  } finally {
    await removeDir(localAppData);
  }
});

test("tool status details can represent managed and system metadata", async () => {
  const status: ToolStatus = {
    cmake: true,
    ninja: false,
    vcpkg: true,
    cxx: true,
    details: {
      cmake: {
        ready: true,
        mode: "managed",
        sourceKind: "catalog-archive",
        requestedVersion: "default",
        resolvedVersion: "3.30.5",
        executable: "C:\\cppx-tools\\cmake\\bin\\cmake.exe"
        ,
        verifiedSha256: "5ab6e1faf20256ee4f04886597e8b6c3b1bd1297b58a68a58511af013710004b"
      },
      cxx: {
        ready: true,
        mode: "system",
        sourceKind: "system-detected",
        requestedVersion: "latest",
        resolvedVersion: "system",
        executable: "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64\\cl.exe"
      }
    }
  };

  assert.equal(status.details?.cmake?.mode, "managed");
  assert.equal(status.details?.cxx?.mode, "system");
  assert.equal(status.details?.cmake?.resolvedVersion, "3.30.5");
  assert.equal(status.details?.cxx?.sourceKind, "system-detected");
  assert.equal(
    status.details?.cmake?.verifiedSha256,
    "5ab6e1faf20256ee4f04886597e8b6c3b1bd1297b58a68a58511af013710004b"
  );
});

test("exact version archive installs do not reuse a mismatched existing manifest", () => {
  assert.equal(isPinnedToolVersion("3.30.5"), true);
  assert.equal(isPinnedToolVersion("default"), false);
  assert.equal(isPinnedToolVersion("latest"), false);

  assert.equal(
    shouldReuseManagedArchiveTool(
      {
        ...createRichToolRecord({
          mode: "managed",
          sourceKind: "catalog-archive",
          requestedVersion: "default",
          resolvedVersion: "3.29.0",
          catalogId: "cmake-3.29.0-windows-x64"
        }),
        version: "3.29.0"
      },
      {
        version: "3.30.5",
        urls: ["https://example.com/cmake.zip"],
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        executable: "cmake.exe",
        sourceKind: "catalog-archive",
        requestedVersion: "3.30.5",
        catalogId: "cmake-3.30.5-windows-x64"
      }
    ),
    false
  );

  assert.equal(
    shouldReuseManagedArchiveTool(
      {
        ...createRichToolRecord({
          mode: "managed",
          sourceKind: "catalog-archive",
          requestedVersion: "3.30.5",
          resolvedVersion: "3.30.5",
          catalogId: "cmake-3.30.5-windows-x64",
          verifiedSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }),
        version: "3.30.5"
      },
      {
        version: "3.30.5",
        urls: ["https://example.com/cmake.zip"],
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        executable: "cmake.exe",
        sourceKind: "catalog-archive",
        requestedVersion: "3.30.5",
        catalogId: "cmake-3.30.5-windows-x64"
      }
    ),
    true
  );

  assert.equal(
    shouldReuseManagedArchiveTool(
      {
        ...createRichToolRecord({
          mode: "managed",
          sourceKind: "catalog-archive",
          requestedVersion: "3.30.5",
          resolvedVersion: "3.30.5",
          catalogId: "cmake-3.30.5-windows-x64",
          verifiedSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }),
        version: "3.30.5"
      },
      {
        version: "3.30.5",
        urls: ["https://example.com/cmake.zip"],
        sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        executable: "cmake.exe",
        sourceKind: "catalog-archive",
        requestedVersion: "3.30.5",
        catalogId: "cmake-3.30.5-windows-x64"
      }
    ),
    false
  );
});

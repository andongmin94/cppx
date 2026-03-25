import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  getToolStatus,
  installAllTools,
  resolveToolchainOrThrow
} from "../src/main/cppx/installers";
import { CppxError } from "../src/main/cppx/errors";
import { getHostAdapter } from "../src/main/cppx/platform";
import { getToolRoot, upsertToolRecord } from "../src/main/cppx/paths";
import {
  createTempDir,
  createLogger,
  removeDir,
  withEnv,
  withHostDataRoot,
  writeExecutable,
  writeText
} from "./support/helpers";

function assertUsesToolDir(actualPath: string, expectedDir: string, expectedFile: string): void {
  assert.equal(path.basename(actualPath).toLowerCase(), expectedFile.toLowerCase());
  assert.equal(
    path.basename(path.dirname(actualPath)).toLowerCase(),
    path.basename(expectedDir).toLowerCase()
  );
}

test("getToolStatus and resolveToolchainOrThrow honor the current managed tool layout", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const localAppData = await createTempDir("tool-status");
  const hostAdapter = getHostAdapter();

  try {
    await withHostDataRoot(localAppData, async () => {
      const cmake = path.join(getToolRoot("cmake"), "bin", hostAdapter.getExecutableName("cmake"));
      const ninja = path.join(getToolRoot("ninja"), hostAdapter.getExecutableName("ninja"));
      const vcpkg = path.join(getToolRoot("vcpkg"), hostAdapter.getExecutableName("vcpkg"));
      const cxx = path.join(getToolRoot("cxx"), "bin", hostAdapter.getExecutableName("clang++"));

      await writeText(cmake, "");
      await writeText(ninja, "");
      await writeText(vcpkg, "");
      await writeText(cxx, "");

      await upsertToolRecord({
        name: "cmake",
        executable: cmake,
        root: getToolRoot("cmake"),
        version: "3.30.5",
        installedAt: "2026-03-23T00:00:00.000Z"
      });
      await upsertToolRecord({
        name: "ninja",
        executable: ninja,
        root: getToolRoot("ninja"),
        version: "1.12.1",
        installedAt: "2026-03-23T00:00:00.000Z"
      });
      await upsertToolRecord({
        name: "vcpkg",
        executable: vcpkg,
        root: getToolRoot("vcpkg"),
        version: "rolling",
        installedAt: "2026-03-23T00:00:00.000Z"
      });
      await upsertToolRecord({
        name: "cxx",
        executable: cxx,
        root: getToolRoot("cxx"),
        version: "llvm-mingw",
        installedAt: "2026-03-23T00:00:00.000Z"
      });

      const status = await getToolStatus();
      assert.equal(status.cmake, true);
      assert.equal(status.ninja, true);
      assert.equal(status.vcpkg, true);
      assert.equal(status.cxx, true);
      assert.equal(status.details?.cmake?.mode, "managed");
      assert.equal(status.details?.vcpkg?.sourceKind, "catalog-archive");
      assert.equal(status.details?.cmake?.executable, cmake);
      assert.equal(status.details?.cmake?.provider, "archive");
      assert.equal(status.details?.cmake?.ownership, "cppx");
      assert.equal(status.details?.cmake?.capabilities?.install, true);
      assert.equal(status.details?.cxx?.provider, "archive");
      assert.equal(status.details?.cxx?.ownership, "cppx");

      const { logger } = createLogger();
      const toolchain = await resolveToolchainOrThrow(logger);
      assert.equal(toolchain.cmake, cmake);
      assert.equal(toolchain.ninja, ninja);
      assert.equal(toolchain.vcpkg, vcpkg);
      assert.equal(toolchain.cxx, cxx);
      assert.equal(toolchain.compilerFamily, "mingw");
      assert.deepEqual(toolchain.envPath, [
        path.dirname(cmake),
        path.dirname(ninja),
        path.dirname(vcpkg),
        path.dirname(cxx)
      ]);
    });
  } finally {
    await removeDir(localAppData);
  }
});

test("installAllTools fails clearly when managed lifecycle is not supported on the current host", async () => {
  if (process.platform !== "linux") {
    return;
  }

  const hostRoot = await createTempDir("unsupported-managed");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(hostRoot, async () => {
      await assert.rejects(
        () =>
          installAllTools(
            logger,
            {
              cmake: { mode: "managed", version: "default" },
              ninja: { mode: "managed", version: "default" },
              vcpkg: { mode: "managed", version: "default" },
              cxx: { mode: "managed", version: "latest", preferredFamily: "mingw" }
            },
            "none"
          ),
        (error) => {
          assert.ok(error instanceof CppxError);
          assert.match(error.message, /도구 설치가 완료되지 않았습니다/);
          assert.match(error.details ?? "", /managed 수명주기/);
          return true;
        }
      );
    });
  } finally {
    await removeDir(hostRoot);
  }
});

test("resolveToolchainOrThrow honors explicit system tool policies via PATH", async () => {
  const toolPath = await createTempDir("system-tools");
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();
  const dependencyBackend = hostAdapter.getDefaultDependencyBackend();

  try {
    const cmake = path.join(toolPath, hostAdapter.getExecutableName("cmake"));
    const ninja = path.join(toolPath, hostAdapter.getExecutableName("ninja"));
    const vcpkg = path.join(toolPath, hostAdapter.getExecutableName("vcpkg"));
    const cxx = path.join(toolPath, hostAdapter.getExecutableName("clang++"));

    await writeExecutable(cmake);
    await writeExecutable(ninja);
    await writeExecutable(cxx);
    if (dependencyBackend === "vcpkg") {
      await writeExecutable(vcpkg);
    }

    await withEnv(
      "PATH",
      `${toolPath}${hostAdapter.getPathSeparator()}${process.env.PATH ?? ""}`,
      async () => {
        const toolchain = await resolveToolchainOrThrow(
          logger,
          {
            cmake: { mode: "system", version: "latest" },
            ninja: { mode: "system", version: "latest" },
            vcpkg: { mode: "system", version: "latest" },
            cxx: { mode: "system", version: "latest", preferredFamily: "mingw" }
          },
          dependencyBackend
        );

        assertUsesToolDir(toolchain.cmake, toolPath, hostAdapter.getExecutableName("cmake"));
        assertUsesToolDir(toolchain.ninja, toolPath, hostAdapter.getExecutableName("ninja"));
        if (dependencyBackend === "vcpkg") {
          const vcpkgExecutable = toolchain.vcpkg;
          assert.ok(vcpkgExecutable);
          assertUsesToolDir(vcpkgExecutable, toolPath, hostAdapter.getExecutableName("vcpkg"));
        } else {
          assert.equal(toolchain.vcpkg, undefined);
        }
        assertUsesToolDir(toolchain.cxx, toolPath, hostAdapter.getExecutableName("clang++"));
        assert.equal(toolchain.compilerFamily, "mingw");
        assert.equal(toolchain.envPath.length, 1);
        assert.equal(
          path.basename(toolchain.envPath[0]).toLowerCase(),
          path.basename(toolPath).toLowerCase()
        );
      }
    );
  } finally {
    await removeDir(toolPath);
  }
});

test("resolveToolchainOrThrow reports all missing managed tools", async () => {
  const hostRoot = await createTempDir("missing-tools");
  const { logger } = createLogger();

  try {
    await withHostDataRoot(hostRoot, async () => {
      await assert.rejects(
        () =>
          resolveToolchainOrThrow(
            logger,
            {
              cmake: { mode: "managed", version: "default" },
              ninja: { mode: "managed", version: "default" },
              vcpkg: { mode: "managed", version: "default" },
              cxx: { mode: "managed", version: "latest", preferredFamily: "mingw" }
            },
            "vcpkg"
          ),
        (error) => {
          assert.ok(error instanceof CppxError);
          assert.match(error.message, /cmake, ninja, vcpkg, cxx-compiler/);
          return true;
        }
      );
    });
  } finally {
    await removeDir(hostRoot);
  }
});

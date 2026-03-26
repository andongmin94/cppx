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

test("getToolStatus and resolveToolchainOrThrow surface archive-managed conan on Windows", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const localAppData = await createTempDir("tool-status-conan");
  const hostAdapter = getHostAdapter();
  const { logger } = createLogger();

  try {
    await withHostDataRoot(localAppData, async () => {
      const cmake = path.join(getToolRoot("cmake"), "bin", hostAdapter.getExecutableName("cmake"));
      const ninja = path.join(getToolRoot("ninja"), hostAdapter.getExecutableName("ninja"));
      const conan = path.join(getToolRoot("conan"), hostAdapter.getExecutableName("conan"));
      const cxx = path.join(getToolRoot("cxx"), "bin", hostAdapter.getExecutableName("clang++"));

      await writeExecutable(cmake);
      await writeExecutable(ninja);
      await writeExecutable(conan);
      await writeExecutable(cxx);

      await upsertToolRecord({
        name: "cmake",
        executable: cmake,
        root: getToolRoot("cmake"),
        version: "3.30.5",
        installedAt: "2026-03-26T00:00:00.000Z",
        mode: "managed",
        sourceKind: "catalog-archive",
        provider: "archive",
        ownership: "cppx"
      });
      await upsertToolRecord({
        name: "ninja",
        executable: ninja,
        root: getToolRoot("ninja"),
        version: "1.12.1",
        installedAt: "2026-03-26T00:00:00.000Z",
        mode: "managed",
        sourceKind: "catalog-archive",
        provider: "archive",
        ownership: "cppx"
      });
      await upsertToolRecord({
        name: "conan",
        executable: conan,
        root: getToolRoot("conan"),
        version: "2.27.0",
        installedAt: "2026-03-26T00:00:00.000Z",
        mode: "managed",
        sourceKind: "catalog-github-release",
        provider: "archive",
        ownership: "cppx",
        catalogId: "conan-latest-windows-x64",
        verifiedSha256: "9ec5eb2351c187cebcf674c46246e29d09fca4a6f87284a3d3d08b03e4d3fc44"
      });
      await upsertToolRecord({
        name: "cxx",
        executable: cxx,
        root: getToolRoot("cxx"),
        version: "llvm-mingw",
        installedAt: "2026-03-26T00:00:00.000Z",
        mode: "managed",
        sourceKind: "catalog-github-release",
        provider: "archive",
        ownership: "cppx",
        compilerFamily: "mingw"
      });

      const status = await getToolStatus();
      assert.equal(status.conan, true);
      assert.equal(status.details?.conan?.provider, "archive");
      assert.equal(status.details?.conan?.sourceKind, "catalog-github-release");
      assert.equal(status.details?.conan?.ownership, "cppx");
      assert.equal(status.details?.conan?.capabilities?.provider, "archive");
      assert.equal(status.details?.conan?.capabilities?.install, true);

      const toolchain = await resolveToolchainOrThrow(
        logger,
        {
          cmake: { mode: "managed", version: "default" },
          ninja: { mode: "managed", version: "default" },
          conan: { mode: "managed", version: "default" },
          cxx: { mode: "managed", version: "latest", preferredFamily: "mingw" }
        },
        "conan"
      );

      assert.equal(toolchain.cmake, cmake);
      assert.equal(toolchain.ninja, ninja);
      assert.equal(toolchain.vcpkg, undefined);
      assert.equal(toolchain.cxx, cxx);
      assert.deepEqual(toolchain.envPath, [
        path.dirname(cmake),
        path.dirname(ninja),
        path.dirname(conan),
        path.dirname(cxx)
      ]);
    });
  } finally {
    await removeDir(localAppData);
  }
});

test("installAllTools fails clearly when managed lifecycle is not supported on unsupported Linux hosts", async () => {
  if (process.platform !== "linux") {
    return;
  }

  const hostRoot = await createTempDir("unsupported-managed");
  const { logger } = createLogger();

  try {
    await withEnv(
      "CPPX_LINUX_OS_RELEASE",
      'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n',
      async () => {
        await withHostDataRoot(hostRoot, async () => {
          await assert.rejects(
            () =>
              installAllTools(
                logger,
                {
                  cmake: { mode: "managed", version: "default" },
                  ninja: { mode: "managed", version: "default" },
                  vcpkg: { mode: "managed", version: "default" },
                  cxx: { mode: "managed", version: "latest", preferredFamily: "clang" }
                },
                "none"
              ),
            (error) => {
              assert.ok(error instanceof CppxError);
              assert.match(error.message, /도구 설치가 완료되지 않았습니다/);
              assert.match(error.details ?? "", /Ubuntu 24\.04/);
              return true;
            }
          );
        });
      }
    );
  } finally {
    await removeDir(hostRoot);
  }
});

test("getToolStatus and resolveToolchainOrThrow surface pipx-managed conan on supported Linux hosts", async () => {
  if (process.platform !== "linux") {
    return;
  }

  const hostRoot = await createTempDir("linux-managed-conan");
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();

  try {
    await withEnv(
      "CPPX_LINUX_OS_RELEASE",
      'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
      async () => {
        await withHostDataRoot(hostRoot, async () => {
          const cmake = path.join(getToolRoot("cmake"), "bin", hostAdapter.getExecutableName("cmake"));
          const ninja = path.join(getToolRoot("ninja"), hostAdapter.getExecutableName("ninja"));
          const conan = path.join(getToolRoot("conan"), "bin", hostAdapter.getExecutableName("conan"));
          const cxx = path.join(getToolRoot("cxx"), "bin", hostAdapter.getExecutableName("clang++"));

          await writeExecutable(cmake);
          await writeExecutable(ninja);
          await writeExecutable(conan);
          await writeExecutable(cxx);

          await upsertToolRecord({
            name: "cmake",
            executable: cmake,
            root: getToolRoot("cmake"),
            version: "3.28.3",
            installedAt: "2026-03-25T00:00:00.000Z",
            mode: "managed",
            sourceKind: "apt-managed",
            provider: "apt",
            ownership: "cppx"
          });
          await upsertToolRecord({
            name: "ninja",
            executable: ninja,
            root: getToolRoot("ninja"),
            version: "1.11.1",
            installedAt: "2026-03-25T00:00:00.000Z",
            mode: "managed",
            sourceKind: "apt-managed",
            provider: "apt",
            ownership: "cppx"
          });
          await upsertToolRecord({
            name: "conan",
            executable: conan,
            root: getToolRoot("conan"),
            version: "2.21.0",
            installedAt: "2026-03-25T00:00:00.000Z",
            mode: "managed",
            sourceKind: "pipx-managed",
            provider: "pipx",
            ownership: "cppx"
          });
          await upsertToolRecord({
            name: "cxx",
            executable: cxx,
            root: getToolRoot("cxx"),
            version: "18.1.3",
            installedAt: "2026-03-25T00:00:00.000Z",
            mode: "managed",
            sourceKind: "apt-managed",
            provider: "apt",
            ownership: "cppx"
          });

          const status = await getToolStatus();
          assert.equal(status.conan, true);
          assert.equal(status.details?.conan?.provider, "pipx");
          assert.equal(status.details?.conan?.sourceKind, "pipx-managed");
          assert.equal(status.details?.conan?.ownership, "cppx");
          assert.equal(status.details?.conan?.capabilities?.provider, "pipx");
          assert.equal(status.details?.conan?.capabilities?.install, true);

          const toolchain = await resolveToolchainOrThrow(
            logger,
            {
              cmake: { mode: "managed", version: "default" },
              ninja: { mode: "managed", version: "default" },
              conan: { mode: "managed", version: "default" },
              cxx: { mode: "managed", version: "latest", preferredFamily: "clang" }
            },
            "conan"
          );

          assert.equal(toolchain.cmake, cmake);
          assert.equal(toolchain.ninja, ninja);
          assert.equal(toolchain.cxx, cxx);
          assert.deepEqual(toolchain.envPath, [
            path.dirname(cmake),
            path.dirname(ninja),
            path.dirname(conan),
            path.dirname(cxx)
          ]);
        });
      }
    );
  } finally {
    await removeDir(hostRoot);
  }
});

test("resolveToolchainOrThrow honors explicit system tool policies via PATH", async () => {
  const hostRoot = await createTempDir("system-policy-root");
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

    await withHostDataRoot(hostRoot, async () => {
      if (process.platform === "win32") {
        const staleCompiler = path.join(getToolRoot("cxx"), "bin", hostAdapter.getExecutableName("cl"));
        await writeExecutable(staleCompiler);
        await upsertToolRecord({
          name: "cxx",
          executable: staleCompiler,
          root: getToolRoot("cxx"),
          version: "system",
          installedAt: "2026-03-25T00:00:00.000Z",
          mode: "system",
          sourceKind: "msvc-detected",
          compilerFamily: "msvc",
          provider: "msvc",
          ownership: "external"
        });
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
              cxx: { mode: "system", version: "latest", preferredFamily: hostAdapter.compilerFamily }
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
          assert.equal(toolchain.compilerFamily, hostAdapter.platform === "win32" ? "mingw" : "clang");
          assert.equal(toolchain.envPath.length, 1);
          assert.equal(
            path.basename(toolchain.envPath[0]).toLowerCase(),
            path.basename(toolPath).toLowerCase()
          );
        }
      );
    });
  } finally {
    await removeDir(hostRoot);
    await removeDir(toolPath);
  }
});

test("resolveToolchainOrThrow reports all missing managed tools", async () => {
  const hostRoot = await createTempDir("missing-tools");
  const { logger } = createLogger();
  const hostAdapter = getHostAdapter();

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
              cxx: { mode: "managed", version: "latest", preferredFamily: hostAdapter.compilerFamily }
            },
            "vcpkg"
          ),
        (error) => {
          assert.ok(error instanceof CppxError);
          assert.match(error.message, /vcpkg/);
          assert.match(error.message, /cxx-compiler/);
          if (process.platform === "win32") {
            assert.match(error.message, /cmake/);
            assert.match(error.message, /ninja/);
          }
          return true;
        }
      );
    });
  } finally {
    await removeDir(hostRoot);
  }
});

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHostAdapter } from "../src/main/cppx/platform";
import { createTempDir, removeDir, withEnv } from "./support/helpers";

test("windows host adapter centralizes executable naming, roots, and shell commands", async () => {
  const localAppData = await createTempDir("platform-root");

  try {
    await withEnv("LOCALAPPDATA", localAppData, async () => {
      const adapter = createHostAdapter("win32");

      assert.equal(adapter.platform, "win32");
      assert.equal(adapter.getExecutableName("cmake"), "cmake.exe");
      assert.equal(adapter.getBinaryName("demo"), "demo.exe");
      assert.equal(adapter.getCtestExecutableName(), "ctest.exe");
      assert.equal(adapter.getCpackExecutableName(), "cpack.exe");
      assert.equal(adapter.getPathSeparator(), ";");
      assert.equal(adapter.getCppxRoot(), path.join(localAppData, "cppx"));
      assert.equal(adapter.getDownloadsRoot(), path.join(localAppData, "cppx", "downloads"));
      assert.equal(
        adapter.getVsWherePath(),
        path.join(
          process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
          "Microsoft Visual Studio",
          "Installer",
          "vswhere.exe"
        )
      );
      assert.equal(adapter.normalizePath("C:/Temp/Demo"), "c:\\temp\\demo");
      assert.equal(adapter.comparePaths("C:/Temp/Demo", "C:\\temp\\demo"), 0);
      assert.equal(adapter.getDefaultDependencyBackend(), "vcpkg");
      assert.equal(adapter.getDefaultTargetTriplet("mingw"), "x64-mingw-dynamic");

      const shell = adapter.getShellCommand("cmd");
      assert.equal(shell.command, "cmd.exe");
      assert.deepEqual(shell.args, ["/d", "/c"]);

      const lookup = adapter.getExecutableLookupCommand("cmake.exe");
      assert.equal(lookup.command, "where");
      assert.deepEqual(lookup.args, ["cmake.exe"]);

      const extract = adapter.getArchiveExtractCommand("archive.zip", "dest");
      assert.equal(extract.command, "powershell");
      assert.match(extract.args.join(" "), /Expand-Archive/);
    });
  } finally {
    await removeDir(localAppData);
  }
});

test("linux host adapter provides native defaults and commands", async () => {
  const dataRoot = await createTempDir("platform-linux");

  try {
    await withEnv("XDG_DATA_HOME", dataRoot, async () => {
      const adapter = createHostAdapter("linux");

      assert.equal(adapter.getExecutableName("cmake"), "cmake");
      assert.equal(adapter.getPathSeparator(), ":");
      assert.equal(adapter.getCppxRoot(), path.join(dataRoot, "cppx"));
      assert.equal(adapter.getDefaultDependencyBackend(), "none");
      assert.equal(
        adapter.getDefaultTargetTriplet("mingw"),
        `${process.arch === "arm64" ? "arm64" : "x64"}-linux`
      );

      const shell = adapter.getShellCommand("sh");
      assert.equal(shell.command, "sh");
      assert.deepEqual(shell.args, ["-lc"]);

      const lookup = adapter.getExecutableLookupCommand("cmake");
      assert.equal(lookup.command, "which");
      assert.deepEqual(lookup.args, ["cmake"]);

      const bootstrap = adapter.getVcpkgBootstrapCommand("tools");
      assert.equal(bootstrap.command, "sh");
      assert.match(bootstrap.args.join(" "), /bootstrap-vcpkg\.sh/);
    });
  } finally {
    await removeDir(dataRoot);
  }
});

test("linux host adapter enables Ubuntu 24.04 managed defaults when os-release matches the official host", async () => {
  await withEnv("CPPX_LINUX_OS_RELEASE", 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n', async () => {
    const adapter = createHostAdapter("linux");

    assert.equal(adapter.getDefaultToolMode("cmake"), "managed");
    assert.equal(adapter.getDefaultToolMode("ninja"), "managed");
    assert.equal(adapter.getDefaultToolMode("vcpkg"), "managed");
    assert.equal(adapter.getDefaultToolMode("cxx"), "managed");
    assert.equal(adapter.getDefaultToolMode("conan"), "managed");
  });
});

test("darwin host adapter uses Application Support and native triplets", async () => {
  const adapter = createHostAdapter("darwin");
  const expectedRoot = path.join(os.homedir(), "Library", "Application Support");

  assert.equal(adapter.getExecutableName("cmake"), "cmake");
  assert.equal(adapter.getCppxRoot(), path.join(expectedRoot, "cppx"));
  assert.equal(adapter.getDefaultDependencyBackend(), "none");
  assert.equal(
    adapter.getDefaultTargetTriplet("mingw"),
    `${process.arch === "arm64" ? "arm64" : "x64"}-osx`
  );
  assert.equal(adapter.getAppDataRoot(), expectedRoot);
  assert.ok(adapter.normalizePath("/tmp/demo").endsWith("/tmp/demo"));
  assert.equal(adapter.comparePaths("/tmp/demo", "/tmp/demo"), 0);
});

test("darwin host adapter honors HOME overrides for app data resolution", async () => {
  const homeRoot = await createTempDir("platform-darwin-home");

  try {
    await withEnv("HOME", homeRoot, async () => {
      const adapter = createHostAdapter("darwin");
      const expectedRoot = path.join(homeRoot, "Library", "Application Support");

      assert.equal(adapter.getAppDataRoot(), expectedRoot);
      assert.equal(adapter.getCppxRoot(), path.join(expectedRoot, "cppx"));
      assert.equal(adapter.getDownloadsRoot(), path.join(expectedRoot, "cppx", "downloads"));
    });
  } finally {
    await removeDir(homeRoot);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  isPathManagedByApt,
  isPathManagedByHomebrew,
  isPathManagedByPipx,
  parseLinuxOsRelease,
  resolveHostSupport,
  resolveToolLifecycleCapabilities
} from "../src/main/cppx/host-support";

test("host support marks Windows as official and lifecycle-ready", async () => {
  const support = await resolveHostSupport({ platform: "win32", arch: "x64" });
  const cmake = await resolveToolLifecycleCapabilities("cmake", { platform: "win32" });
  const conan = await resolveToolLifecycleCapabilities("conan", { platform: "win32" });

  assert.equal(support.platform, "win32");
  assert.equal(support.tier, "official");
  assert.equal(support.managedLifecycleReady, true);
  assert.equal(support.recommendedProvider, "archive");
  assert.equal(cmake.install, true);
  assert.equal(cmake.remove, true);
  assert.equal(cmake.provider, "archive");
  assert.equal(conan.provider, "archive");
  assert.equal(conan.install, true);
  assert.equal(conan.remove, true);
});

test("host support marks supported macOS + Homebrew as official managed path", async () => {
  const support = await resolveHostSupport({
    platform: "darwin",
    arch: "arm64",
    macosVersion: "14.6",
    homebrewAvailable: true,
    homebrewPrefix: "/opt/homebrew"
  });
  const cmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "darwin",
    arch: "arm64",
    macosVersion: "14.6",
    homebrewAvailable: true,
    homebrewPrefix: "/opt/homebrew"
  });
  const vcpkg = await resolveToolLifecycleCapabilities("vcpkg", {
    platform: "darwin",
    arch: "arm64",
    macosVersion: "14.6",
    homebrewAvailable: true,
    homebrewPrefix: "/opt/homebrew"
  });

  assert.equal(support.platform, "darwin");
  assert.equal(support.tier, "official");
  assert.equal(support.managedLifecycleReady, true);
  assert.equal(support.recommendedProvider, "homebrew");
  assert.equal(cmake.install, true);
  assert.equal(cmake.provider, "homebrew");
  assert.equal(vcpkg.install, true);
  assert.equal(vcpkg.provider, "archive");
});

test("host support keeps macOS managed path disabled until Homebrew is available", async () => {
  const support = await resolveHostSupport({
    platform: "darwin",
    arch: "x64",
    macosVersion: "14.4",
    homebrewAvailable: false
  });
  const conan = await resolveToolLifecycleCapabilities("conan", {
    platform: "darwin",
    arch: "x64",
    macosVersion: "14.4",
    homebrewAvailable: false
  });

  assert.equal(support.tier, "official");
  assert.equal(support.managedLifecycleReady, false);
  assert.equal(support.recommendedProvider, "homebrew");
  assert.equal(conan.provider, "homebrew");
  assert.equal(conan.install, false);
});

test("linux support narrows managed planning to Ubuntu 24.04", async () => {
  const ubuntu = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });
  const fedora = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
  });
  const ubuntuCmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });
  const ubuntuVcpkg = await resolveToolLifecycleCapabilities("vcpkg", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });
  const ubuntuConan = await resolveToolLifecycleCapabilities("conan", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });

  assert.equal(ubuntu.tier, "official");
  assert.equal(ubuntu.recommendedProvider, "apt");
  assert.equal(ubuntu.managedLifecycleReady, true);
  assert.equal(fedora.recommendedProvider, "system");
  assert.equal(ubuntuCmake.provider, "apt");
  assert.equal(ubuntuCmake.install, true);
  assert.equal(ubuntuVcpkg.provider, "archive");
  assert.equal(ubuntuVcpkg.install, true);
  assert.equal(ubuntuConan.provider, "pipx");
  assert.equal(ubuntuConan.install, true);
});

test("linux os-release parser reads quoted fields", () => {
  const parsed = parseLinuxOsRelease('ID="ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n');
  assert.deepEqual(parsed, {
    id: "ubuntu",
    versionId: "24.04",
    prettyName: "Ubuntu 24.04 LTS"
  });
});

test("homebrew path detection recognizes common prefixes", () => {
  assert.equal(
    isPathManagedByHomebrew("/opt/homebrew/bin/cmake", { prefix: "/opt/homebrew" }),
    true
  );
  assert.equal(
    isPathManagedByHomebrew("/usr/local/Cellar/ninja/1.12.1/bin/ninja"),
    true
  );
  assert.equal(
    isPathManagedByHomebrew("/usr/bin/cmake", { prefix: "/opt/homebrew" }),
    false
  );
});

test("apt path detection recognizes common Ubuntu system prefixes", () => {
  assert.equal(isPathManagedByApt("/usr/bin/cmake"), true);
  assert.equal(isPathManagedByApt("/usr/lib/llvm-18/bin/clang++"), true);
  assert.equal(isPathManagedByApt("/usr/local/bin/cmake"), false);
});

test("pipx path detection recognizes common user and managed prefixes", () => {
  assert.equal(isPathManagedByPipx("/home/demo/.local/bin/conan"), true);
  assert.equal(isPathManagedByPipx("/tmp/cppx/conan/bin/conan", { binDir: "/tmp/cppx/conan/bin" }), true);
  assert.equal(isPathManagedByPipx("/usr/bin/conan"), false);
});

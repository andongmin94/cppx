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
  assert.match(support.notes.join(" "), /Pinned exact versions for cmake, ninja, and conan use verified archives/);
  assert.equal(cmake.install, true);
  assert.equal(cmake.provider, "homebrew");
  assert.match(cmake.note ?? "", /verified archives for exact pinned versions/);
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

test("linux host support recognizes Ubuntu 22.04 as an official managed LTS profile", async () => {
  const support = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n',
    aptAvailable: true
  });
  const cmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n',
    aptAvailable: true
  });
  const vcpkg = await resolveToolLifecycleCapabilities("vcpkg", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n',
    aptAvailable: true
  });
  const conan = await resolveToolLifecycleCapabilities("conan", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n',
    aptAvailable: true
  });

  assert.equal(support.tier, "official");
  assert.equal(support.recommendedProvider, "apt");
  assert.equal(support.managedLifecycleReady, true);
  assert.match(support.notes.join(" "), /Ubuntu LTS profiles \(22\.04, 24\.04, 26\.04\)/);

  assert.equal(cmake.provider, "apt");
  assert.equal(cmake.install, true);
  assert.equal(cmake.supportsExactPin, true);
  assert.equal(cmake.supportsFloatingVersion, true);
  assert.equal(cmake.versionSource, "host-provider-or-cppx-verified");
  assert.equal(cmake.systemDetectionKind, "path-with-provider");

  assert.equal(vcpkg.provider, "archive");
  assert.equal(vcpkg.install, true);
  assert.equal(vcpkg.supportsExactPin, true);
  assert.equal(vcpkg.versionSource, "cppx-verified");

  assert.equal(conan.provider, "pipx");
  assert.equal(conan.install, true);
  assert.equal(conan.supportsExactPin, true);
  assert.equal(conan.versionSource, "upstream");
  assert.match(conan.note ?? "", /supports exact pinned versions/);
});

test("linux host support keeps Ubuntu 24.04 as an official managed LTS profile", async () => {
  const support = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });
  const cxx = await resolveToolLifecycleCapabilities("cxx", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
    aptAvailable: true
  });

  assert.equal(support.tier, "official");
  assert.equal(support.recommendedProvider, "apt");
  assert.equal(support.managedLifecycleReady, true);
  assert.match(support.notes.join(" "), /Pinned exact versions for cmake and ninja use verified archives/);
  assert.equal(cxx.provider, "apt");
  assert.equal(cxx.install, true);
  assert.equal(cxx.supportsExactPin, false);
  assert.equal(cxx.supportsFloatingVersion, true);
  assert.equal(cxx.versionSource, "host-provider");
  assert.equal(cxx.systemDetectionKind, "path-with-provider");
  assert.match(cxx.note ?? "", /clang or gcc via apt, depending on compiler preference/);
});

test("linux host support recognizes Ubuntu 26.04 as an official managed LTS profile", async () => {
  const support = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="26.04"\nPRETTY_NAME="Ubuntu 26.04 LTS"\n',
    aptAvailable: true
  });
  const cmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="26.04"\nPRETTY_NAME="Ubuntu 26.04 LTS"\n',
    aptAvailable: true
  });
  const conan = await resolveToolLifecycleCapabilities("conan", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="26.04"\nPRETTY_NAME="Ubuntu 26.04 LTS"\n',
    aptAvailable: true
  });

  assert.equal(support.tier, "official");
  assert.equal(support.recommendedProvider, "apt");
  assert.equal(support.managedLifecycleReady, true);
  assert.match(support.notes.join(" "), /Ubuntu LTS profiles \(22\.04, 24\.04, 26\.04\)/);
  assert.equal(cmake.provider, "apt");
  assert.equal(cmake.install, true);
  assert.equal(conan.provider, "pipx");
  assert.equal(conan.install, true);
});

test("unsupported Linux is outside the cppx support policy", async () => {
  const support = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
  });
  const cmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "linux",
    linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
  });
  const conan = await resolveToolLifecycleCapabilities("conan", {
    platform: "linux",
    linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
  });

  assert.equal(support.tier, "unsupported");
  assert.equal(support.recommendedProvider, "unknown");
  assert.equal(support.managedLifecycleReady, false);
  assert.match(support.notes.join(" "), /Managed Linux support is limited to Ubuntu LTS profiles \(22\.04, 24\.04, 26\.04\)/);
  assert.match(support.notes.join(" "), /outside the cppx host support policy/);
  assert.equal(cmake.provider, "unknown");
  assert.equal(cmake.detect, false);
  assert.equal(cmake.install, false);
  assert.equal(cmake.supportsExactPin, false);
  assert.equal(cmake.versionSource, "unknown");
  assert.equal(conan.provider, "unknown");
  assert.equal(conan.detect, false);
  assert.equal(conan.install, false);
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

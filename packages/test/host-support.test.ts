import assert from "node:assert/strict";
import test from "node:test";
import {
  isPathManagedByHomebrew,
  parseLinuxOsRelease,
  resolveHostSupport,
  resolveToolLifecycleCapabilities
} from "../src/main/cppx/host-support";

test("host support marks Windows as official and lifecycle-ready", async () => {
  const support = await resolveHostSupport({ platform: "win32", arch: "x64" });
  const cmake = await resolveToolLifecycleCapabilities("cmake", { platform: "win32" });

  assert.equal(support.platform, "win32");
  assert.equal(support.tier, "official");
  assert.equal(support.managedLifecycleReady, true);
  assert.equal(support.recommendedProvider, "archive");
  assert.equal(cmake.install, true);
  assert.equal(cmake.remove, true);
  assert.equal(cmake.provider, "archive");
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
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n'
  });
  const fedora = await resolveHostSupport({
    platform: "linux",
    linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
  });
  const ubuntuCmake = await resolveToolLifecycleCapabilities("cmake", {
    platform: "linux",
    linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n'
  });

  assert.equal(ubuntu.recommendedProvider, "system");
  assert.equal(ubuntu.managedLifecycleReady, false);
  assert.equal(fedora.recommendedProvider, "system");
  assert.equal(ubuntuCmake.provider, "system");
  assert.equal(ubuntuCmake.install, false);
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

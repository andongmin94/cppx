import assert from "node:assert/strict";
import test from "node:test";
import { getHostAdapter } from "../src/main/cppx/platform";
import {
  createDefaultToolPolicies,
  createRequestedToolPolicies,
  normalizeToolchainStrategy,
  resolveRequestedPolicies
} from "../src/main/cppx/toolchain-strategy";

test("recommended strategy follows the active host adapter defaults", () => {
  const hostAdapter = getHostAdapter();
  const policies = createDefaultToolPolicies(hostAdapter.compilerFamily, "recommended");

  assert.equal(
    policies.cmake.mode,
    hostAdapter.getDefaultToolMode("cmake", hostAdapter.compilerFamily)
  );
  assert.equal(
    policies.ninja.mode,
    hostAdapter.getDefaultToolMode("ninja", hostAdapter.compilerFamily)
  );
  assert.equal(
    policies.vcpkg.mode,
    hostAdapter.getDefaultToolMode("vcpkg", hostAdapter.compilerFamily)
  );
  assert.equal(
    policies.conan.mode,
    hostAdapter.getDefaultToolMode("conan", hostAdapter.compilerFamily)
  );
  assert.equal(
    policies.cxx.mode,
    hostAdapter.getDefaultToolMode("cxx", hostAdapter.compilerFamily)
  );
});

test("system strategy makes every tool external while keeping MSVC system-only", () => {
  const policies = createDefaultToolPolicies("msvc", "system");

  assert.equal(policies.cmake.mode, "system");
  assert.equal(policies.ninja.mode, "system");
  assert.equal(policies.vcpkg.mode, "system");
  assert.equal(policies.conan.mode, "system");
  assert.equal(policies.cxx.mode, "system");
  assert.equal(policies.cxx.preferredFamily, "msvc");
});

test("payload strategy expands to concrete policies and explicit tool choices win", () => {
  const policies = createRequestedToolPolicies({
    strategy: "system",
    compilerPreference: "msvc",
    toolPolicies: {
      cmake: { mode: "managed", version: "3.30.5" }
    },
    msvcInstallationPath: " C:\\VS\\BuildTools "
  });

  assert.equal(policies?.cmake?.mode, "managed");
  assert.equal(policies?.cmake?.version, "3.30.5");
  assert.equal(policies?.ninja?.mode, "system");
  assert.equal(policies?.vcpkg?.mode, "system");
  assert.equal(policies?.conan?.mode, "system");
  assert.equal(policies?.cxx?.mode, "system");
  assert.equal(policies?.cxx?.preferredFamily, "msvc");
  assert.equal(policies?.cxx?.msvcInstallationPath, "C:\\VS\\BuildTools");
});

test("requested policy resolver normalizes invalid values through strategy defaults", () => {
  const resolved = resolveRequestedPolicies({
    cxx: {
      preferredFamily: "msvc",
      mode: "managed",
      version: ""
    }
  });

  assert.equal(resolved.cxx.preferredFamily, "msvc");
  assert.equal(resolved.cxx.mode, "system");
  assert.equal(resolved.cxx.version, "default");
});

test("host-incompatible strategy aliases normalize to the closest supported family", () => {
  const hostAdapter = getHostAdapter();

  if (hostAdapter.platform === "win32") {
    assert.equal(normalizeToolchainStrategy("provider"), "portable");
  } else {
    assert.equal(normalizeToolchainStrategy("portable"), "provider");
  }
});

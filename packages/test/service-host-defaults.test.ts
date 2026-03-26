import test from "node:test";
import assert from "node:assert/strict";
import { CppxService } from "../src/main/cppx/service";
import { getHostAdapter } from "../src/main/cppx/platform";
import { getDefaultPresetName } from "../src/main/cppx/config";

test("service host defaults follow the active host adapter policy", async () => {
  const service = new CppxService(() => {});
  const hostAdapter = getHostAdapter();
  const defaults = await service.getHostDefaults();

  assert.equal(defaults.platform, hostAdapter.platform);
  assert.equal(defaults.defaultPreset, getDefaultPresetName());
  assert.equal(defaults.dependencyBackend, hostAdapter.getDefaultDependencyBackend());
  assert.equal(defaults.hostSupport.platform, hostAdapter.platform);
  assert.equal(defaults.toolCapabilities.cmake.detect, true);
  assert.ok(defaults.toolCapabilities.cxx.provider);
  assert.equal(
    defaults.toolPolicies.cmake.mode,
    hostAdapter.getDefaultToolMode("cmake", hostAdapter.compilerFamily)
  );
  assert.equal(
    defaults.toolPolicies.ninja.mode,
    hostAdapter.getDefaultToolMode("ninja", hostAdapter.compilerFamily)
  );
  assert.equal(
    defaults.toolPolicies.vcpkg.mode,
    hostAdapter.getDefaultToolMode("vcpkg", hostAdapter.compilerFamily)
  );
  assert.equal(
    defaults.toolPolicies.conan.mode,
    hostAdapter.getDefaultToolMode("conan", hostAdapter.compilerFamily)
  );
  assert.equal(
    defaults.toolPolicies.cxx.mode,
    hostAdapter.getDefaultToolMode("cxx", hostAdapter.compilerFamily)
  );
  assert.equal(defaults.toolPolicies.cxx.preferredFamily, hostAdapter.compilerFamily);
  if (hostAdapter.platform === "win32") {
    assert.equal(defaults.hostSupport.managedLifecycleReady, true);
    assert.equal(defaults.toolCapabilities.cmake.install, true);
    assert.equal(defaults.toolCapabilities.conan.provider, "archive");
    assert.equal(defaults.toolCapabilities.conan.install, true);
  } else if (
    hostAdapter.platform === "linux" &&
    defaults.hostSupport.recommendedProvider === "apt"
  ) {
    assert.equal(defaults.hostSupport.tier, "official");
    assert.equal(defaults.toolCapabilities.cmake.provider, "apt");
    assert.equal(defaults.toolCapabilities.cmake.install, true);
    assert.equal(defaults.toolCapabilities.vcpkg.provider, "archive");
    assert.equal(defaults.toolPolicies.cmake.mode, "managed");
    assert.equal(defaults.toolPolicies.ninja.mode, "managed");
    assert.equal(defaults.toolPolicies.vcpkg.mode, "managed");
    assert.equal(defaults.toolPolicies.cxx.mode, "managed");
    assert.equal(defaults.toolPolicies.conan.mode, "managed");
    assert.equal(defaults.toolCapabilities.conan.provider, "pipx");
    assert.equal(defaults.toolCapabilities.conan.install, true);
  } else {
    assert.equal(defaults.toolCapabilities.conan.detect, true);
  }
});

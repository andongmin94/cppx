import assert from "node:assert/strict";
import test from "node:test";
import {
  getDependencyBackendValue,
  getCxxModeGuidance,
  getTargetTripletPlaceholder,
  getToolModeOptions,
  getToolchainInstallGuidance,
  getCxxVersionPlaceholder,
  getToolVersionGuidance,
  getWindowsConanCompilerGuidance,
  supportsExactManagedCxxVersion,
  supportsMsvcInstallationPath
} from "../src/renderer/src/components/cppx/tooling";

test("renderer tooling only exposes MSVC installation path on Windows MSVC", () => {
  assert.equal(supportsMsvcInstallationPath("win32", "msvc"), true);
  assert.equal(supportsMsvcInstallationPath("win32", "mingw"), false);
  assert.equal(supportsMsvcInstallationPath("darwin", "clang"), false);
  assert.equal(supportsMsvcInstallationPath("linux", "clang"), false);
});

test("renderer tooling advertises exact cxx versions only for Windows managed MinGW", () => {
  assert.equal(supportsExactManagedCxxVersion("win32", "mingw"), true);
  assert.equal(supportsExactManagedCxxVersion("win32", "msvc"), false);
  assert.equal(supportsExactManagedCxxVersion("darwin", "clang"), false);
  assert.equal(supportsExactManagedCxxVersion("linux", "clang"), false);

  assert.equal(getCxxVersionPlaceholder("win32", "mingw"), "default / latest / exact");
  assert.equal(getCxxVersionPlaceholder("win32", "msvc"), "latest / default");
  assert.equal(getCxxVersionPlaceholder("darwin", "clang"), "latest / default");
  assert.equal(getCxxVersionPlaceholder("linux", "clang"), "latest / default");
});

test("renderer tooling exposes host-specific cxx mode guidance", () => {
  assert.equal(
    getCxxModeGuidance({
      platform: "win32",
      tier: "official",
      managedLifecycleReady: true
    }),
    null
  );
  assert.equal(
    getCxxModeGuidance({
      platform: "darwin",
      tier: "official",
      managedLifecycleReady: true
    }),
    "macOS에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있습니다."
  );
  assert.equal(
    getCxxModeGuidance({
      platform: "linux",
      tier: "official",
      managedLifecycleReady: true
    }),
    "Ubuntu LTS 공식 host에서는 C++를 managed(apt Clang / GCC) 또는 system(PATH의 clang++ / g++)으로 선택할 수 있습니다. Other Linux는 conservative system detection 중심입니다."
  );
  assert.equal(
    getCxxModeGuidance({
      platform: "linux",
      tier: "best-effort",
      managedLifecycleReady: false
    }),
    "Other Linux는 best-effort host라 C++는 system(PATH의 clang++ / g++) 중심으로 동작합니다."
  );
  assert.equal(
    getCxxModeGuidance({
      platform: "darwin",
      tier: "official",
      managedLifecycleReady: false
    }),
    "macOS 14+ 공식 host에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있지만, managed install을 실행하려면 Homebrew가 먼저 필요합니다."
  );
});

test("renderer tooling exposes version guidance from lifecycle metadata", () => {
  assert.equal(
    getToolVersionGuidance({
      ready: false,
      capabilities: {
        provider: "apt",
        detect: true,
        install: true,
        repair: true,
        remove: true,
        supportsExactPin: true,
        supportsFloatingVersion: true,
        supportsInstanceSelection: false,
        versionSource: "host-provider-or-cppx-verified",
        systemDetectionKind: "path-with-provider"
      }
    }),
    "버전 선택: exact+floating · 버전 소스: provider/verified"
  );

  assert.equal(
    getToolVersionGuidance({
      ready: false,
      capabilities: {
        provider: "system",
        detect: true,
        install: false,
        repair: false,
        remove: false,
        supportsExactPin: false,
        supportsFloatingVersion: false,
        supportsInstanceSelection: false,
        versionSource: "system",
        systemDetectionKind: "path-with-provider"
      }
    }),
    "이 host에서는 managed 버전 선택보다 system 감지가 우선입니다."
  );
});

test("renderer tooling narrows mode options on best-effort hosts and keeps legacy values visible", () => {
  assert.deepEqual(
    getToolModeOptions({ tier: "official" }, "managed"),
    [
      { value: "managed", label: "managed" },
      { value: "system", label: "system" }
    ]
  );
  assert.deepEqual(
    getToolModeOptions({ tier: "best-effort" }, "system"),
    [{ value: "system", label: "system" }]
  );
  assert.deepEqual(
    getToolModeOptions({ tier: "best-effort" }, "managed"),
    [
      { value: "system", label: "system" },
      { value: "managed", label: "managed (legacy)" }
    ]
  );
});

test("renderer tooling keeps backend fallback and target-triplet examples host-appropriate", () => {
  assert.equal(getDependencyBackendValue(undefined, "none"), "none");
  assert.equal(getDependencyBackendValue("conan", "none"), "conan");
  assert.equal(getTargetTripletPlaceholder("win32"), "x64-mingw-dynamic / x64-windows");
  assert.equal(getTargetTripletPlaceholder("darwin"), "arm64-osx / x64-osx");
  assert.equal(getTargetTripletPlaceholder("linux"), "arm64-linux / x64-linux");
});

test("renderer tooling explains install guidance for official and best-effort hosts", () => {
  assert.equal(
    getToolchainInstallGuidance({
      tier: "official",
      managedLifecycleReady: true
    }),
    "도구 누락 상태에서는 install-tools를 먼저 실행하는 것이 안전합니다."
  );
  assert.equal(
    getToolchainInstallGuidance({
      tier: "official",
      managedLifecycleReady: false
    }),
    "이 host는 공식 지원 범위이지만 managed lifecycle prerequisite가 아직 충족되지 않았습니다. 각 툴 행의 lifecycle 안내와 doctor 출력을 확인하세요."
  );
  assert.equal(
    getToolchainInstallGuidance({
      tier: "best-effort",
      managedLifecycleReady: false
    }),
    "이 host는 best-effort system 중심 경로입니다. managed install보다 system 도구 준비와 doctor 안내를 먼저 확인하세요."
  );
});

test("renderer tooling warns when Windows conan is paired with MinGW", () => {
  assert.equal(
    getWindowsConanCompilerGuidance("win32", "conan", "mingw"),
    "Windows에서 conan backend는 현재 system MSVC compiler path 기준으로 검증됩니다. MinGW는 none/vcpkg 경로에 더 적합합니다."
  );
  assert.equal(getWindowsConanCompilerGuidance("win32", "conan", "msvc"), null);
  assert.equal(getWindowsConanCompilerGuidance("win32", "vcpkg", "mingw"), null);
  assert.equal(getWindowsConanCompilerGuidance("darwin", "conan", "clang"), null);
});

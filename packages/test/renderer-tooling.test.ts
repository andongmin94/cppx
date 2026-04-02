import assert from "node:assert/strict";
import test from "node:test";
import {
  getCxxModeGuidance,
  getCxxVersionPlaceholder,
  getToolVersionGuidance,
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
  assert.equal(getCxxModeGuidance("win32"), null);
  assert.equal(
    getCxxModeGuidance("darwin"),
    "macOS에서는 C++를 managed(Homebrew LLVM) 또는 system(PATH의 Apple Clang/clang++)으로 선택할 수 있습니다."
  );
  assert.equal(
    getCxxModeGuidance("linux"),
    "Ubuntu LTS 공식 host에서는 C++를 managed(apt Clang / GCC) 또는 system(PATH의 clang++ / g++)으로 선택할 수 있습니다. Other Linux는 conservative system detection 중심입니다."
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

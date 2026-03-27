import assert from "node:assert/strict";
import test from "node:test";
import {
  getCxxVersionPlaceholder,
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

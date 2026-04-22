import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompilerPreference,
  getCompilerPreferenceLabel,
  getCompilerPreferenceOptions
} from "../src/shared/compiler-display";

test("compiler display helpers expose clang wording on POSIX hosts", () => {
  assert.equal(formatCompilerPreference("linux", "clang"), "clang");
  assert.equal(formatCompilerPreference("linux", "gcc"), "gcc");
  assert.equal(getCompilerPreferenceLabel("darwin", "clang"), "Clang");
  assert.equal(getCompilerPreferenceLabel("linux", "gcc"), "GCC");
  assert.deepEqual(getCompilerPreferenceOptions("linux"), [
    { value: "clang", label: "Clang" },
    { value: "gcc", label: "GCC" }
  ]);
});

test("compiler display helpers preserve MinGW/MSVC wording on Windows", () => {
  assert.equal(formatCompilerPreference("win32", "mingw"), "mingw");
  assert.equal(getCompilerPreferenceLabel("win32", "mingw"), "MinGW");
  assert.deepEqual(getCompilerPreferenceOptions("win32"), [
    { value: "mingw", label: "MinGW" },
    { value: "msvc", label: "MSVC" }
  ]);
});

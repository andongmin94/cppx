import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompilerPreference,
  getCompilerPreferenceLabel,
  getCompilerPreferenceOptions
} from "../src/shared/compiler-display";

test("compiler display helpers expose native wording on POSIX hosts", () => {
  assert.equal(formatCompilerPreference("linux", "mingw"), "native");
  assert.equal(getCompilerPreferenceLabel("darwin", "mingw"), "Native (clang/g++)");
  assert.deepEqual(getCompilerPreferenceOptions("linux"), [
    { value: "mingw", label: "Native (clang/g++)" }
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

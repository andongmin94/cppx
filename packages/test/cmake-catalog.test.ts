import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  resolveToolCatalogEntryForTarget
} from "../src/main/cppx/tool-catalog";

test("macOS arm64 cmake exact versions use the curated archive catalog", () => {
  const latest = resolveToolCatalogEntryForTarget("darwin", "arm64", "cmake", DEFAULT_TOOL_VERSION_TOKEN);
  const previous = resolveToolCatalogEntryForTarget("darwin", "arm64", "cmake", "4.2.3");

  assert.equal(latest.id, "cmake-4.3.0-darwin-arm64");
  assert.equal(latest.version, "4.3.0");
  assert.equal(previous.id, "cmake-4.2.3-darwin-arm64");
  assert.equal(previous.version, "4.2.3");
  assert.equal(previous.sourceKind, "catalog-archive");
  assert.match(previous.urls?.[0] ?? "", /cmake-4\.2\.3-macos-universal\.tar\.gz$/);
});

test("linux x64 cmake exact versions reject values outside the curated archive catalog", () => {
  assert.throws(
    () => resolveToolCatalogEntryForTarget("linux", "x64", "cmake", "9.9.9"),
    /catalog/
  );
});

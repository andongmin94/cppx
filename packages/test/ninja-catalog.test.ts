import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  resolveToolCatalogEntryForTarget
} from "../src/main/cppx/tool-catalog";

test("linux x64 ninja exact versions use the curated archive catalog", () => {
  const latest = resolveToolCatalogEntryForTarget("linux", "x64", "ninja", DEFAULT_TOOL_VERSION_TOKEN);
  const previous = resolveToolCatalogEntryForTarget("linux", "x64", "ninja", "1.11.1");

  assert.equal(latest.id, "ninja-1.12.1-linux-x64");
  assert.equal(latest.version, "1.12.1");
  assert.equal(previous.id, "ninja-1.11.1-linux-x64");
  assert.equal(previous.version, "1.11.1");
  assert.equal(previous.sourceKind, "catalog-archive");
});

test("macOS arm64 ninja exact versions stay limited to catalog-listed releases", () => {
  const latest = resolveToolCatalogEntryForTarget("darwin", "arm64", "ninja", DEFAULT_TOOL_VERSION_TOKEN);
  assert.equal(latest.id, "ninja-1.12.1-darwin-arm64");
  assert.throws(
    () => resolveToolCatalogEntryForTarget("darwin", "arm64", "ninja", "1.11.1"),
    /catalog/
  );
});

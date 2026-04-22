import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  LATEST_TOOL_VERSION_TOKEN,
  getToolCatalogEntries,
  resolveToolCatalogEntry,
  resolveToolCatalogEntryForTarget
} from "../src/main/cppx/tool-catalog";

const hasManagedConanCatalog = getToolCatalogEntries("conan").length > 0;

test("conan default catalog entry uses the GitHub release archive feed on supported Windows hosts", () => {
  if (!hasManagedConanCatalog) {
    return;
  }

  const entry = resolveToolCatalogEntry("conan", DEFAULT_TOOL_VERSION_TOKEN);
  assert.equal(entry.sourceKind, "catalog-github-release");
  assert.match(entry.repoUrl ?? "", /conan-io\/conan\/releases\?per_page=20$/);
  assert.deepEqual(entry.assetPatterns, ["^conan-.*-windows-x86_64\\.zip$"]);
});

test("conan latest resolves to the same GitHub release catalog entry", () => {
  if (!hasManagedConanCatalog) {
    return;
  }

  const latest = resolveToolCatalogEntry("conan", LATEST_TOOL_VERSION_TOKEN);
  const fallback = resolveToolCatalogEntry("conan", DEFAULT_TOOL_VERSION_TOKEN);
  assert.equal(latest.id, fallback.id);
  assert.equal(latest.sourceKind, "catalog-github-release");
});

test("conan exact versions reuse the GitHub release catalog entry", () => {
  if (!hasManagedConanCatalog) {
    return;
  }

  const exact = resolveToolCatalogEntry("conan", "2.26.2");
  assert.equal(exact.id, "conan-latest-windows-x64");
  assert.equal(exact.version, "2.26.2");
  assert.equal(exact.sourceKind, "catalog-github-release");
});

test("macOS conan exact versions reuse the GitHub release catalog entry", () => {
  const exact = resolveToolCatalogEntryForTarget("darwin", "arm64", "conan", "2.26.2");
  assert.equal(exact.id, "conan-latest-darwin-arm64");
  assert.equal(exact.version, "2.26.2");
  assert.equal(exact.sourceKind, "catalog-github-release");
  assert.deepEqual(exact.assetPatterns, ["^conan-.*-macos-arm64\\.tgz$"]);
});

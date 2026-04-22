import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  LATEST_TOOL_VERSION_TOKEN,
  getToolCatalogEntries,
  resolveToolCatalogEntry
} from "../src/main/cppx/tool-catalog";

const hasManagedVcpkgCatalog = getToolCatalogEntries("vcpkg").length > 0;

test("vcpkg default catalog entry is a pinned archive release with checksum", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }

  const entry = resolveToolCatalogEntry("vcpkg", DEFAULT_TOOL_VERSION_TOKEN);
  assert.match(entry.version ?? "", /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/);
  assert.equal(entry.sourceKind, "catalog-archive");
  assert.equal(typeof entry.sha256, "string");
  assert.equal((entry.sha256 ?? "").length, 64);
});

test("vcpkg latest resolves to the newest curated catalog archive", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }

  const latest = resolveToolCatalogEntry("vcpkg", LATEST_TOOL_VERSION_TOKEN);
  const fallback = resolveToolCatalogEntry("vcpkg", DEFAULT_TOOL_VERSION_TOKEN);
  assert.equal(latest.id, fallback.id);
  assert.equal(latest.version, fallback.version);
});

test("vcpkg exact versions reject values outside the curated catalog", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }

  assert.throws(
    () => resolveToolCatalogEntry("vcpkg", "master"),
    /catalog에 등록된 버전만 지원/
  );
  assert.throws(
    () => resolveToolCatalogEntry("vcpkg", "release/latest"),
    /catalog에 등록된 버전만 지원/
  );
  assert.throws(
    () => resolveToolCatalogEntry("vcpkg", "c3867e714dd3a51c272826eea77267876517ed99"),
    /catalog에 등록된 버전만 지원/
  );
});

test("vcpkg exact versions allow only catalog-listed releases", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }

  const latest = resolveToolCatalogEntry("vcpkg", "2026.03.18");
  const previous = resolveToolCatalogEntry("vcpkg", "2026.02.27");
  assert.equal(latest.version, "2026.03.18");
  assert.equal(previous.version, "2026.02.27");
  assert.equal(previous.sourceKind, "catalog-archive");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TOOL_VERSION_TOKEN,
  getToolCatalogEntries,
  isTrustedCatalogGitRef,
  resolveToolCatalogEntry
} from "../src/main/cppx/tool-catalog";

const hasManagedVcpkgCatalog = getToolCatalogEntries("vcpkg").length > 0;

test("vcpkg default catalog entry is pinned to a trusted release tag", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }
  const entry = resolveToolCatalogEntry("vcpkg", DEFAULT_TOOL_VERSION_TOKEN);

  assert.match(entry.version ?? "", /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/);
  assert.equal(isTrustedCatalogGitRef(entry, entry.version ?? ""), true);
});

test("vcpkg exact versions reject untrusted git refs", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }
  assert.throws(
    () => resolveToolCatalogEntry("vcpkg", "master"),
    /신뢰된 tag 또는 commit ref만 지원/
  );
  assert.throws(
    () => resolveToolCatalogEntry("vcpkg", "release/latest"),
    /신뢰된 tag 또는 commit ref만 지원/
  );
});

test("vcpkg exact versions allow trusted release tags and commit refs", () => {
  if (!hasManagedVcpkgCatalog) {
    return;
  }
  const tagged = resolveToolCatalogEntry("vcpkg", "2026.03.18");
  const commit = resolveToolCatalogEntry("vcpkg", "c3867e714dd3a51c272826eea77267876517ed99");

  assert.equal(tagged.version, "2026.03.18");
  assert.equal(commit.version, "c3867e714dd3a51c272826eea77267876517ed99");
});

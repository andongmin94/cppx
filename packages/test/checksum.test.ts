import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { CppxError } from "../src/main/cppx/errors";
import { verifyFileChecksumOrThrow } from "../src/main/cppx/installers";
import {
  createTempDir,
  removeDir,
  writeText
} from "./support/helpers";

test("verifyFileChecksumOrThrow keeps matching files and returns the normalized digest", async () => {
  const workspace = await createTempDir("checksum-match");

  try {
    const archivePath = path.join(workspace, "archive.zip");
    await writeText(archivePath, "cppx-checksum");

    const digest = await verifyFileChecksumOrThrow(
      archivePath,
      "sha256:7afa9a20b44139d8a306016f250bf82b9648484700ebaa9e99b310a4f01c033a"
    );

    assert.equal(digest, "7afa9a20b44139d8a306016f250bf82b9648484700ebaa9e99b310a4f01c033a");
  } finally {
    await removeDir(workspace);
  }
});

test("verifyFileChecksumOrThrow deletes mismatched files and reports both digests", async () => {
  const workspace = await createTempDir("checksum-mismatch");

  try {
    const archivePath = path.join(workspace, "archive.zip");
    await writeText(archivePath, "cppx-checksum");

    await assert.rejects(
      () =>
        verifyFileChecksumOrThrow(
          archivePath,
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        ),
      (error) => {
        assert.ok(error instanceof CppxError);
        assert.match(error.message, /체크섬이 일치하지 않습니다/);
        assert.match(
          error.details ?? "",
          /expected=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/
        );
        return true;
      }
    );

    await assert.rejects(() => readFile(archivePath, "utf-8"));
  } finally {
    await removeDir(workspace);
  }
});

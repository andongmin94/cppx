import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompilerScanResult,
  type MsvcCompilerInfo
} from "../src/main/cppx/installer-msvc";

test("buildCompilerScanResult preserves primary MSVC summary fields", () => {
  const infos: MsvcCompilerInfo[] = [
    {
      installationPath: "C:\\VS\\2022\\BuildTools",
      displayName: "Visual Studio Build Tools 2022",
      version: "17.14.8",
      devCmdPath: "C:\\VS\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
      clPath: "C:\\VS\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64\\cl.exe"
    },
    {
      installationPath: "C:\\VS\\2019\\BuildTools",
      displayName: "Visual Studio Build Tools 2019",
      version: "16.11.40",
      devCmdPath: "C:\\VS\\2019\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
      clPath: "C:\\VS\\2019\\BuildTools\\VC\\Tools\\MSVC\\14.29.30133\\bin\\Hostx64\\x64\\cl.exe"
    }
  ];

  const scan = buildCompilerScanResult(infos);

  assert.equal(scan.msvcAvailable, true);
  assert.equal(scan.msvcCandidates.length, 2);
  assert.equal(scan.msvcDisplayName, infos[0]?.displayName);
  assert.equal(scan.msvcVersion, infos[0]?.version);
  assert.equal(scan.msvcClPath, infos[0]?.clPath);
  assert.equal(scan.msvcCandidates[0]?.installationPath, infos[0]?.installationPath);
  assert.equal(scan.msvcCandidates[1]?.installationPath, infos[1]?.installationPath);
});

test("buildCompilerScanResult reports an empty MSVC scan cleanly", () => {
  const scan = buildCompilerScanResult([]);

  assert.equal(scan.msvcAvailable, false);
  assert.deepEqual(scan.msvcCandidates, []);
  assert.equal(scan.msvcDisplayName, undefined);
  assert.equal(scan.msvcVersion, undefined);
  assert.equal(scan.msvcClPath, undefined);
});

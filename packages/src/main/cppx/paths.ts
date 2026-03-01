import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "./fs-utils";
import type { ToolManifest, ToolName, ToolRecord } from "./types";

const MANIFEST_FILENAME = "tools-manifest.json";
const LEGACY_TOOLS_DIRNAME = "tools";

export function getCppxRoot(): string {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "cppx");
}

export function getToolsRoot(): string {
  return getCppxRoot();
}

export function getDownloadsRoot(): string {
  return path.join(getCppxRoot(), "downloads");
}

export function getToolRoot(tool: ToolName): string {
  return path.join(getToolsRoot(), tool);
}

export function getToolManifestPath(): string {
  return path.join(getCppxRoot(), MANIFEST_FILENAME);
}

function getLegacyToolManifestPath(): string {
  return path.join(getCppxRoot(), LEGACY_TOOLS_DIRNAME, MANIFEST_FILENAME);
}

function getLegacyToolsRoot(): string {
  return path.join(getCppxRoot(), LEGACY_TOOLS_DIRNAME);
}

async function migrateLegacyToolsLayout(): Promise<void> {
  const cppxRoot = getCppxRoot();
  const legacyToolsRoot = getLegacyToolsRoot();
  if (!(await pathExists(legacyToolsRoot))) {
    return;
  }

  const fallback: ToolManifest = { tools: {} };
  const currentManifestPath = getToolManifestPath();
  const legacyManifestPath = getLegacyToolManifestPath();

  if (
    !(await pathExists(currentManifestPath)) &&
    (await pathExists(legacyManifestPath))
  ) {
    const legacyManifest = await readJsonFile(legacyManifestPath, fallback);
    await writeJsonFile(currentManifestPath, legacyManifest);
  }

  const entries = await fs.readdir(legacyToolsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === MANIFEST_FILENAME) {
      continue;
    }

    const sourcePath = path.join(legacyToolsRoot, entry.name);
    const targetPath = path.join(cppxRoot, entry.name);

    if (await pathExists(targetPath)) {
      continue;
    }

    try {
      await fs.rename(sourcePath, targetPath);
    } catch {
      // Keep legacy layout if move fails; executable fallback via manifest still works.
    }
  }

  const remaining = await fs.readdir(legacyToolsRoot).catch(() => []);
  if (
    remaining.length === 1 &&
    remaining[0] === MANIFEST_FILENAME &&
    (await pathExists(currentManifestPath))
  ) {
    await fs.rm(legacyManifestPath, { force: true });
    await fs.rm(legacyToolsRoot, { recursive: true, force: true });
    return;
  }

  if (remaining.length === 0) {
    await fs.rm(legacyToolsRoot, { recursive: true, force: true });
  }
}

export async function ensureCppxLayout(): Promise<void> {
  await ensureDir(getCppxRoot());
  await migrateLegacyToolsLayout();
}

export async function readToolManifest(): Promise<ToolManifest> {
  const fallback: ToolManifest = { tools: {} };
  const manifestPath = getToolManifestPath();
  if (await pathExists(manifestPath)) {
    return readJsonFile(manifestPath, fallback);
  }

  const legacyManifestPath = getLegacyToolManifestPath();
  if (!(await pathExists(legacyManifestPath))) {
    return fallback;
  }

  const legacyManifest = await readJsonFile(legacyManifestPath, fallback);
  await writeJsonFile(manifestPath, legacyManifest);
  return legacyManifest;
}

export async function upsertToolRecord(record: ToolRecord): Promise<void> {
  const manifest = await readToolManifest();
  manifest.tools[record.name] = record;
  await writeJsonFile(getToolManifestPath(), manifest);
}

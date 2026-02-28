import os from "node:os";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "./fs-utils";
import type { ToolManifest, ToolName, ToolRecord } from "./types";

const MANIFEST_FILENAME = "tools-manifest.json";

export function getCppxRoot(): string {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "cppx");
}

export function getToolsRoot(): string {
  return path.join(getCppxRoot(), "tools");
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

export async function ensureCppxLayout(): Promise<void> {
  await ensureDir(getCppxRoot());
  await ensureDir(getToolsRoot());
  await ensureDir(getDownloadsRoot());
}

export async function readToolManifest(): Promise<ToolManifest> {
  const fallback: ToolManifest = { tools: {} };
  return readJsonFile(getToolManifestPath(), fallback);
}

export async function upsertToolRecord(record: ToolRecord): Promise<void> {
  const manifest = await readToolManifest();
  manifest.tools[record.name] = record;
  await writeJsonFile(getToolManifestPath(), manifest);
}

import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";

const { app } = electron;

const MAX_SHORTCUT_SEARCH_DEPTH = 4;
let cachedDefaultWorkspacePath: string | null = null;

function isPortableBuild(): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

function normalizeWindowsPath(input: string): string {
  return input.replaceAll("/", "\\").toLowerCase();
}

function shortcutNameMatches(
  fileName: string,
  appName: string,
  executableName: string
): boolean {
  const normalized = fileName.toLowerCase();
  const appToken = appName.toLowerCase();
  const exeToken = executableName.toLowerCase();
  return normalized.includes(appToken) || normalized.includes(exeToken);
}

async function findShortcutDirectoryByName(
  root: string,
  appName: string,
  executableName: string,
  depth = 0
): Promise<string | null> {
  if (depth > MAX_SHORTCUT_SEARCH_DEPTH) {
    return null;
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".lnk")) {
      continue;
    }

    if (shortcutNameMatches(entry.name, appName, executableName)) {
      return root;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nested = await findShortcutDirectoryByName(
      path.join(root, entry.name),
      appName,
      executableName,
      depth + 1
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

async function resolveInstalledShortcutDirectory(
  appName: string,
  executableName: string
): Promise<string | null> {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const programData = process.env.ProgramData ?? "C:\\ProgramData";

  const desktop = app.getPath("desktop");
  const searchRoots = [
    desktop,
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs")
  ];

  for (const root of searchRoots) {
    const found = await findShortcutDirectoryByName(
      root,
      appName,
      executableName
    );
    if (found) {
      return found;
    }
  }

  return null;
}

export async function resolveDefaultWorkspacePath(): Promise<string> {
  if (cachedDefaultWorkspacePath) {
    return cachedDefaultWorkspacePath;
  }

  if (process.platform !== "win32") {
    cachedDefaultWorkspacePath = process.cwd();
    return cachedDefaultWorkspacePath;
  }

  if (!app.isPackaged) {
    cachedDefaultWorkspacePath = process.cwd();
    return cachedDefaultWorkspacePath;
  }

  if (isPortableBuild()) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir && portableDir.trim().length > 0) {
      cachedDefaultWorkspacePath = path.resolve(portableDir);
      return cachedDefaultWorkspacePath;
    }
  }

  const executableDir = path.dirname(process.execPath);
  const executableName = path.basename(process.execPath, ".exe");
  const shortcutDir = await resolveInstalledShortcutDirectory(
    app.getName(),
    executableName
  );

  if (shortcutDir) {
    cachedDefaultWorkspacePath = path.resolve(shortcutDir);
    return cachedDefaultWorkspacePath;
  }

  const normalizedExeDir = normalizeWindowsPath(executableDir);
  if (normalizedExeDir.includes("\\program files\\") || normalizedExeDir.includes("\\program files (x86)\\")) {
    cachedDefaultWorkspacePath = app.getPath("desktop");
    return cachedDefaultWorkspacePath;
  }

  cachedDefaultWorkspacePath = executableDir;
  return cachedDefaultWorkspacePath;
}

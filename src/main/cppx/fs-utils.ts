import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function readJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  if (!(await pathExists(targetPath))) {
    return fallback;
  }

  const raw = await fs.readFile(targetPath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  const content = JSON.stringify(value, null, 2);
  await fs.writeFile(targetPath, `${content}\n`, "utf-8");
}

export async function writeTextFile(targetPath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, "utf-8");
}

export async function findFileRecursive(
  rootPath: string,
  filename: string
): Promise<string | null> {
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
    }
  }

  return null;
}

export function normalizeWindowsPath(rawPath: string): string {
  return rawPath.replace(/\//g, "\\");
}

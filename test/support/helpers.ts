import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHostAdapter } from "../../src/main/cppx/platform";
import type { Toolchain } from "../../src/main/cppx/types";
import { CppxLogger } from "../../src/main/cppx/logger";

export async function createTempDir(name: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `cppx-${name}-`));
}

export async function removeDir(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function writeText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf-8");
}

export async function writeExecutable(targetPath: string, content = ""): Promise<void> {
  await writeText(targetPath, content);
  if (process.platform !== "win32") {
    await fs.chmod(targetPath, 0o755);
  }
}

export async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await writeText(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readText(targetPath: string): Promise<string> {
  return fs.readFile(targetPath, "utf-8");
}

export async function readJson<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readText(targetPath)) as T;
}

export function generatedRoot(workspace: string): string {
  return path.join(workspace, "build", ".cppx");
}

export async function readFixtureText(...segments: string[]): Promise<string> {
  return readText(path.join(fixtureRoot(), ...segments));
}

export async function readFixtureJson<T>(...segments: string[]): Promise<T> {
  return readJson(path.join(fixtureRoot(), ...segments));
}

export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export async function withEnv<T>(
  key: string,
  value: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  const previous = process.env[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

export async function withHostDataRoot<T>(root: string, run: () => Promise<T>): Promise<T> {
  if (process.platform === "win32") {
    return withEnv("LOCALAPPDATA", root, run);
  }

  if (process.platform === "darwin") {
    return withEnv("HOME", root, run);
  }

  return withEnv("XDG_DATA_HOME", root, run);
}

export function createLogger() {
  const entries: { message: string; level: string; action: string }[] = [];
  const logger = new CppxLogger((entry) => {
    entries.push({
      message: entry.message,
      level: entry.level,
      action: entry.action
    });
  });

  return { entries, logger };
}

export function createToolchain(overrides: Partial<Toolchain> = {}): Toolchain {
  const hostAdapter = getHostAdapter();
  const baseRoot = hostAdapter.platform === "win32" ? "C:\\cppx-tools" : "/opt/cppx-tools";
  const base: Toolchain = {
    cmake: path.join(baseRoot, "cmake", "bin", hostAdapter.getExecutableName("cmake")),
    ninja: path.join(baseRoot, "ninja", hostAdapter.getExecutableName("ninja")),
    vcpkg: path.join(baseRoot, "vcpkg", hostAdapter.getExecutableName("vcpkg")),
    cxx: path.join(baseRoot, "llvm-mingw", "bin", hostAdapter.getExecutableName("clang++")),
    envPath: [
      path.join(baseRoot, "cmake", "bin"),
      path.join(baseRoot, "ninja"),
      path.join(baseRoot, "vcpkg"),
      path.join(baseRoot, "llvm-mingw", "bin")
    ],
    compilerFamily: "mingw"
  };

  return {
    ...base,
    ...overrides,
    envPath: overrides.envPath ?? base.envPath
  };
}

function fixtureRoot(): string {
  return path.resolve(import.meta.dirname, "..", "fixtures");
}

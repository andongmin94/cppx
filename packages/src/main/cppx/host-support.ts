import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import type {
  HostPlatformPayload,
  HostSupportPayload,
  ToolLifecycleCapabilities,
  ToolLifecycleProvider,
  ToolOwnership
} from "@shared/contracts";
import { getHostAdapter, type HostPlatform } from "./platform";
import type { ToolName, ToolRecord, ToolSourceKind } from "./types";

interface LinuxReleaseInfo {
  id?: string;
  versionId?: string;
  prettyName?: string;
}

interface HomebrewInfo {
  available: boolean;
  executable?: string;
  prefix?: string;
}

interface AptInfo {
  available: boolean;
  executable?: string;
}

export interface HostSupportContext {
  platform?: HostPlatform;
  arch?: string;
  linuxOsReleaseText?: string | null;
  macosVersion?: string | null;
  homebrewAvailable?: boolean;
  homebrewExecutable?: string | null;
  homebrewPrefix?: string | null;
  aptAvailable?: boolean;
  aptExecutable?: string | null;
}

const execFile = promisify(execFileCb);

function stripQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, "$1").trim();
}

function getDefaultHomebrewPrefix(arch: string): string {
  return arch === "arm64" ? "/opt/homebrew" : "/usr/local";
}

function parseVersionMajor(version?: string | null): number | null {
  if (!version) {
    return null;
  }

  const [majorPart] = version.trim().split(".");
  const major = Number.parseInt(majorPart ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

export function isSupportedMacOsVersion(version?: string | null): boolean {
  const major = parseVersionMajor(version);
  return major !== null && major >= 14;
}

export function isSupportedUbuntuVersion(version?: string | null): boolean {
  return typeof version === "string" && version.startsWith("24.04");
}

export function parseLinuxOsRelease(text: string): LinuxReleaseInfo {
  const info: LinuxReleaseInfo = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim().toUpperCase();
    const value = stripQuotes(trimmed.slice(separator + 1));
    if (key === "ID") {
      info.id = value.toLowerCase();
    } else if (key === "VERSION_ID") {
      info.versionId = value;
    } else if (key === "PRETTY_NAME") {
      info.prettyName = value;
    }
  }

  return info;
}

async function readLinuxOsRelease(
  context: HostSupportContext
): Promise<LinuxReleaseInfo | undefined> {
  if (context.platform !== "linux") {
    return undefined;
  }

  if (typeof context.linuxOsReleaseText === "string") {
    return parseLinuxOsRelease(context.linuxOsReleaseText);
  }

  try {
    const content = await fs.readFile("/etc/os-release", "utf-8");
    return parseLinuxOsRelease(content);
  } catch {
    return undefined;
  }
}

async function resolveMacOsVersion(
  context: HostSupportContext
): Promise<string | undefined> {
  if (context.platform !== "darwin") {
    return undefined;
  }

  if (typeof context.macosVersion === "string" && context.macosVersion.trim().length > 0) {
    return context.macosVersion.trim();
  }

  if (process.platform !== "darwin") {
    return undefined;
  }

  try {
    const { stdout } = await execFile("sw_vers", ["-productVersion"], {
      windowsHide: true
    });
    const version = stdout.trim();
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

async function resolveHomebrewInfo(context: HostSupportContext): Promise<HomebrewInfo> {
  if (context.platform !== "darwin") {
    return { available: false };
  }

  const arch = context.arch ?? process.arch;
  const fallbackPrefix = getDefaultHomebrewPrefix(arch);

  if (typeof context.homebrewAvailable === "boolean") {
    return {
      available: context.homebrewAvailable,
      executable: context.homebrewExecutable?.trim() || undefined,
      prefix:
        context.homebrewPrefix?.trim() ||
        (context.homebrewAvailable ? fallbackPrefix : undefined)
    };
  }

  if (process.platform !== "darwin") {
    return {
      available: false,
      prefix: context.homebrewPrefix?.trim() || fallbackPrefix
    };
  }

  try {
    const { stdout } = await execFile("brew", ["--prefix"], {
      windowsHide: true
    });
    const prefix = stdout.trim() || fallbackPrefix;
    return {
      available: true,
      executable: "brew",
      prefix
    };
  } catch {
    return {
      available: false,
      prefix: context.homebrewPrefix?.trim() || fallbackPrefix
    };
  }
}

async function resolveAptInfo(context: HostSupportContext): Promise<AptInfo> {
  if (context.platform !== "linux") {
    return { available: false };
  }

  if (typeof context.aptAvailable === "boolean") {
    return {
      available: context.aptAvailable,
      executable: context.aptExecutable?.trim() || undefined
    };
  }

  if (process.platform !== "linux") {
    return { available: false };
  }

  try {
    await execFile("apt-get", ["--version"], {
      windowsHide: true
    });
    return {
      available: true,
      executable: "apt-get"
    };
  } catch {
    return { available: false };
  }
}

export function isPathManagedByHomebrew(
  executablePath: string,
  options: { prefix?: string | null } = {}
): boolean {
  const normalized = executablePath.replaceAll("\\", "/");
  const prefix = options.prefix?.trim()?.replaceAll("\\", "/");
  if (prefix && normalized.startsWith(prefix)) {
    return true;
  }

  return (
    normalized.startsWith("/opt/homebrew/") ||
    normalized.startsWith("/usr/local/Cellar/") ||
    normalized.startsWith("/usr/local/opt/") ||
    normalized.startsWith("/usr/local/bin/") ||
    normalized.startsWith("/opt/homebrew/bin/") ||
    normalized.includes("/Homebrew/")
  );
}

export function isPathManagedByApt(executablePath: string): boolean {
  const normalized = executablePath.replaceAll("\\", "/");
  if (normalized.startsWith("/usr/local/")) {
    return false;
  }

  return (
    normalized.startsWith("/usr/bin/") ||
    normalized.startsWith("/bin/") ||
    normalized.startsWith("/usr/lib/llvm-")
  );
}

export function isPathManagedByPipx(
  executablePath: string,
  options: { binDir?: string | null } = {}
): boolean {
  const normalized = executablePath.replaceAll("\\", "/");
  const binDir = options.binDir?.trim().replaceAll("\\", "/");
  if (binDir && normalized.startsWith(`${binDir}/`)) {
    return true;
  }

  return (
    normalized.includes("/.local/bin/") ||
    normalized.includes("/pipx/venvs/") ||
    normalized.includes("/pipx/bin/")
  );
}

export async function resolveHostSupport(
  context: HostSupportContext = {}
): Promise<HostSupportPayload> {
  const adapter = getHostAdapter(context.platform);
  const platform = adapter.platform as HostPlatformPayload;
  const arch = context.arch ?? process.arch;

  if (platform === "win32") {
    return {
      platform,
      arch,
      hostLabel: `Windows ${arch}`,
      tier: "official",
      managedLifecycleReady: true,
      recommendedProvider: "archive",
      notes: []
    };
  }

  if (platform === "darwin") {
    const [version, homebrew] = await Promise.all([
      resolveMacOsVersion({ ...context, platform }),
      resolveHomebrewInfo({ ...context, platform, arch })
    ]);
    const supported = isSupportedMacOsVersion(version);
    const notes: string[] = [];

    if (supported) {
      notes.push("Official macOS managed flow uses Homebrew.");
      notes.push("vcpkg uses a verified archive/bootstrap path.");
      if (!homebrew.available) {
        notes.push("Homebrew is required before macOS managed installs can run.");
      }
    } else {
      notes.push("Managed macOS support is limited to macOS 14 and newer.");
      notes.push("Other macOS versions fall back to conservative system mode.");
    }

    return {
      platform,
      arch,
      hostLabel: version ? `macOS ${version} (${arch})` : `macOS ${arch}`,
      tier: supported ? "official" : "best-effort",
      managedLifecycleReady: supported && homebrew.available,
      recommendedProvider: supported ? "homebrew" : "system",
      notes
    };
  }

  const [release, apt] = await Promise.all([
    readLinuxOsRelease({ ...context, platform }),
    resolveAptInfo({ ...context, platform })
  ]);
  const distroId = release?.id;
  const distroVersion = release?.versionId;
  const isUbuntu2404 = distroId === "ubuntu" && isSupportedUbuntuVersion(distroVersion);

  if (isUbuntu2404) {
    const notes = [
      "Official Linux managed support is limited to Ubuntu 24.04.",
      "Ubuntu 24.04 uses apt for managed core tools and archive/bootstrap for vcpkg.",
      "Ubuntu 24.04 uses pipx-managed Conan to avoid mutating the system Python environment."
    ];

    if (!apt.available) {
      notes.push("apt-get was not found, so managed lifecycle stays unavailable.");
    }

    return {
      platform,
      arch,
      hostLabel: release?.prettyName ?? `Ubuntu 24.04 (${arch})`,
      tier: "official",
      managedLifecycleReady: apt.available,
      recommendedProvider: "apt",
      distroId,
      distroVersion,
      notes
    };
  }

  return {
    platform,
    arch,
    hostLabel:
      release?.prettyName ??
      (distroId ? `Linux (${distroId}${distroVersion ? ` ${distroVersion}` : ""})` : `Linux ${arch}`),
    tier: "best-effort",
    managedLifecycleReady: false,
    recommendedProvider: "system",
    distroId,
    distroVersion,
    notes: [
      "Managed Linux support is limited to Ubuntu 24.04.",
      "Unsupported Linux distributions stay in conservative system mode."
    ]
  };
}

function createLifecycleCapabilities(
  provider: ToolLifecycleProvider,
  actions: Pick<ToolLifecycleCapabilities, "detect" | "install" | "repair" | "remove">,
  note?: string
): ToolLifecycleCapabilities {
  return {
    provider,
    detect: actions.detect,
    install: actions.install,
    repair: actions.repair,
    remove: actions.remove,
    ...(note ? { note } : {})
  };
}

export async function resolveToolLifecycleCapabilities(
  tool: ToolName,
  context: HostSupportContext = {}
): Promise<ToolLifecycleCapabilities> {
  const support = await resolveHostSupport(context);

  if (support.platform === "win32") {
    if (tool === "conan") {
      return createLifecycleCapabilities(
        "system",
        { detect: true, install: false, repair: false, remove: false },
        "Windows currently detects conan from PATH only."
      );
    }

    if (tool === "cxx") {
      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: true, repair: true, remove: true },
        "Windows manages MinGW toolchains and detects MSVC separately."
      );
    }

    return createLifecycleCapabilities("archive", {
      detect: true,
      install: true,
      repair: true,
      remove: true
    });
  }

  if (support.platform === "darwin") {
    if (tool === "vcpkg") {
      if (support.tier === "official") {
        return createLifecycleCapabilities(
          "archive",
          { detect: true, install: true, repair: true, remove: true },
          "macOS uses a verified archive/bootstrap path for vcpkg."
        );
      }

      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: false, repair: false, remove: false },
        "Managed vcpkg support is limited to official macOS hosts."
      );
    }

    if (support.managedLifecycleReady) {
      return createLifecycleCapabilities(
        "homebrew",
        { detect: true, install: true, repair: true, remove: true },
        tool === "cxx"
          ? "macOS managed C++ installs the Homebrew llvm toolchain."
          : "macOS managed tools use Homebrew formulas."
      );
    }

    return createLifecycleCapabilities(
      "homebrew",
      { detect: true, install: false, repair: false, remove: false },
      support.tier === "official"
        ? "Homebrew must be available before macOS managed installs can run."
        : "Managed macOS support is limited to official macOS hosts."
    );
  }

  if (support.platform === "linux") {
    if (tool === "vcpkg") {
      if (support.tier === "official") {
        return createLifecycleCapabilities(
          "archive",
          { detect: true, install: true, repair: true, remove: true },
          "Ubuntu 24.04 manages vcpkg through the verified archive/bootstrap path."
        );
      }

      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: false, repair: false, remove: false },
        "Managed Linux vcpkg support is limited to Ubuntu 24.04."
      );
    }

    if (tool === "conan") {
      if (support.recommendedProvider === "apt") {
        if (support.managedLifecycleReady) {
          return createLifecycleCapabilities(
            "pipx",
            { detect: true, install: true, repair: true, remove: true },
            "Ubuntu 24.04 managed Conan uses pipx."
          );
        }

        return createLifecycleCapabilities(
          "pipx",
          { detect: true, install: false, repair: false, remove: false },
          "apt-get must be available before Ubuntu managed Conan installs can run."
        );
      }

      return createLifecycleCapabilities(
        "system",
        { detect: true, install: false, repair: false, remove: false },
        "Unsupported Linux distributions use system conan only."
      );
    }

    if (support.recommendedProvider === "apt") {
      if (support.managedLifecycleReady) {
        return createLifecycleCapabilities(
          "apt",
          { detect: true, install: true, repair: true, remove: true },
          tool === "cxx"
            ? "Ubuntu 24.04 managed C++ installs clang via apt."
            : "Ubuntu 24.04 managed core tools use apt."
        );
      }

      return createLifecycleCapabilities(
        "apt",
        { detect: true, install: false, repair: false, remove: false },
        "apt-get must be available before Ubuntu managed installs can run."
      );
    }

    return createLifecycleCapabilities(
      "system",
      { detect: true, install: false, repair: false, remove: false },
      "Managed Linux support is limited to Ubuntu 24.04."
    );
  }

  return createLifecycleCapabilities("system", {
    detect: true,
    install: false,
    repair: false,
    remove: false
  });
}

export function inferProviderFromSourceKind(sourceKind?: ToolSourceKind): ToolLifecycleProvider {
  switch (sourceKind) {
    case "catalog-archive":
    case "catalog-github-release":
      return "archive";
    case "catalog-git":
      return "git";
    case "apt-managed":
      return "apt";
    case "pipx-managed":
      return "pipx";
    case "homebrew-managed":
      return "homebrew";
    case "msvc-detected":
      return "msvc";
    case "system-detected":
      return "system";
    default:
      return "unknown";
  }
}

export function inferOwnership(
  record: Pick<ToolRecord, "ownership" | "mode"> | undefined,
  fallbackMode: "managed" | "system"
): ToolOwnership {
  if (record?.ownership) {
    return record.ownership;
  }

  return (record?.mode ?? fallbackMode) === "managed" ? "cppx" : "external";
}

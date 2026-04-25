import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import type {
  HostPlatformPayload,
  HostSupportPayload,
  ToolLifecycleCapabilities,
  ToolLifecycleProvider,
  ToolLifecycleVersionSource,
  ToolOwnership,
  ToolSystemDetectionKind
} from "@shared/contracts";
import {
  getLinuxAptLifecycleRequirementNote,
  getLinuxManagedCoreToolNote,
  getLinuxManagedConanNote,
  getLinuxManagedCxxNote,
  getLinuxManagedHostNotes,
  getLinuxManagedSupportLimitNote,
  getLinuxManagedVcpkgNote,
  getUnsupportedLinuxHostNote,
  parseLinuxOsRelease,
  resolveLinuxHostProfile,
  type LinuxHostProfile,
  type LinuxReleaseInfo
} from "./linux-profiles";
import { getHostAdapter, type HostPlatform } from "./platform";
import type { ToolName, ToolRecord, ToolSourceKind } from "./types";

interface HomebrewInfo {
  available: boolean;
  executable?: string;
  prefix?: string;
}

interface AptInfo {
  available: boolean;
  executable?: string;
}

type LifecycleActions = Pick<ToolLifecycleCapabilities, "detect" | "install" | "repair" | "remove">;
type LifecycleMetadata = Pick<
  ToolLifecycleCapabilities,
  | "supportsExactPin"
  | "supportsFloatingVersion"
  | "supportsInstanceSelection"
  | "versionSource"
  | "systemDetectionKind"
>;

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

const WINDOWS_ARCHIVE_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "cppx-verified",
  systemDetectionKind: "path"
};

const WINDOWS_CXX_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: true,
  versionSource: "upstream",
  systemDetectionKind: "instance-or-path"
};

const MAC_PROVIDER_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "host-provider-or-cppx-verified",
  systemDetectionKind: "path-with-provider"
};

const MAC_CXX_METADATA: LifecycleMetadata = {
  supportsExactPin: false,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "host-provider",
  systemDetectionKind: "path-with-provider"
};

const VERIFIED_ARCHIVE_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "cppx-verified",
  systemDetectionKind: "path"
};

const LINUX_APT_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "host-provider-or-cppx-verified",
  systemDetectionKind: "path-with-provider"
};

const LINUX_CXX_METADATA: LifecycleMetadata = {
  supportsExactPin: false,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "host-provider",
  systemDetectionKind: "path-with-provider"
};

const LINUX_PIPX_METADATA: LifecycleMetadata = {
  supportsExactPin: true,
  supportsFloatingVersion: true,
  supportsInstanceSelection: false,
  versionSource: "upstream",
  systemDetectionKind: "path-with-provider"
};

const UNSUPPORTED_METADATA: LifecycleMetadata = {
  supportsExactPin: false,
  supportsFloatingVersion: false,
  supportsInstanceSelection: false,
  versionSource: "unknown",
  systemDetectionKind: "none"
};

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

export { parseLinuxOsRelease };

async function readLinuxOsRelease(
  context: HostSupportContext
): Promise<LinuxReleaseInfo | undefined> {
  if (context.platform !== "linux") {
    return undefined;
  }

  if (typeof context.linuxOsReleaseText === "string") {
    return parseLinuxOsRelease(context.linuxOsReleaseText);
  }

  const envOverride = process.env.CPPX_LINUX_OS_RELEASE?.trim();
  if (envOverride) {
    return parseLinuxOsRelease(envOverride);
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

function createLifecycleCapabilities(
  provider: ToolLifecycleProvider,
  actions: LifecycleActions,
  metadata: LifecycleMetadata,
  note?: string
): ToolLifecycleCapabilities {
  return {
    provider,
    detect: actions.detect,
    install: actions.install,
    repair: actions.repair,
    remove: actions.remove,
    supportsExactPin: metadata.supportsExactPin,
    supportsFloatingVersion: metadata.supportsFloatingVersion,
    supportsInstanceSelection: metadata.supportsInstanceSelection,
    versionSource: metadata.versionSource,
    systemDetectionKind: metadata.systemDetectionKind,
    ...(note ? { note } : {})
  };
}

function createUnavailableLifecycle(
  provider: ToolLifecycleProvider,
  metadata: LifecycleMetadata,
  note: string
): ToolLifecycleCapabilities {
  return createLifecycleCapabilities(
    provider,
    { detect: true, install: false, repair: false, remove: false },
    metadata,
    note
  );
}

function createUnsupportedLifecycle(note: string): ToolLifecycleCapabilities {
  return createLifecycleCapabilities(
    "unknown",
    { detect: false, install: false, repair: false, remove: false },
    UNSUPPORTED_METADATA,
    note
  );
}

function getLinuxProfileFromSupport(
  support: Pick<HostSupportPayload, "arch" | "distroId" | "distroVersion">
): LinuxHostProfile | undefined {
  if (!support.distroId || !support.distroVersion) {
    return undefined;
  }

  return resolveLinuxHostProfile({
    id: support.distroId,
    versionId: support.distroVersion
  }, support.arch);
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
      notes.push("Pinned exact versions for cmake, ninja, and conan use verified archives.");
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
  const linuxProfile = resolveLinuxHostProfile(release, arch);

  if (linuxProfile) {
    const notes = getLinuxManagedHostNotes(linuxProfile);
    if (!apt.available) {
      notes.push(getLinuxAptLifecycleRequirementNote(linuxProfile));
    }

    return {
      platform,
      arch,
      hostLabel: release?.prettyName ?? `${linuxProfile.label} (${arch})`,
      tier: "official",
      managedLifecycleReady: apt.available,
      recommendedProvider: linuxProfile.recommendedProvider,
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
    tier: "unsupported",
    managedLifecycleReady: false,
    recommendedProvider: "unknown",
    distroId,
    distroVersion,
    notes: [getLinuxManagedSupportLimitNote(), getUnsupportedLinuxHostNote()]
  };
}

function getVersionMetadata(
  source: ToolLifecycleVersionSource,
  detection: ToolSystemDetectionKind,
  options: {
    supportsExactPin: boolean;
    supportsFloatingVersion: boolean;
    supportsInstanceSelection?: boolean;
  }
): LifecycleMetadata {
  return {
    supportsExactPin: options.supportsExactPin,
    supportsFloatingVersion: options.supportsFloatingVersion,
    supportsInstanceSelection: options.supportsInstanceSelection ?? false,
    versionSource: source,
    systemDetectionKind: detection
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
        "archive",
        { detect: true, install: true, repair: true, remove: true },
        WINDOWS_ARCHIVE_METADATA,
        "Windows manages Conan from the official verified release archive."
      );
    }

    if (tool === "cxx") {
      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: true, repair: true, remove: true },
        WINDOWS_CXX_METADATA,
        "Windows manages MinGW toolchains and detects MSVC separately."
      );
    }

    return createLifecycleCapabilities(
      "archive",
      { detect: true, install: true, repair: true, remove: true },
      WINDOWS_ARCHIVE_METADATA
    );
  }

  if (support.platform === "darwin") {
    if (tool === "vcpkg") {
      if (support.tier === "official") {
        return createLifecycleCapabilities(
          "archive",
          { detect: true, install: true, repair: true, remove: true },
          VERIFIED_ARCHIVE_METADATA,
          "macOS uses a verified archive/bootstrap path for vcpkg."
        );
      }

      return createUnavailableLifecycle(
        "archive",
        getVersionMetadata("cppx-verified", "path", {
          supportsExactPin: false,
          supportsFloatingVersion: false
        }),
        "Managed vcpkg support is limited to official macOS hosts."
      );
    }

    if (support.managedLifecycleReady) {
      return createLifecycleCapabilities(
        "homebrew",
        { detect: true, install: true, repair: true, remove: true },
        tool === "cxx" ? MAC_CXX_METADATA : MAC_PROVIDER_METADATA,
        tool === "cxx"
          ? "macOS managed C++ installs the Homebrew llvm toolchain. Exact compiler pinning is not yet supported."
          : tool === "conan"
            ? "macOS managed Conan uses Homebrew by default and verified release archives for exact pinned versions."
            : tool === "cmake" || tool === "ninja"
              ? "macOS managed core tools use Homebrew by default and verified archives for exact pinned versions."
              : "macOS managed tools use Homebrew formulas."
      );
    }

    return createUnavailableLifecycle(
      "homebrew",
      tool === "cxx"
        ? getVersionMetadata("host-provider", "path-with-provider", {
            supportsExactPin: false,
            supportsFloatingVersion: false
          })
        : getVersionMetadata("host-provider-or-cppx-verified", "path-with-provider", {
            supportsExactPin: false,
            supportsFloatingVersion: false
          }),
      support.tier === "official"
        ? "Homebrew must be available before macOS managed installs can run."
        : "Managed macOS support is limited to official macOS hosts."
    );
  }

  if (support.platform === "linux") {
    const linuxProfile = getLinuxProfileFromSupport(support);

    if (!linuxProfile) {
      return createUnsupportedLifecycle(
        `${getLinuxManagedSupportLimitNote()} ${getUnsupportedLinuxHostNote()}`
      );
    }

    if (tool === "vcpkg") {
      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: true, repair: true, remove: true },
        VERIFIED_ARCHIVE_METADATA,
        getLinuxManagedVcpkgNote(linuxProfile)
      );
    }

    if (tool === "conan") {
      if (support.managedLifecycleReady) {
        return createLifecycleCapabilities(
          "pipx",
          { detect: true, install: true, repair: true, remove: true },
          LINUX_PIPX_METADATA,
          getLinuxManagedConanNote(linuxProfile)
        );
      }

      return createUnavailableLifecycle(
        "pipx",
        getVersionMetadata("upstream", "path-with-provider", {
          supportsExactPin: false,
          supportsFloatingVersion: false
        }),
        getLinuxAptLifecycleRequirementNote(linuxProfile)
      );
    }

    if (support.managedLifecycleReady) {
      return createLifecycleCapabilities(
        "apt",
        { detect: true, install: true, repair: true, remove: true },
        tool === "cxx" ? LINUX_CXX_METADATA : LINUX_APT_METADATA,
        tool === "cxx"
          ? getLinuxManagedCxxNote(linuxProfile)
          : getLinuxManagedCoreToolNote(linuxProfile)
      );
    }

    return createUnavailableLifecycle(
      "apt",
      tool === "cxx"
        ? getVersionMetadata("host-provider", "path-with-provider", {
            supportsExactPin: false,
            supportsFloatingVersion: false
          })
        : getVersionMetadata("host-provider-or-cppx-verified", "path-with-provider", {
            supportsExactPin: false,
            supportsFloatingVersion: false
          }),
      getLinuxAptLifecycleRequirementNote(linuxProfile)
    );
  }

  return createLifecycleCapabilities(
    "system",
    { detect: true, install: false, repair: false, remove: false },
    {
      supportsExactPin: false,
      supportsFloatingVersion: false,
      supportsInstanceSelection: false,
      versionSource: "unknown",
      systemDetectionKind: "unknown"
    }
  );
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

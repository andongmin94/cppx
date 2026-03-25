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

export interface HostSupportContext {
  platform?: HostPlatform;
  arch?: string;
  linuxOsReleaseText?: string | null;
  macosVersion?: string | null;
  homebrewAvailable?: boolean;
  homebrewExecutable?: string | null;
  homebrewPrefix?: string | null;
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
      notes.push("공식 macOS 경로는 Homebrew 기반 managed 수명주기를 사용합니다.");
      notes.push("vcpkg는 검증된 아카이브를 내려받아 bootstrap합니다.");
      if (!homebrew.available) {
        notes.push("Homebrew가 감지되지 않았습니다. managed 설치를 쓰려면 먼저 Homebrew를 준비해야 합니다.");
      }
    } else {
      notes.push("macOS managed 경로는 14 이상을 공식 지원 대상으로 가정합니다.");
      notes.push("지원 범위 밖에서는 system 모드로만 보수적으로 안내합니다.");
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

  const release = await readLinuxOsRelease({ ...context, platform });
  const distroId = release?.id;
  const distroVersion = release?.versionId;
  const isUbuntu2404 =
    distroId === "ubuntu" &&
    typeof distroVersion === "string" &&
    distroVersion.startsWith("24.04");

  return {
    platform,
    arch,
    hostLabel:
      release?.prettyName ??
      (distroId ? `Linux (${distroId}${distroVersion ? ` ${distroVersion}` : ""})` : `Linux ${arch}`),
    tier: isUbuntu2404 ? "best-effort" : "best-effort",
    managedLifecycleReady: false,
    recommendedProvider: "system",
    distroId,
    distroVersion,
    notes: isUbuntu2404
      ? [
          "현재 릴리스에서는 system 도구 기반으로만 동작합니다.",
          "Ubuntu 24.04 apt managed 경로는 이후 마일스톤에서 추가됩니다."
        ]
      : [
          "이 Linux 배포판에서는 현재 system 모드만 지원합니다.",
          "관리형 Linux 경로는 Ubuntu 24.04를 기준으로 먼저 지원할 예정입니다."
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
        "Windows에서는 conan 명령을 PATH에서 감지합니다. managed 설치는 아직 지원되지 않습니다."
      );
    }

    if (tool === "cxx") {
      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: true, repair: true, remove: true },
        "Windows에서는 MinGW managed 설치를 지원하고 MSVC는 system 감지만 지원합니다."
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
          "macOS에서는 검증된 아카이브를 내려받아 vcpkg를 bootstrap합니다."
        );
      }

      return createLifecycleCapabilities(
        "archive",
        { detect: true, install: false, repair: false, remove: false },
        "공식 지원 범위(macOS 14+) 밖에서는 vcpkg managed 경로를 보장하지 않습니다."
      );
    }

    if (support.managedLifecycleReady) {
      return createLifecycleCapabilities(
        "homebrew",
        { detect: true, install: true, repair: true, remove: true },
        tool === "cxx"
          ? "macOS managed C++ 도구는 Homebrew llvm formula를 사용합니다."
          : "macOS managed 도구는 Homebrew formula를 사용합니다."
      );
    }

    return createLifecycleCapabilities(
      "homebrew",
      { detect: true, install: false, repair: false, remove: false },
      support.tier === "official"
        ? "Homebrew가 준비되면 managed 설치를 사용할 수 있습니다."
        : "공식 지원 범위(macOS 14+) 밖에서는 Homebrew managed 경로를 보장하지 않습니다."
    );
  }

  if (support.platform === "linux") {
    return createLifecycleCapabilities(
      "system",
      { detect: true, install: false, repair: false, remove: false },
      support.distroId === "ubuntu" && support.distroVersion?.startsWith("24.04")
        ? "현재 릴리스에서는 system 도구 기반으로만 동작합니다. Ubuntu 24.04 apt managed 경로는 이후 마일스톤에서 추가됩니다."
        : "이 Linux 배포판에서는 아직 managed 수명주기를 지원하지 않습니다."
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

import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";

import type { ToolId, ToolLifecycleProvider } from "@shared/contracts";

export interface LinuxReleaseInfo {
  id?: string;
  versionId?: string;
  prettyName?: string;
}

export interface LinuxHostProfile {
  key: string;
  distroId: "ubuntu";
  versionPrefix: string;
  label: string;
  supportedArchitectures: string[];
  recommendedProvider: "apt";
  toolProviders: Record<ToolId, ToolLifecycleProvider>;
}

const UBUNTU_LTS_TOOL_PROVIDERS: Record<ToolId, ToolLifecycleProvider> = {
  cmake: "apt",
  ninja: "apt",
  vcpkg: "archive",
  conan: "pipx",
  cxx: "apt"
};

export const OFFICIAL_LINUX_PROFILES: LinuxHostProfile[] = [
  {
    key: "ubuntu-22.04",
    distroId: "ubuntu",
    versionPrefix: "22.04",
    label: "Ubuntu 22.04 LTS",
    supportedArchitectures: ["x64", "arm64"],
    recommendedProvider: "apt",
    toolProviders: UBUNTU_LTS_TOOL_PROVIDERS
  },
  {
    key: "ubuntu-24.04",
    distroId: "ubuntu",
    versionPrefix: "24.04",
    label: "Ubuntu 24.04 LTS",
    supportedArchitectures: ["x64", "arm64"],
    recommendedProvider: "apt",
    toolProviders: UBUNTU_LTS_TOOL_PROVIDERS
  },
  {
    key: "ubuntu-26.04",
    distroId: "ubuntu",
    versionPrefix: "26.04",
    label: "Ubuntu 26.04 LTS",
    supportedArchitectures: ["x64", "arm64"],
    recommendedProvider: "apt",
    toolProviders: UBUNTU_LTS_TOOL_PROVIDERS
  }
];

export const OFFICIAL_LINUX_PROFILE_DOC_LABEL = "Ubuntu LTS profiles (22.04, 24.04, 26.04)";

function stripQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, "$1").trim();
}

export function formatOfficialLinuxProfileList(): string {
  return OFFICIAL_LINUX_PROFILES.map((profile) => profile.label).join(" and ");
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

export function readLinuxOsReleaseTextSync(): string | undefined {
  const envOverride = process.env.CPPX_LINUX_OS_RELEASE?.trim();
  if (envOverride) {
    return envOverride;
  }

  if (process.platform !== "linux") {
    return undefined;
  }

  try {
    return readFileSync("/etc/os-release", "utf8");
  } catch {
    return undefined;
  }
}

export async function readLinuxOsRelease(
  context: {
    platform?: string;
    linuxOsReleaseText?: string | null;
  }
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

export function resolveLinuxHostProfile(
  release: LinuxReleaseInfo | undefined,
  arch?: string | null
): LinuxHostProfile | undefined {
  const distroId = release?.id;
  const versionId = release?.versionId;
  if (!distroId || !versionId) {
    return undefined;
  }

  return OFFICIAL_LINUX_PROFILES.find(
    (profile) =>
      profile.distroId === distroId &&
      versionId.startsWith(profile.versionPrefix) &&
      (!arch || profile.supportedArchitectures.includes(arch))
  );
}

export function getLinuxManagedSupportLimitNote(): string {
  return `Managed Linux support is limited to ${OFFICIAL_LINUX_PROFILE_DOC_LABEL}.`;
}

export function getUnsupportedLinuxHostNote(): string {
  return "Unsupported Linux distributions are outside the cppx host support policy.";
}

export function getLinuxManagedHostNotes(profile: LinuxHostProfile): string[] {
  return [
    `Official Linux managed support covers ${OFFICIAL_LINUX_PROFILE_DOC_LABEL}.`,
    getLinuxManagedCoreToolNote(profile),
    getLinuxManagedCxxNote(profile),
    getLinuxManagedVcpkgNote(profile),
    `${profile.label} uses pipx-managed Conan to avoid mutating the system Python environment.`,
    "Pinned exact versions for cmake and ninja use verified archives."
  ];
}

export function getLinuxManagedCoreToolNote(profile: LinuxHostProfile): string {
  return `${profile.label} managed core tools use apt by default and verified archives for exact pinned versions.`;
}

export function getLinuxManagedCxxNote(profile: LinuxHostProfile): string {
  return `${profile.label} managed C++ installs clang or gcc via apt, depending on compiler preference. Exact compiler pinning is not yet supported.`;
}

export function getLinuxManagedVcpkgNote(profile: LinuxHostProfile): string {
  return `${profile.label} manages vcpkg through the verified archive/bootstrap path.`;
}

export function getLinuxManagedConanNote(profile: LinuxHostProfile): string {
  return `${profile.label} managed Conan uses pipx and supports exact pinned versions.`;
}

export function getLinuxAptLifecycleRequirementNote(profile: LinuxHostProfile): string {
  return `apt-get must be available before ${profile.label} managed installs can run.`;
}

export function formatLinuxManagedProfileLabel(profile: LinuxHostProfile, arch: string): string {
  return `${profile.label} (${arch})`;
}

export function getSupportedLinuxManagedProfileLabel(): string {
  return OFFICIAL_LINUX_PROFILE_DOC_LABEL;
}

export function getLinuxAptInstallRequirementNote(): string {
  return `${getSupportedLinuxManagedProfileLabel()} managed tool installs require apt-get.`;
}

export function getLinuxPipxInstallRequirementNote(): string {
  return `${getSupportedLinuxManagedProfileLabel()} managed Conan installs require pipx.`;
}

export function getLinuxConanManagedInstallSupportNote(): string {
  return `conan managed installs currently support Windows release archives, macOS Homebrew/release archives, or ${getSupportedLinuxManagedProfileLabel()} pipx paths.`;
}

export type { LinuxHostProfile as LinuxProfile };

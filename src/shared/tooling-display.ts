import type {
  HostSupportPayload,
  ToolLifecycleCapabilities,
  ToolLifecycleProvider,
  ToolLifecycleVersionSource,
  ToolOwnership,
  ToolSystemDetectionKind
} from "./contracts";

export function getToolLifecycleProviderLabel(provider: ToolLifecycleProvider): string {
  switch (provider) {
    case "archive":
      return "archive";
    case "git":
      return "git";
    case "homebrew":
      return "Homebrew";
    case "apt":
      return "apt";
    case "pipx":
      return "pipx";
    case "system":
      return "system";
    case "msvc":
      return "MSVC";
    default:
      return "unknown";
  }
}

export function getToolOwnershipLabel(ownership: ToolOwnership): string {
  switch (ownership) {
    case "cppx":
      return "cppx-owned";
    case "external":
      return "external";
    default:
      return "unknown";
  }
}

export function formatLifecycleActions(capabilities: ToolLifecycleCapabilities): string {
  const actions = [];
  if (capabilities.detect) {
    actions.push("detect");
  }
  if (capabilities.install) {
    actions.push("install");
  }
  if (capabilities.repair) {
    actions.push("repair");
  }
  if (capabilities.remove) {
    actions.push("remove");
  }
  return actions.length > 0 ? actions.join("/") : "none";
}

export function getVersionSourceLabel(versionSource: ToolLifecycleVersionSource): string {
  switch (versionSource) {
    case "cppx-verified":
      return "verified";
    case "host-provider":
      return "provider";
    case "upstream":
      return "upstream";
    case "host-provider-or-cppx-verified":
      return "provider/verified";
    case "host-provider-or-upstream":
      return "provider/upstream";
    case "system":
      return "system";
    default:
      return "unknown";
  }
}

export function getSystemDetectionKindLabel(
  systemDetectionKind: ToolSystemDetectionKind
): string {
  switch (systemDetectionKind) {
    case "path":
      return "path";
    case "path-with-provider":
      return "path+provider";
    case "instance":
      return "instance";
    case "instance-or-path":
      return "instance+path";
    case "none":
      return "n/a";
    default:
      return "unknown";
  }
}

export function formatLifecycleVersionSupport(
  capabilities: ToolLifecycleCapabilities
): string {
  if (capabilities.supportsExactPin && capabilities.supportsFloatingVersion) {
    return "exact+floating";
  }
  if (capabilities.supportsExactPin) {
    return "exact";
  }
  if (capabilities.supportsFloatingVersion) {
    return "floating";
  }
  return "fixed";
}

export function formatLifecycleSummary(capabilities: ToolLifecycleCapabilities): string {
  const parts = [
    getToolLifecycleProviderLabel(capabilities.provider),
    formatLifecycleActions(capabilities),
    formatLifecycleVersionSupport(capabilities),
    getVersionSourceLabel(capabilities.versionSource),
    getSystemDetectionKindLabel(capabilities.systemDetectionKind),
    capabilities.supportsInstanceSelection ? "instances" : undefined
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return parts.join(" / ");
}

export function formatHostSupportSummary(support: HostSupportPayload): string {
  return `${support.hostLabel} / ${support.tier} / ${getToolLifecycleProviderLabel(
    support.recommendedProvider
  )}`;
}

import type {
  HostSupportPayload,
  ToolLifecycleCapabilities,
  ToolLifecycleProvider,
  ToolOwnership
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
  const actions = ["detect"];
  if (capabilities.install) {
    actions.push("install");
  }
  if (capabilities.repair) {
    actions.push("repair");
  }
  if (capabilities.remove) {
    actions.push("remove");
  }
  return actions.join("/");
}

export function formatLifecycleSummary(capabilities: ToolLifecycleCapabilities): string {
  return `${getToolLifecycleProviderLabel(capabilities.provider)} · ${formatLifecycleActions(capabilities)}`;
}

export function formatHostSupportSummary(support: HostSupportPayload): string {
  return `${support.hostLabel} · ${support.tier} · ${getToolLifecycleProviderLabel(
    support.recommendedProvider
  )}`;
}

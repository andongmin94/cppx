import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveHostSupport,
  resolveToolLifecycleCapabilities,
  type HostSupportContext
} from "../src/main/cppx/host-support";

type ToolExpectation = {
  provider: "archive" | "homebrew" | "apt" | "pipx" | "system" | "unknown";
  detect?: boolean;
  install: boolean;
  repair: boolean;
  remove: boolean;
};

type HostMatrixExpectation = {
  name: string;
  context: HostSupportContext;
  support: {
    tier: "official" | "best-effort" | "unsupported";
    recommendedProvider: "archive" | "homebrew" | "apt" | "system" | "unknown";
    managedLifecycleReady: boolean;
  };
  tools: {
    cmake: ToolExpectation;
    ninja: ToolExpectation;
    vcpkg: ToolExpectation;
    conan: ToolExpectation;
    cxx: ToolExpectation;
  };
};

const HOST_SUPPORT_MATRIX: HostMatrixExpectation[] = [
  {
    name: "Windows x64 official host",
    context: {
      platform: "win32",
      arch: "x64"
    },
    support: {
      tier: "official",
      recommendedProvider: "archive",
      managedLifecycleReady: true
    },
    tools: {
      cmake: { provider: "archive", install: true, repair: true, remove: true },
      ninja: { provider: "archive", install: true, repair: true, remove: true },
      vcpkg: { provider: "archive", install: true, repair: true, remove: true },
      conan: { provider: "archive", install: true, repair: true, remove: true },
      cxx: { provider: "archive", install: true, repair: true, remove: true }
    }
  },
  {
    name: "macOS 14 official host",
    context: {
      platform: "darwin",
      arch: "arm64",
      macosVersion: "14.6",
      homebrewAvailable: true,
      homebrewPrefix: "/opt/homebrew"
    },
    support: {
      tier: "official",
      recommendedProvider: "homebrew",
      managedLifecycleReady: true
    },
    tools: {
      cmake: { provider: "homebrew", install: true, repair: true, remove: true },
      ninja: { provider: "homebrew", install: true, repair: true, remove: true },
      vcpkg: { provider: "archive", install: true, repair: true, remove: true },
      conan: { provider: "homebrew", install: true, repair: true, remove: true },
      cxx: { provider: "homebrew", install: true, repair: true, remove: true }
    }
  },
  {
    name: "Ubuntu 22.04 official host",
    context: {
      platform: "linux",
      linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n',
      aptAvailable: true
    },
    support: {
      tier: "official",
      recommendedProvider: "apt",
      managedLifecycleReady: true
    },
    tools: {
      cmake: { provider: "apt", install: true, repair: true, remove: true },
      ninja: { provider: "apt", install: true, repair: true, remove: true },
      vcpkg: { provider: "archive", install: true, repair: true, remove: true },
      conan: { provider: "pipx", install: true, repair: true, remove: true },
      cxx: { provider: "apt", install: true, repair: true, remove: true }
    }
  },
  {
    name: "Ubuntu 24.04 official host",
    context: {
      platform: "linux",
      linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
      aptAvailable: true
    },
    support: {
      tier: "official",
      recommendedProvider: "apt",
      managedLifecycleReady: true
    },
    tools: {
      cmake: { provider: "apt", install: true, repair: true, remove: true },
      ninja: { provider: "apt", install: true, repair: true, remove: true },
      vcpkg: { provider: "archive", install: true, repair: true, remove: true },
      conan: { provider: "pipx", install: true, repair: true, remove: true },
      cxx: { provider: "apt", install: true, repair: true, remove: true }
    }
  },
  {
    name: "Ubuntu 26.04 official host",
    context: {
      platform: "linux",
      linuxOsReleaseText: 'ID=ubuntu\nVERSION_ID="26.04"\nPRETTY_NAME="Ubuntu 26.04 LTS"\n',
      aptAvailable: true
    },
    support: {
      tier: "official",
      recommendedProvider: "apt",
      managedLifecycleReady: true
    },
    tools: {
      cmake: { provider: "apt", install: true, repair: true, remove: true },
      ninja: { provider: "apt", install: true, repair: true, remove: true },
      vcpkg: { provider: "archive", install: true, repair: true, remove: true },
      conan: { provider: "pipx", install: true, repair: true, remove: true },
      cxx: { provider: "apt", install: true, repair: true, remove: true }
    }
  },
  {
    name: "Unsupported Linux host",
    context: {
      platform: "linux",
      linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
    },
    support: {
      tier: "unsupported",
      recommendedProvider: "unknown",
      managedLifecycleReady: false
    },
    tools: {
      cmake: { provider: "unknown", detect: false, install: false, repair: false, remove: false },
      ninja: { provider: "unknown", detect: false, install: false, repair: false, remove: false },
      vcpkg: { provider: "unknown", detect: false, install: false, repair: false, remove: false },
      conan: { provider: "unknown", detect: false, install: false, repair: false, remove: false },
      cxx: { provider: "unknown", detect: false, install: false, repair: false, remove: false }
    }
  }
];

test("host support matrix stays aligned across official, best-effort, and unsupported hosts", async () => {
  for (const host of HOST_SUPPORT_MATRIX) {
    const support = await resolveHostSupport(host.context);
    assert.equal(support.tier, host.support.tier, `${host.name} tier`);
    assert.equal(
      support.recommendedProvider,
      host.support.recommendedProvider,
      `${host.name} provider`
    );
    assert.equal(
      support.managedLifecycleReady,
      host.support.managedLifecycleReady,
      `${host.name} managedLifecycleReady`
    );

    for (const tool of ["cmake", "ninja", "vcpkg", "conan", "cxx"] as const) {
      const capabilities = await resolveToolLifecycleCapabilities(tool, host.context);
      const expected = host.tools[tool];
      assert.equal(capabilities.detect, expected.detect ?? true, `${host.name} ${tool} detect`);
      assert.equal(capabilities.provider, expected.provider, `${host.name} ${tool} provider`);
      assert.equal(capabilities.install, expected.install, `${host.name} ${tool} install`);
      assert.equal(capabilities.repair, expected.repair, `${host.name} ${tool} repair`);
      assert.equal(capabilities.remove, expected.remove, `${host.name} ${tool} remove`);
    }
  }
});

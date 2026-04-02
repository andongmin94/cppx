import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  resolveHostSupport,
  resolveToolLifecycleCapabilities,
  type HostSupportContext
} from "../src/main/cppx/host-support";
import { getSupportedLinuxManagedProfileLabel } from "../src/main/cppx/linux-profiles";

type ToolExpectation = {
  provider: "archive" | "homebrew" | "apt" | "pipx" | "system";
  install: boolean;
  repair: boolean;
  remove: boolean;
};

type HostMatrixExpectation = {
  name: string;
  context: HostSupportContext;
  support: {
    tier: "official" | "best-effort";
    recommendedProvider: "archive" | "homebrew" | "apt" | "system";
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
    name: "Unsupported Linux best-effort host",
    context: {
      platform: "linux",
      linuxOsReleaseText: 'ID=fedora\nVERSION_ID="41"\nPRETTY_NAME="Fedora Linux 41"\n'
    },
    support: {
      tier: "best-effort",
      recommendedProvider: "system",
      managedLifecycleReady: false
    },
    tools: {
      cmake: { provider: "system", install: false, repair: false, remove: false },
      ninja: { provider: "system", install: false, repair: false, remove: false },
      vcpkg: { provider: "archive", install: false, repair: false, remove: false },
      conan: { provider: "system", install: false, repair: false, remove: false },
      cxx: { provider: "system", install: false, repair: false, remove: false }
    }
  }
];

test("host support matrix stays aligned across official and best-effort hosts", async () => {
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
      assert.equal(capabilities.detect, true, `${host.name} ${tool} detect`);
      assert.equal(capabilities.provider, expected.provider, `${host.name} ${tool} provider`);
      assert.equal(capabilities.install, expected.install, `${host.name} ${tool} install`);
      assert.equal(capabilities.repair, expected.repair, `${host.name} ${tool} repair`);
      assert.equal(capabilities.remove, expected.remove, `${host.name} ${tool} remove`);
    }
  }
});

test("support docs keep the same official-host matrix wording", async () => {
  const installGuide = await readRepoText("docs", "guide", "install.md");
  const cliGuide = await readRepoText("docs", "guide", "cli.md");
  const configGuide = await readRepoText("docs", "guide", "config.md");
  const guiGuide = await readRepoText("docs", "guide", "gui.md");
  const indexGuide = await readRepoText("docs", "guide", "index.md");
  const migrationGuide = await readRepoText("docs", "guide", "migration.md");
  const readme = await readRepoText("README.md");
  const linuxProfileLabel = getSupportedLinuxManagedProfileLabel().replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  assert.match(
    installGuide,
    /\| Windows x64 \| `none` \| `managed` \| `managed` \| `managed` \| `managed` \(MinGW\) or `system` \(MSVC\) \|/
  );
  assert.match(
    installGuide,
    /\| macOS 14\+ \| `none` \| `managed` \| `managed` \| `managed` \| `managed` \(Homebrew LLVM\) or `system` \(Apple Clang \/ `clang\+\+`\) \|/
  );
  assert.match(
    installGuide,
    new RegExp(
      `\\| ${linuxProfileLabel} \\| \`none\` \\| \`managed\` \\| \`managed\` \\| \`managed\` \\(\`pipx\`\\) \\| \`managed\` \\(\`Clang\` or \`GCC\` via \`apt\`\\) or \`system\` \\(PATH \`clang\\+\\+\` / \`g\\+\\+\`\\) \\|`
    )
  );
  assert.match(
    installGuide,
    /\| Other Linux \| `none` \| `system` \| `system` \| `system` \| `system` \|/
  );

  assert.match(
    cliGuide,
    /Windows: verified archive installs for `cmake`, `ninja`, `vcpkg`, `conan`, and the managed MinGW toolchain, plus system MSVC detection/
  );
  assert.match(
    cliGuide,
    /macOS 14\+: Homebrew for core tools and archive\/bootstrap for `vcpkg`/
  );
  assert.match(
    cliGuide,
    new RegExp(
      `${linuxProfileLabel}: \`apt\` for \`cmake\`, \`ninja\`, and managed \`clang\` / \`gcc\`, archive/bootstrap for \`vcpkg\`, and \`pipx\` for \`conan\``
    )
  );
  assert.match(cliGuide, /Other Linux: system detection only/);
  assert.match(
    cliGuide,
    new RegExp(
      `macOS 14\\+ and ${linuxProfileLabel} also allow \`tools\\.cxx\\.mode = "system"\` for the compiler already visible on \`PATH\`\\.`
    )
  );
  assert.match(
    cliGuide,
    new RegExp(
      `${linuxProfileLabel} managed \`cxx\` uses \`clang\` or \`gcc\` from \`apt\`, depending on \`preferred_family\`\\.`
    )
  );
  assert.match(
    cliGuide,
    /Linux `system` compiler detection can use `clang\+\+` or `g\+\+` from `PATH`\./
  );
  assert.match(
    cliGuide,
    /If `--backend` is omitted, official hosts now start from `none` by default\./
  );

  assert.match(
    installGuide,
    /Pinned exact versions are supported for official-host managed non-compiler tools/
  );
  assert.match(
    installGuide,
    /macOS 14\+: exact pins for `cmake`, `ninja`, and `conan` use verified archives\/releases/
  );
  assert.match(
    installGuide,
    new RegExp(
      `${linuxProfileLabel}: exact pins for \`cmake\` and \`ninja\` use verified archives, and \`conan\` uses \`pipx\``
    )
  );
  assert.match(
    cliGuide,
    /official-host managed non-compiler tools accept exact pins/
  );
  assert.match(
    cliGuide,
    new RegExp(
      `${linuxProfileLabel} exact pins for \`cmake\` and \`ninja\` use verified archives, and exact \`conan\` pins use \`pipx\``
    )
  );

  assert.match(
    guiGuide,
    /`cmake`, `ninja`, `vcpkg`, `conan`, `cxx` 각각에 대해 `mode`와 `version`을 편집합니다\./
  );
  assert.match(
    guiGuide,
    /`cxx`는 `preferred_family`를 함께 저장하고, Windows에서 `MSVC`를 선택한 경우에만 `msvc_installation_path`를 편집합니다\./
  );
  assert.match(
    guiGuide,
    new RegExp(
      `${linuxProfileLabel}에서는 \`preferred_family\`로 \`clang\` 또는 \`gcc\`를 고를 수 있고, \`cxx\`를 \`managed\` 또는 \`system\`으로 둘 다 설정할 수 있습니다\\.`
    )
  );
  assert.match(
    guiGuide,
    /툴체인 상태.*CMake, Ninja, vcpkg, conan, C\+\+ 컴파일러의 준비 상태와 해석된 메타데이터를 볼 수 있습니다\./
  );

  assert.match(configGuide, /Windows x64: backend `none`, compiler `mingw` by default/);
  assert.match(
    configGuide,
    /macOS: `clang` with `managed` \(Homebrew LLVM\) or `system` \(Apple Clang \/ `clang\+\+`\)/
  );
  assert.match(
    configGuide,
    new RegExp(
      `${linuxProfileLabel}: \`clang\` or \`gcc\` with \`managed\` \\(\`apt\`\\), or \`system\` \\(\`clang\\+\\+\` / \`g\\+\\+\` on PATH\\)`
    )
  );
  assert.match(configGuide, /`preferred_family` \| `clang`, `gcc`, `mingw`, or `msvc`/);
  assert.match(
    configGuide,
    new RegExp(
      `${linuxProfileLabel} can choose \`preferred_family = "clang"\` or \`preferred_family = "gcc"\` for managed \`cxx\``
    )
  );

  assert.match(indexGuide, /\| Default backend \| `none` \| `none` \| `none` \|/);
  assert.match(
    indexGuide,
    new RegExp(
      `\\| Default tool mode \\| managed by default, with \`cxx=system\` for MSVC \\| managed by default on official macOS hosts, with optional \`cxx=system\` \\| managed on ${linuxProfileLabel} with optional \`cxx=system\`; other Linux stays system \\|`
    )
  );
  assert.match(
    indexGuide,
    new RegExp(`${linuxProfileLabel} use \`apt\`/\`archive\`/\`pipx\``)
  );
  assert.match(indexGuide, /managed `clang`\/`gcc`; other Linux stays system-only/);

  assert.match(migrationGuide, /Windows \/ macOS \/ Linux 기본값: `none`/);
  assert.match(
    migrationGuide,
    new RegExp(`${linuxProfileLabel}에서 managed \`clang\`과 managed \`gcc\` 중 어떤 family를 쓸지`)
  );
  assert.match(
    migrationGuide,
    new RegExp(`${linuxProfileLabel}에서 PATH \`clang\\+\\+\` / \`g\\+\\+\`를 system 모드로 그대로 쓸지`)
  );

  assert.match(
    readme,
    /exact pinned versions for official-host managed non-compiler tools/
  );
});

async function readRepoText(...segments: string[]): Promise<string> {
  const filePath = path.resolve(import.meta.dirname, "..", "..", ...segments);
  return fs.readFile(filePath, "utf-8");
}

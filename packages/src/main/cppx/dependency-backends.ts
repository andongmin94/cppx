import path from "node:path";
import { runSpawn } from "./command-runner";
import { CppxError } from "./errors";
import type { CppxLogger } from "./logger";
import type { NormalizedProjectConfig, Toolchain } from "./types";
import { createGeneratedTextBanner, VSCODE_GENERATED_ROOT } from "./workspace-layout";

type GeneratedFile =
  | { relativePath: string; kind: "json"; content: Record<string, unknown> }
  | { relativePath: string; kind: "text"; content: string };

export interface BackendVSCodeTask {
  label: string;
  type: "shell";
  command: string;
  options?: { cwd: string };
  dependsOn?: string | string[];
  group?: "build" | "test";
}

export interface BackendVSCodeIntegration {
  configureDependsOn: string[];
  tasks: BackendVSCodeTask[];
}

export interface BackendPresetIntegration {
  toolchainFile?: string;
  cacheVariables: Record<string, string>;
  environment: Record<string, string>;
}

export interface DependencyBackendAdapter {
  readonly id: NormalizedProjectConfig["dependencyBackend"];

  addDependency(config: NormalizedProjectConfig, dependency: string): void;
  createArtifacts(config: NormalizedProjectConfig, toolchain: Toolchain): GeneratedFile[];
  getStaleGeneratedFiles(): string[];
  getPresetIntegration(
    config: NormalizedProjectConfig,
    toolchain: Toolchain,
    preset: { targetTriplet?: string }
  ): BackendPresetIntegration;
  getBuildEnv(
    config: NormalizedProjectConfig,
    toolchain: Toolchain,
    generatedRoot: string
  ): Record<string, string>;
  getVSCodeIntegration(config: NormalizedProjectConfig): BackendVSCodeIntegration;
  prepareForConfigure(
    config: NormalizedProjectConfig,
    toolchain: Toolchain,
    generatedRoot: string,
    logger: CppxLogger
  ): Promise<void>;
}

function createVcpkgManifest(config: NormalizedProjectConfig): Record<string, unknown> {
  return {
    name: config.targetName.toLowerCase(),
    version: config.package.version,
    dependencies: config.dependencies
  };
}

function createConanFile(config: NormalizedProjectConfig): string {
  const requires = config.dependencies.length > 0 ? `${config.dependencies.join("\n")}\n` : "";

  return `${createGeneratedTextBanner()}[requires]
${requires}[generators]
CMakeToolchain
CMakeDeps

[layout]
cmake_layout
`;
}

const vcpkgBackend: DependencyBackendAdapter = {
  id: "vcpkg",

  addDependency(config, dependency) {
    if (!config.dependencies.includes(dependency)) {
      config.dependencies.push(dependency);
    }
  },

  createArtifacts(config) {
    return [{ relativePath: "vcpkg.json", kind: "json", content: createVcpkgManifest(config) }];
  },

  getStaleGeneratedFiles() {
    return ["conanfile.txt", "conan_toolchain.cmake", "CMakeUserPresets.json"];
  },

  getPresetIntegration(config, toolchain, preset) {
    if (!toolchain.vcpkg) {
      throw new CppxError("vcpkg backend를 사용하려면 vcpkg toolchain이 필요합니다.");
    }

    const vcpkgRoot = path.dirname(toolchain.vcpkg);
    return {
      toolchainFile: path.join(vcpkgRoot, "scripts", "buildsystems", "vcpkg.cmake"),
      cacheVariables: {
        VCPKG_TARGET_TRIPLET: preset.targetTriplet ?? config.targetTriplet
      },
      environment: {
        VCPKG_ROOT: vcpkgRoot,
        VCPKG_MANIFEST_DIR: "${sourceDir}"
      }
    };
  },

  getBuildEnv(_config, toolchain, generatedRoot) {
    if (!toolchain.vcpkg) {
      throw new CppxError("vcpkg backend를 사용하려면 vcpkg toolchain이 필요합니다.");
    }

    return {
      VCPKG_ROOT: path.dirname(toolchain.vcpkg),
      VCPKG_MANIFEST_DIR: generatedRoot
    };
  },

  getVSCodeIntegration() {
    return {
      configureDependsOn: [],
      tasks: []
    };
  },

  async prepareForConfigure() {
    return;
  }
};

const conanBackend: DependencyBackendAdapter = {
  id: "conan",

  addDependency(config, dependency) {
    if (!config.dependencies.includes(dependency)) {
      config.dependencies.push(dependency);
    }
  },

  createArtifacts(config) {
    return [{ relativePath: "conanfile.txt", kind: "text", content: createConanFile(config) }];
  },

  getStaleGeneratedFiles() {
    return ["vcpkg.json"];
  },

  getPresetIntegration() {
    return {
      toolchainFile: "${sourceDir}/conan_toolchain.cmake",
      cacheVariables: {},
      environment: {}
    };
  },

  getBuildEnv() {
    return {};
  },

  getVSCodeIntegration() {
    return {
      configureDependsOn: ["cppx: deps conan"],
      tasks: [
        {
          label: "cppx: deps conan",
          type: "shell",
          command: "conan install . --output-folder . --build missing",
          options: { cwd: VSCODE_GENERATED_ROOT },
          group: "build"
        }
      ]
    };
  },

  async prepareForConfigure(_config, _toolchain, generatedRoot, logger) {
    await runSpawn(
      {
        action: "build",
        command: "conan",
        args: ["install", ".", "--output-folder", ".", "--build", "missing"],
        cwd: generatedRoot
      },
      logger
    );
  }
};

const noneBackend: DependencyBackendAdapter = {
  id: "none",

  addDependency(_config, _dependency) {
    throw new CppxError(
      "dependency_backend = \"none\" 에서는 cppx add를 사용할 수 없습니다.",
      "직접 CMake 또는 외부 도구로 의존성을 관리하세요."
    );
  },

  createArtifacts() {
    return [];
  },

  getStaleGeneratedFiles() {
    return ["vcpkg.json", "conanfile.txt", "conan_toolchain.cmake", "CMakeUserPresets.json"];
  },

  getPresetIntegration() {
    return {
      cacheVariables: {},
      environment: {}
    };
  },

  getBuildEnv() {
    return {};
  },

  getVSCodeIntegration() {
    return {
      configureDependsOn: [],
      tasks: []
    };
  },

  async prepareForConfigure() {
    return;
  }
};

export function getDependencyBackendAdapter(
  backendId: NormalizedProjectConfig["dependencyBackend"]
): DependencyBackendAdapter {
  switch (backendId) {
    case "vcpkg":
      return vcpkgBackend;
    case "conan":
      return conanBackend;
    case "none":
      return noneBackend;
    default: {
      const neverBackend: never = backendId;
      throw new CppxError(`지원하지 않는 dependency backend: ${String(neverBackend)}`);
    }
  }
}

export function resolveDependencyBackend(
  config: NormalizedProjectConfig
): DependencyBackendAdapter {
  return getDependencyBackendAdapter(config.dependencyBackend);
}

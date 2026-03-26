import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  CompilerPreference,
  DependencyBackend,
  HostSupportPayload,
  ProjectToolPoliciesPayload
} from "@shared/contracts";
import {
  formatHostSupportSummary,
  formatLifecycleSummary,
  getToolOwnershipLabel
} from "@shared/tooling-display";
import { CPPX_CONFIG_PATH, parseConfigToml } from "./config";
import { pathExists } from "./fs-utils";
import { resolveHostSupport } from "./host-support";
import { getResolvedToolSnapshot, type ToolResolutionSnapshot } from "./installers";
import { getHostAdapter } from "./platform";
import {
  GENERATED_NOTICE_FILENAME,
  LEGACY_GENERATED_ROOT,
  LEGACY_ROOT_GENERATED_FILES,
  LEGACY_USER_ROOT_GENERATED_FILES,
  getWorkspaceGeneratedRoot
} from "./workspace-layout";

const hostAdapter = getHostAdapter();

export type DoctorSeverity = "ok" | "warning" | "blocking";

export interface DoctorCheck {
  key: string;
  label: string;
  severity: DoctorSeverity;
  summary: string;
  details?: string;
}

export interface DoctorReport {
  workspace: string;
  host: {
    platform: NodeJS.Platform;
    arch: string;
    defaultBackend: DependencyBackend;
    compilerFamily: CompilerPreference;
  };
  support: HostSupportPayload;
  activeBackend: DependencyBackend;
  checks: DoctorCheck[];
  blockerCount: number;
  warningCount: number;
  nextSteps: string[];
}

interface WorkspaceConfigSummary {
  exists: boolean;
  readable: boolean;
  schemaVersion?: number;
  dependencyBackend: DependencyBackend;
  compilerFamily: CompilerPreference;
  toolPolicies?: ProjectToolPoliciesPayload;
  targetName?: string;
  legacyConfig: boolean;
  error?: string;
}

function mergeToolPolicies(
  base: ProjectToolPoliciesPayload | undefined,
  next: ProjectToolPoliciesPayload | undefined
): ProjectToolPoliciesPayload | undefined {
  if (!base && !next) {
    return undefined;
  }

  return {
    cmake: { ...base?.cmake, ...next?.cmake },
    ninja: { ...base?.ninja, ...next?.ninja },
    vcpkg: { ...base?.vcpkg, ...next?.vcpkg },
    conan: { ...base?.conan, ...next?.conan },
    cxx: { ...base?.cxx, ...next?.cxx }
  };
}

function quoteForCommand(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function addNextStep(target: Set<string>, value: string): void {
  if (value.trim().length > 0) {
    target.add(value);
  }
}

function joinDetails(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(", ");
}

async function readWorkspaceConfigSummary(workspace: string): Promise<WorkspaceConfigSummary> {
  const configPath = path.join(workspace, CPPX_CONFIG_PATH);
  const legacyConfigPath = path.join(workspace, ".cppx", "project.json");
  const configExists = await pathExists(configPath);
  const legacyConfig = await pathExists(legacyConfigPath);

  if (!configExists) {
    return {
      exists: false,
      readable: false,
      dependencyBackend: hostAdapter.getDefaultDependencyBackend(),
      compilerFamily: hostAdapter.compilerFamily,
      legacyConfig
    };
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = parseConfigToml(content, path.basename(workspace), hostAdapter.compilerFamily);
    return {
      exists: true,
      readable: true,
      schemaVersion: parsed.schemaVersion,
      dependencyBackend: parsed.dependencyBackend,
      compilerFamily:
        parsed.tools.cxx.preferredFamily ??
        parsed.compiler.preferredFamily ??
        hostAdapter.compilerFamily,
      toolPolicies: parsed.tools,
      targetName: parsed.targetName,
      legacyConfig
    };
  } catch (error) {
    return {
      exists: true,
      readable: false,
      dependencyBackend: hostAdapter.getDefaultDependencyBackend(),
      compilerFamily: hostAdapter.compilerFamily,
      legacyConfig,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getLegacyGeneratedPaths(workspace: string): Promise<string[]> {
  const legacyPaths = [
    ...LEGACY_ROOT_GENERATED_FILES.map((entry) => path.join(workspace, entry)),
    ...LEGACY_USER_ROOT_GENERATED_FILES.map((entry) => path.join(workspace, ".cppx", entry)),
    path.join(workspace, LEGACY_GENERATED_ROOT)
  ];

  const found: string[] = [];
  for (const candidate of legacyPaths) {
    if (await pathExists(candidate)) {
      found.push(candidate);
    }
  }

  return found;
}

function getSystemInstallHint(): string {
  if (process.platform === "darwin") {
    return "system 모드를 쓸 때는 `cmake`, `ninja`, `clang++`, 필요하면 `conan`까지 PATH에 보여야 합니다. 예: `brew install cmake ninja llvm conan`";
  }

  if (process.platform === "linux") {
    return "system 모드를 쓸 때는 `cmake`, `ninja`, `clang++` 또는 `g++`, 필요하면 `conan`까지 PATH에 보여야 합니다. 예: `sudo apt-get install cmake ninja-build build-essential`";
  }

  return "`npm run cppx -- install-tools`로 관리형 도구를 준비하거나 system 모드 도구 경로를 확인하세요.";
}

function collectMissingToolModes(snapshot: ToolResolutionSnapshot): Array<"managed" | "system"> {
  return [snapshot.cmake, snapshot.ninja, snapshot.vcpkg, snapshot.conan, snapshot.cxx]
    .filter((detail) => !detail.ready)
    .map((detail) => detail.mode)
    .filter((mode): mode is "managed" | "system" => mode === "managed" || mode === "system");
}

export async function runDoctor(
  workspaceRaw: string,
  options: {
    dependencyBackend?: DependencyBackend;
    toolPolicies?: ProjectToolPoliciesPayload;
  } = {}
): Promise<DoctorReport> {
  const workspace = path.resolve(workspaceRaw);
  const configSummary = await readWorkspaceConfigSummary(workspace);
  const activeBackend = options.dependencyBackend ?? configSummary.dependencyBackend;
  const activeToolPolicies = mergeToolPolicies(configSummary.toolPolicies, options.toolPolicies);
  const [toolSnapshot, hostSupport] = await Promise.all([
    getResolvedToolSnapshot(activeToolPolicies, activeBackend),
    resolveHostSupport()
  ]);

  const checks: DoctorCheck[] = [];
  const nextSteps = new Set<string>();

  checks.push({
    key: "host-support",
    label: "host",
    severity: hostSupport.managedLifecycleReady ? "ok" : "warning",
    summary: formatHostSupportSummary(hostSupport),
    details: hostSupport.notes.join(" ")
  });

  if (!configSummary.exists) {
    checks.push({
      key: "config",
      label: "config",
      severity: "warning",
      summary: ".cppx/config.toml이 없습니다. 아직 cppx 프로젝트로 초기화되지 않았을 수 있습니다."
    });
    addNextStep(
      nextSteps,
      `npm run cppx -- init ${quoteForCommand(workspace)} --name ${path.basename(workspace)}`
    );
  } else if (!configSummary.readable) {
    checks.push({
      key: "config",
      label: "config",
      severity: "blocking",
      summary: ".cppx/config.toml을 읽지 못했습니다.",
      details: configSummary.error
    });
  } else {
    const schemaState =
      (configSummary.schemaVersion ?? 0) < 3
        ? `schema v${configSummary.schemaVersion}을 읽었습니다. 다시 저장하면 v3로 올라갑니다.`
        : `schema v${configSummary.schemaVersion} 설정을 읽었습니다.`;

    checks.push({
      key: "config",
      label: "config",
      severity: (configSummary.schemaVersion ?? 0) < 3 ? "warning" : "ok",
      summary: `${schemaState} backend=${configSummary.dependencyBackend}, target=${configSummary.targetName ?? "unknown"}`
    });
  }

  if (configSummary.legacyConfig) {
    checks.push({
      key: "legacy-config",
      label: "legacy",
      severity: "warning",
      summary: "과거 .cppx/project.json이 남아 있습니다. 현재 기준 설정은 .cppx/config.toml입니다."
    });
  }

  const generatedRoot = getWorkspaceGeneratedRoot(workspace);
  const generatedRootExists = await pathExists(generatedRoot);
  const generatedNoticeExists = await pathExists(path.join(generatedRoot, GENERATED_NOTICE_FILENAME));
  const legacyGeneratedPaths = await getLegacyGeneratedPaths(workspace);

  if (!generatedRootExists) {
    checks.push({
      key: "generated-root",
      label: "generated root",
      severity: configSummary.exists ? "warning" : "ok",
      summary: configSummary.exists
        ? `생성물 루트 ${generatedRoot}가 아직 없습니다. init/build/run/test/pack 중에 생성될 수 있습니다.`
        : "아직 생성물 루트가 없습니다. 프로젝트 초기화 전 상태로 보입니다."
    });
  } else if (!generatedNoticeExists) {
    checks.push({
      key: "generated-root",
      label: "generated root",
      severity: "warning",
      summary: `${generatedRoot}는 있지만 생성물 안내 파일이 없습니다. 수동 편집 흔적인지 확인하세요.`
    });
  } else {
    checks.push({
      key: "generated-root",
      label: "generated root",
      severity: "ok",
      summary: `${generatedRoot}가 준비되어 있습니다.`
    });
  }

  if (legacyGeneratedPaths.length > 0) {
    checks.push({
      key: "legacy-generated",
      label: "legacy generated",
      severity: "warning",
      summary: "과거 생성물이 남아 있습니다.",
      details: legacyGeneratedPaths.join(", ")
    });
  }

  const requiredTools: Array<{
    key: keyof ToolResolutionSnapshot;
    label: string;
    detail: ToolResolutionSnapshot[keyof ToolResolutionSnapshot];
  }> = [
    { key: "cmake", label: "cmake", detail: toolSnapshot.cmake },
    { key: "ninja", label: "ninja", detail: toolSnapshot.ninja },
    { key: "cxx", label: "cxx", detail: toolSnapshot.cxx }
  ];

  for (const tool of requiredTools) {
    if (!tool.detail.ready) {
      checks.push({
        key: tool.key,
        label: tool.label,
        severity: "blocking",
        summary: `${tool.label}를 찾지 못했습니다.`,
        details: joinDetails([
          tool.detail.mode ? `mode=${tool.detail.mode}` : undefined,
          `active backend=${activeBackend}`,
          tool.detail.capabilities
            ? `lifecycle=${formatLifecycleSummary(tool.detail.capabilities)}`
            : undefined,
          tool.detail.capabilities?.note
        ])
      });
      continue;
    }

    checks.push({
      key: tool.key,
      label: tool.label,
      severity: "ok",
      summary: `${tool.label} 준비됨 (${joinDetails([
        tool.detail.mode,
        tool.detail.provider,
        tool.detail.ownership ? getToolOwnershipLabel(tool.detail.ownership) : undefined,
        tool.detail.resolvedVersion,
        tool.detail.sourceKind,
        tool.detail.executable
      ])})`
    });
  }

  if (toolSnapshot.cmake.ready && toolSnapshot.cmake.executable) {
    const ctestPath = path.join(
      path.dirname(toolSnapshot.cmake.executable),
      hostAdapter.getCtestExecutableName()
    );
    const cpackPath = path.join(
      path.dirname(toolSnapshot.cmake.executable),
      hostAdapter.getCpackExecutableName()
    );

    const ctestReady = await pathExists(ctestPath);
    const cpackReady = await pathExists(cpackPath);

    checks.push({
      key: "ctest",
      label: "ctest",
      severity: ctestReady ? "ok" : "warning",
      summary: ctestReady
        ? `${hostAdapter.getCtestExecutableName()} 준비됨 (${ctestPath})`
        : `${hostAdapter.getCtestExecutableName()}를 cmake 옆에서 찾지 못했습니다.`,
      details: ctestReady ? undefined : ctestPath
    });
    checks.push({
      key: "cpack",
      label: "cpack",
      severity: cpackReady ? "ok" : "warning",
      summary: cpackReady
        ? `${hostAdapter.getCpackExecutableName()} 준비됨 (${cpackPath})`
        : `${hostAdapter.getCpackExecutableName()}를 cmake 옆에서 찾지 못했습니다.`,
      details: cpackReady ? undefined : cpackPath
    });
  }

  if (activeBackend === "vcpkg") {
    if (!toolSnapshot.vcpkg.ready) {
      checks.push({
        key: "backend-vcpkg",
        label: "backend",
        severity: "blocking",
        summary: "active backend가 vcpkg인데 vcpkg 실행 파일을 찾지 못했습니다.",
        details: joinDetails([
          toolSnapshot.vcpkg.mode ? `mode=${toolSnapshot.vcpkg.mode}` : undefined,
          toolSnapshot.vcpkg.capabilities
            ? `lifecycle=${formatLifecycleSummary(toolSnapshot.vcpkg.capabilities)}`
            : undefined,
          toolSnapshot.vcpkg.capabilities?.note
        ])
      });
    } else {
      checks.push({
        key: "backend-vcpkg",
        label: "backend",
        severity: "ok",
        summary: `active backend=vcpkg 준비됨 (${toolSnapshot.vcpkg.executable})`
      });
    }
  } else if (activeBackend === "conan") {
    if (!toolSnapshot.conan.ready) {
      checks.push({
        key: "backend-conan",
        label: "backend",
        severity: "blocking",
        summary: "active backend가 conan인데 conan 실행 파일을 찾지 못했습니다.",
        details: joinDetails([
          toolSnapshot.conan.mode ? `mode=${toolSnapshot.conan.mode}` : undefined,
          toolSnapshot.conan.capabilities
            ? `lifecycle=${formatLifecycleSummary(toolSnapshot.conan.capabilities)}`
            : undefined,
          toolSnapshot.conan.capabilities?.note
        ])
      });
      addNextStep(nextSteps, "backend가 conan이면 `install-tools`로 conan을 준비하거나 PATH에 conan 2.x를 보여야 합니다.");
    } else {
      checks.push({
        key: "backend-conan",
        label: "backend",
        severity: "ok",
        summary: `active backend=conan 준비됨 (${toolSnapshot.conan.executable})`
      });
    }
  } else {
    checks.push({
      key: "backend-none",
      label: "backend",
      severity: "ok",
      summary: "active backend=none"
    });
    checks.push({
      key: "add-unavailable",
      label: "add",
      severity: "warning",
      summary: 'dependency_backend = "none"이라서 cppx add를 사용할 수 없습니다.',
      details: "의존성이 필요하면 init 때 --backend conan 또는 --backend vcpkg를 선택하거나 .cppx/config.toml을 수정하세요."
    });
    addNextStep(
      nextSteps,
      "의존성이 필요하면 `dependency_backend`를 `conan` 또는 `vcpkg`로 바꾸고 `doctor`를 다시 실행하세요."
    );
  }

  const missingToolModes = collectMissingToolModes(toolSnapshot);
  const missingToolDetails = [
    toolSnapshot.cmake,
    toolSnapshot.ninja,
    toolSnapshot.vcpkg,
    toolSnapshot.conan,
    toolSnapshot.cxx
  ].filter((detail) => !detail.ready);

  if (missingToolModes.length > 0) {
    if (missingToolDetails.some((detail) => detail.capabilities?.install)) {
      addNextStep(nextSteps, "npm run cppx -- install-tools");
    }

    if (missingToolModes.includes("system")) {
      addNextStep(nextSteps, getSystemInstallHint());
    }

    if (
      missingToolDetails.some(
        (detail) => detail.mode === "managed" && detail.capabilities && !detail.capabilities.install
      )
    ) {
      addNextStep(
        nextSteps,
        "이 host에서는 아직 일부 managed 수명주기를 바로 쓸 수 없습니다. system 모드를 쓰거나 공식 지원 provider가 준비된 host에서 다시 시도하세요."
      );
    }
  }

  const blockerCount = checks.filter((check) => check.severity === "blocking").length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;

  if (blockerCount === 0 && configSummary.exists && configSummary.readable) {
    addNextStep(nextSteps, `npm run cppx -- build ${quoteForCommand(workspace)}`);
    addNextStep(nextSteps, `npm run cppx -- run ${quoteForCommand(workspace)}`);
  }

  return {
    workspace,
    host: {
      platform: process.platform,
      arch: process.arch,
      defaultBackend: hostAdapter.getDefaultDependencyBackend(),
      compilerFamily: hostAdapter.compilerFamily
    },
    support: hostSupport,
    activeBackend,
    checks,
    blockerCount,
    warningCount,
    nextSteps: [...nextSteps]
  };
}

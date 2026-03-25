import { promises as fs } from "node:fs";
import path from "node:path";

import type { DependencyBackend, ProjectToolPoliciesPayload } from "@shared/contracts";
import { CPPX_CONFIG_PATH, parseConfigToml } from "./config";
import { pathExists } from "./fs-utils";
import {
  findExecutableOnPath,
  getResolvedToolSnapshot,
  type ToolResolutionSnapshot
} from "./installers";
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
    compilerFamily: "mingw" | "msvc";
  };
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
  compilerFamily: "mingw" | "msvc";
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
    return "시스템 패키지 매니저로 `cmake`, `ninja`, `clang++` 또는 `g++`를 설치하세요. 예: `brew install cmake ninja`";
  }

  if (process.platform === "linux") {
    return "시스템 패키지 매니저로 `cmake`, `ninja`, `clang++` 또는 `g++`를 설치하세요. 예: `sudo apt-get install cmake ninja-build build-essential`";
  }

  return "`npm run cppx -- install-tools`를 실행해 관리형 도구를 준비하거나, system 모드 도구 경로를 확인하세요.";
}

function collectMissingToolModes(snapshot: ToolResolutionSnapshot): Array<"managed" | "system"> {
  return [snapshot.cmake, snapshot.ninja, snapshot.vcpkg, snapshot.cxx]
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
  const toolSnapshot = await getResolvedToolSnapshot(activeToolPolicies, activeBackend);
  const checks: DoctorCheck[] = [];
  const nextSteps = new Set<string>();

  if (!configSummary.exists) {
    checks.push({
      key: "config",
      label: "config",
      severity: "warning",
      summary: `.cppx/config.toml이 없습니다. 아직 cppx 프로젝트로 초기화되지 않았을 수 있습니다.`
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
      summary: `.cppx/config.toml을 읽지 못했습니다.`,
      details: configSummary.error
    });
  } else {
    const schemaState =
      (configSummary.schemaVersion ?? 0) < 3
        ? `schema v${configSummary.schemaVersion}을 읽었습니다. 저장하면 v3로 올라갑니다.`
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
      summary: `레거시 .cppx/project.json이 남아 있습니다. 현재 기준점은 .cppx/config.toml입니다.`
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
        : `아직 생성물 루트가 없습니다. 프로젝트 초기화 전 상태로 보입니다.`
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
      summary: `레거시 생성물이 남아 있습니다.`,
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
        details: tool.detail.mode
          ? `mode=${tool.detail.mode}, active backend=${activeBackend}`
          : undefined
      });
      continue;
    }

    const detailParts = [
      tool.detail.mode,
      tool.detail.resolvedVersion,
      tool.detail.sourceKind,
      tool.detail.executable
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    checks.push({
      key: tool.key,
      label: tool.label,
      severity: "ok",
      summary: `${tool.label} 준비됨${detailParts.length > 0 ? ` (${detailParts.join(", ")})` : ""}`
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

    checks.push({
      key: "ctest",
      label: "ctest",
      severity: (await pathExists(ctestPath)) ? "ok" : "warning",
      summary: (await pathExists(ctestPath))
        ? `${hostAdapter.getCtestExecutableName()} 준비됨 (${ctestPath})`
        : `${hostAdapter.getCtestExecutableName()}를 cmake 옆에서 찾지 못했습니다.`,
      details: (await pathExists(ctestPath)) ? undefined : ctestPath
    });
    checks.push({
      key: "cpack",
      label: "cpack",
      severity: (await pathExists(cpackPath)) ? "ok" : "warning",
      summary: (await pathExists(cpackPath))
        ? `${hostAdapter.getCpackExecutableName()} 준비됨 (${cpackPath})`
        : `${hostAdapter.getCpackExecutableName()}를 cmake 옆에서 찾지 못했습니다.`,
      details: (await pathExists(cpackPath)) ? undefined : cpackPath
    });
  }

  if (activeBackend === "vcpkg") {
    if (!toolSnapshot.vcpkg.ready) {
      checks.push({
        key: "backend-vcpkg",
        label: "backend",
        severity: "blocking",
        summary: `active backend가 vcpkg인데 vcpkg 실행 파일을 찾지 못했습니다.`
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
    const conanExecutable = await findExecutableOnPath(hostAdapter.getExecutableName("conan"), "conan");
    if (!conanExecutable) {
      checks.push({
        key: "backend-conan",
        label: "backend",
        severity: "blocking",
        summary: `active backend가 conan인데 conan 명령을 PATH에서 찾지 못했습니다.`
      });
      addNextStep(nextSteps, "Conan 2.x를 설치하고 `conan` 명령이 PATH에 보이게 하세요.");
    } else {
      checks.push({
        key: "backend-conan",
        label: "backend",
        severity: "ok",
        summary: `active backend=conan 준비됨 (${conanExecutable})`
      });
    }
  } else {
    checks.push({
      key: "backend-none",
      label: "backend",
      severity: "ok",
      summary: `active backend=none`
    });
    checks.push({
      key: "add-unavailable",
      label: "add",
      severity: "warning",
      summary: `dependency_backend = "none"이라서 cppx add를 사용할 수 없습니다.`,
      details: `의존성이 필요하면 init 시 --backend conan 또는 --backend vcpkg를 선택하거나 .cppx/config.toml을 수정하세요.`
    });
    addNextStep(
      nextSteps,
      "의존성이 필요하면 `dependency_backend`를 `conan` 또는 `vcpkg`로 바꾸고 `doctor`를 다시 실행하세요."
    );
  }

  const missingToolModes = collectMissingToolModes(toolSnapshot);
  if (missingToolModes.length > 0) {
    addNextStep(nextSteps, "npm run cppx -- install-tools");
    if (missingToolModes.includes("system")) {
      addNextStep(nextSteps, getSystemInstallHint());
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
      compilerFamily: configSummary.compilerFamily
    },
    activeBackend,
    checks,
    blockerCount,
    warningCount,
    nextSteps: Array.from(nextSteps)
  };
}

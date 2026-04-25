import path from "node:path";
import type {
  DependencyBackend,
  HostDefaultsPayload,
  ProjectConfigPayload,
  ProjectToolPoliciesPayload,
  RunCommandPayload,
  RunCommandResult,
  ToolStatus
} from "@shared/contracts";
import { CppxError } from "./errors";
import {
  resolveHostSupport,
  resolveToolLifecycleCapabilities
} from "./host-support";
import { getToolStatus, installAllTools, resolveToolchainOrThrow } from "./installers";
import { CppxLogger, type LogSink } from "./logger";
import { getHostAdapter } from "./platform";
import { defaultProjectConfig, getDefaultPresetName } from "./config";
import {
  createRequestedToolPolicies,
  mergeToolPolicies,
  normalizeToolchainStrategy
} from "./toolchain-strategy";
import {
  addDependency,
  buildWithPreset,
  cleanupLegacyWorkspaceFiles,
  ensureRunnablePreset,
  initProject,
  loadProjectConfig,
  packagePreset,
  runPresetBinary,
  saveProjectConfig,
  testPreset
} from "./project";

const hostAdapter = getHostAdapter();

export class CppxService {
  private readonly logger: CppxLogger;
  private isBusy = false;

  constructor(logSink: LogSink) {
    this.logger = new CppxLogger(logSink);
  }

  private getPayloadToolPolicies(payload: RunCommandPayload): ProjectToolPoliciesPayload | undefined {
    return createRequestedToolPolicies({
      toolPolicies: payload.toolPolicies,
      compilerPreference: payload.compilerPreference,
      msvcInstallationPath: payload.msvcInstallationPath,
      strategy: payload.toolchainStrategy
    });
  }

  private async resolveExecutionToolPolicies(
    workspace: string,
    payload: RunCommandPayload
  ): Promise<ProjectToolPoliciesPayload | undefined> {
    const payloadPolicies = this.getPayloadToolPolicies(payload);

    if (payload.action === "init") {
      return payloadPolicies;
    }

    if (payload.action === "install-tools") {
      try {
        const projectConfig = await loadProjectConfig(workspace);
        return mergeToolPolicies(projectConfig.tools, payloadPolicies);
      } catch {
        return payloadPolicies;
      }
    }

    const projectConfig = await loadProjectConfig(workspace);
    return mergeToolPolicies(projectConfig.tools, payloadPolicies);
  }

  private async resolveExecutionBackend(
    workspace: string,
    payload: RunCommandPayload
  ): Promise<DependencyBackend> {
    const hostDefaultBackend = hostAdapter.getDefaultDependencyBackend();
    const requestedBackend = payload.dependencyBackend;

    if (
      requestedBackend === "vcpkg" ||
      requestedBackend === "conan" ||
      requestedBackend === "none"
    ) {
      if (payload.action === "init" || payload.action === "install-tools") {
        return requestedBackend;
      }
    }

    if (payload.action === "init") {
      return hostDefaultBackend;
    }

    if (payload.action === "install-tools") {
      try {
        const projectConfig = await loadProjectConfig(workspace);
        return projectConfig.dependencyBackend ?? hostDefaultBackend;
      } catch {
        return hostDefaultBackend;
      }
    }

    const projectConfig = await loadProjectConfig(workspace);
    return projectConfig.dependencyBackend ?? hostDefaultBackend;
  }

  private async resolveExecutionPreset(
    workspace: string,
    payload: RunCommandPayload
  ): Promise<string> {
    if (payload.preset?.trim()) {
      return payload.preset.trim();
    }

    if (
      payload.action === "build" ||
      payload.action === "run" ||
      payload.action === "test" ||
      payload.action === "pack"
    ) {
      const projectConfig = await loadProjectConfig(workspace);
      return projectConfig.defaultPreset;
    }

    return getDefaultPresetName();
  }

  async execute(payload: RunCommandPayload): Promise<RunCommandResult> {
    if (this.isBusy) {
      throw new CppxError("다른 cppx 명령이 이미 실행 중입니다.");
    }

    this.isBusy = true;
    const action = payload.action;
    const workspace =
      payload.workspace && payload.workspace.trim().length > 0
        ? path.resolve(payload.workspace)
        : process.cwd();
    let dependencyBackend: DependencyBackend = "vcpkg";
    let toolPolicies: ProjectToolPoliciesPayload | undefined;
    let resolvedWorkspace = workspace;
    let preset = getDefaultPresetName();

    try {
      preset = await this.resolveExecutionPreset(workspace, payload);
      dependencyBackend = await this.resolveExecutionBackend(workspace, payload);
      toolPolicies = await this.resolveExecutionToolPolicies(workspace, payload);
      const hostSupport = await resolveHostSupport();
      if (hostSupport.tier === "unsupported") {
        throw new CppxError(
          "현재 Linux 배포판은 cppx 지원 대상이 아닙니다.",
          hostSupport.notes.join(" ")
        );
      }
      this.logger.info(action, `'${action}' 시작`);

      switch (action) {
        case "install-tools": {
          await installAllTools(this.logger, toolPolicies, dependencyBackend);
          break;
        }
        case "init": {
          const toolchain = await resolveToolchainOrThrow(
            this.logger,
            toolPolicies,
            dependencyBackend
          );
          const initializedWorkspace = await initProject(
            workspace,
            payload.projectName,
            toolchain,
            this.logger,
            {
              dependencyBackend,
              toolchainStrategy: normalizeToolchainStrategy(payload.toolchainStrategy)
            }
          );
          resolvedWorkspace = initializedWorkspace;
          await cleanupLegacyWorkspaceFiles(initializedWorkspace, this.logger);
          break;
        }
        case "add": {
          await addDependency(workspace, payload.dependency, this.logger);
          break;
        }
        case "build": {
          const toolchain = await resolveToolchainOrThrow(
            this.logger,
            toolPolicies,
            dependencyBackend
          );
          await buildWithPreset(workspace, preset, toolchain, this.logger);
          await cleanupLegacyWorkspaceFiles(workspace, this.logger);
          break;
        }
        case "run": {
          await ensureRunnablePreset(workspace, preset);
          const toolchain = await resolveToolchainOrThrow(
            this.logger,
            toolPolicies,
            dependencyBackend
          );
          this.logger.info("run", `run 전에 preset '${preset}'을 먼저 build합니다`);
          await buildWithPreset(workspace, preset, toolchain, this.logger);
          await cleanupLegacyWorkspaceFiles(workspace, this.logger);
          await runPresetBinary(workspace, preset, toolchain, this.logger);
          break;
        }
        case "test": {
          const toolchain = await resolveToolchainOrThrow(
            this.logger,
            toolPolicies,
            dependencyBackend
          );
          await testPreset(workspace, preset, toolchain, this.logger);
          break;
        }
        case "pack": {
          const toolchain = await resolveToolchainOrThrow(
            this.logger,
            toolPolicies,
            dependencyBackend
          );
          await packagePreset(workspace, preset, toolchain, this.logger);
          break;
        }
        default: {
          const neverAction: never = action;
          throw new CppxError(`지원하지 않는 action: ${String(neverAction)}`);
        }
      }

      this.logger.success(action, `'${action}' 완료`);
      return {
        action,
        ok: true,
        code: 0,
        message: `${action} 완료`,
        workspace: resolvedWorkspace
      };
    } catch (error) {
      const message = (() => {
        if (error instanceof CppxError && error.details) {
          return `${error.message}: ${error.details}`;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return "알 수 없는 명령 오류";
      })();
      this.logger.error(action, message);
      return {
        action,
        ok: false,
        code: 1,
        message
      };
    } finally {
      this.isBusy = false;
    }
  }

  async toolStatus(): Promise<ToolStatus> {
    return getToolStatus();
  }

  async getHostDefaults(): Promise<HostDefaultsPayload> {
    const config = defaultProjectConfig("cppx-app", hostAdapter.compilerFamily);
    const [hostSupport, cmake, ninja, vcpkg, conan, cxx] = await Promise.all([
      resolveHostSupport(),
      resolveToolLifecycleCapabilities("cmake"),
      resolveToolLifecycleCapabilities("ninja"),
      resolveToolLifecycleCapabilities("vcpkg"),
      resolveToolLifecycleCapabilities("conan"),
      resolveToolLifecycleCapabilities("cxx")
    ]);

    return {
      platform: hostAdapter.platform,
      defaultPreset: config.defaultPreset,
      dependencyBackend: config.dependencyBackend,
      toolchain: { ...config.toolchain },
      toolPolicies: {
        cmake: { ...config.tools.cmake },
        ninja: { ...config.tools.ninja },
        vcpkg: { ...config.tools.vcpkg },
        conan: { ...config.tools.conan },
        cxx: { ...config.tools.cxx }
      },
      hostSupport,
      toolCapabilities: {
        cmake,
        ninja,
        vcpkg,
        conan,
        cxx
      }
    };
  }

  async getProjectConfig(workspaceRaw: string): Promise<ProjectConfigPayload> {
    const workspace =
      workspaceRaw && workspaceRaw.trim().length > 0
        ? path.resolve(workspaceRaw)
        : process.cwd();
    return loadProjectConfig(workspace);
  }

  async saveProjectConfig(
    workspaceRaw: string,
    configRaw: unknown
  ): Promise<ProjectConfigPayload> {
    const workspace =
      workspaceRaw && workspaceRaw.trim().length > 0
        ? path.resolve(workspaceRaw)
        : process.cwd();

    if (!configRaw || typeof configRaw !== "object") {
      throw new CppxError("잘못된 프로젝트 설정 형식입니다.");
    }

    const saved = await saveProjectConfig(workspace, configRaw as ProjectConfigPayload);
    this.logger.success("system", `.cppx/config.toml 업데이트 완료: ${workspace}`);
    return saved;
  }
}

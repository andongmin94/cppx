import path from "node:path";
import type {
  DependencyBackend,
  ProjectConfigPayload,
  ProjectToolPoliciesPayload,
  RunCommandPayload,
  RunCommandResult,
  ToolStatus
} from "@shared/contracts";
import { CppxError } from "./errors";
import { getToolStatus, installAllTools, resolveToolchainOrThrow } from "./installers";
import { CppxLogger, type LogSink } from "./logger";
import { getHostAdapter } from "./platform";
import { getDefaultPresetName } from "./config";
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

  private mergeToolPolicies(
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

  private getPayloadToolPolicies(payload: RunCommandPayload): ProjectToolPoliciesPayload | undefined {
    const policies = this.mergeToolPolicies(undefined, payload.toolPolicies);

    if (!payload.compilerPreference && !payload.msvcInstallationPath) {
      return policies;
    }

    const cxxPolicy = { ...(policies?.cxx ?? {}) };
    if (payload.compilerPreference === "msvc") {
      cxxPolicy.mode = cxxPolicy.mode ?? "system";
      cxxPolicy.preferredFamily = "msvc";
    } else if (payload.compilerPreference === "mingw") {
      cxxPolicy.mode = cxxPolicy.mode ?? "managed";
      cxxPolicy.preferredFamily = "mingw";
      cxxPolicy.version = cxxPolicy.version ?? "latest";
    }

    if (payload.msvcInstallationPath?.trim()) {
      cxxPolicy.msvcInstallationPath = payload.msvcInstallationPath.trim();
    }

    return {
      ...(policies ?? {}),
      cxx: cxxPolicy
    };
  }

  private async resolveExecutionToolPolicies(
    workspace: string,
    payload: RunCommandPayload
  ): Promise<ProjectToolPoliciesPayload | undefined> {
    const payloadPolicies = this.getPayloadToolPolicies(payload);

    if (payload.action === "install-tools" || payload.action === "init") {
      return payloadPolicies;
    }

    const projectConfig = await loadProjectConfig(workspace);
    return this.mergeToolPolicies(projectConfig.tools, payloadPolicies);
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
            { dependencyBackend }
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

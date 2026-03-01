import path from "node:path";
import type {
  ProjectConfigPayload,
  RunCommandPayload,
  RunCommandResult,
  ToolStatus
} from "@shared/contracts";
import { CppxError } from "./errors";
import { getToolStatus, installAllTools, resolveToolchainOrThrow } from "./installers";
import { CppxLogger, type LogSink } from "./logger";
import {
  addDependency,
  buildWithPreset,
  cleanupLegacyWorkspaceFiles,
  initProject,
  loadProjectConfig,
  packagePreset,
  runPresetBinary,
  saveProjectConfig,
  testPreset
} from "./project";

export class CppxService {
  private readonly logger: CppxLogger;
  private isBusy = false;

  constructor(logSink: LogSink) {
    this.logger = new CppxLogger(logSink);
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
    const preset = payload.preset?.trim() || "debug-x64";
    let resolvedWorkspace = workspace;

    try {
      this.logger.info(action, `'${action}' 시작`);

      switch (action) {
        case "install-tools": {
          await installAllTools(
            this.logger,
            payload.compilerPreference,
            payload.msvcInstallationPath
          );
          break;
        }
        case "init": {
          const toolchain = await resolveToolchainOrThrow(this.logger);
          const initializedWorkspace = await initProject(
            workspace,
            payload.projectName,
            toolchain,
            this.logger
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
          const toolchain = await resolveToolchainOrThrow(this.logger);
          await buildWithPreset(workspace, preset, toolchain, this.logger);
          await cleanupLegacyWorkspaceFiles(workspace, this.logger);
          break;
        }
        case "run": {
          const toolchain = await resolveToolchainOrThrow(this.logger);
          this.logger.info("run", `run 전에 preset '${preset}'을 먼저 build합니다`);
          await buildWithPreset(workspace, preset, toolchain, this.logger);
          await cleanupLegacyWorkspaceFiles(workspace, this.logger);
          await runPresetBinary(workspace, preset, toolchain, this.logger);
          break;
        }
        case "test": {
          const toolchain = await resolveToolchainOrThrow(this.logger);
          await testPreset(workspace, preset, toolchain, this.logger);
          break;
        }
        case "pack": {
          const toolchain = await resolveToolchainOrThrow(this.logger);
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

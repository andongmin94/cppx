#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import type {
  DependencyBackend,
  LogEntry,
  RunCommandPayload,
  RunCommandResult,
  ToolStatusDetail
} from "@shared/contracts";
import { formatCompilerPreference } from "@shared/compiler-display";
import {
  formatHostSupportSummary,
  formatLifecycleSummary,
  getToolOwnershipLabel
} from "@shared/tooling-display";
import { CPPX_CONFIG_PATH, parseConfigToml } from "./cppx/config";
import { runDoctor } from "./cppx/doctor";
import { pathExists } from "./cppx/fs-utils";
import { getHostAdapter } from "./cppx/platform";
import { CppxService } from "./cppx/service";

function printLog(entry: LogEntry): void {
  const line = `[${new Date(entry.timestamp).toLocaleTimeString()}] [${
    entry.action
  }] ${entry.message}`;

  if (entry.level === "error" || entry.level === "stderr") {
    console.error(line);
    return;
  }

  console.log(line);
}

const service = new CppxService(printLog);
const program = new Command();
const hostAdapter = getHostAdapter();

interface WorkspaceConfigSummary {
  exists: boolean;
  dependencyBackend?: DependencyBackend;
  schemaVersion?: number;
  targetName?: string;
}

async function execute(payload: RunCommandPayload): Promise<RunCommandResult> {
  const result = await service.execute(payload);
  if (!result.ok) {
    process.exitCode = result.code;
  }
  return result;
}

function quoteForCommand(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

async function readWorkspaceConfigSummary(workspaceRaw: string): Promise<WorkspaceConfigSummary> {
  const workspace = path.resolve(workspaceRaw);
  const configPath = path.join(workspace, CPPX_CONFIG_PATH);
  if (!(await pathExists(configPath))) {
    return { exists: false };
  }

  const content = await fs.readFile(configPath, "utf-8");
  const parsed = parseConfigToml(content, path.basename(workspace), hostAdapter.compilerFamily);
  return {
    exists: true,
    dependencyBackend: parsed.dependencyBackend,
    schemaVersion: parsed.schemaVersion,
    targetName: parsed.targetName
  };
}

function printInitGuidance(workspaceRaw: string, config: WorkspaceConfigSummary): void {
  const workspace = path.resolve(workspaceRaw);
  const displayPath = quoteForCommand(workspace);
  console.log("");
  console.log(`workspace: ${workspace}`);
  if (config.exists) {
    console.log(
      `config: schema v${config.schemaVersion ?? "unknown"}, backend=${config.dependencyBackend ?? hostAdapter.getDefaultDependencyBackend()}, target=${config.targetName ?? "unknown"}`
    );
  }
  console.log(`next: npm run cppx -- doctor ${displayPath}`);
  console.log(`next: npm run cppx -- build ${displayPath}`);
  console.log(`next: npm run cppx -- run ${displayPath}`);
  if (config.dependencyBackend === "none") {
    console.log(
      `hint: dependency_backend = "none"이라 cppx add는 비활성화됩니다. 의존성이 필요하면 --backend conan 또는 --backend vcpkg를 선택하세요.`
    );
  }
  if (config.dependencyBackend === "conan") {
    console.log("hint: conan backend를 쓰려면 conan 명령이 PATH에 있어야 합니다.");
  }
}

function printStatusGuidance(
  workspaceRaw: string,
  rows: Array<[string, boolean, ToolStatusDetail | undefined]>,
  config: WorkspaceConfigSummary
): void {
  const workspace = path.resolve(workspaceRaw);
  const missing = rows.filter(([, ready]) => !ready).map(([name]) => name);

  console.log("");
  console.log(`workspace: ${workspace}`);
  if (config.exists) {
    console.log(
      `config: schema v${config.schemaVersion ?? "unknown"}, backend=${config.dependencyBackend ?? hostAdapter.getDefaultDependencyBackend()}, target=${config.targetName ?? "unknown"}`
    );
    if (config.dependencyBackend === "none") {
      console.log(
        `hint: dependency_backend = "none"이라 cppx add는 비활성화됩니다. 의존성이 필요하면 conan 또는 vcpkg로 바꾸세요.`
      );
    }
  } else {
    console.log("hint: 이 작업 폴더에는 .cppx/config.toml이 없습니다. 새 프로젝트라면 cppx init부터 시작하세요.");
  }

  if (missing.length > 0) {
    console.log(`hint: 누락된 도구가 있습니다: ${missing.join(", ")}`);
    console.log(`hint: npm run cppx -- doctor ${quoteForCommand(workspace)}`);
    console.log("hint: npm run cppx -- install-tools");
    return;
  }

  console.log(`hint: 전체 진단이 필요하면 npm run cppx -- doctor ${quoteForCommand(workspace)}`);
}

function printDoctorReport(report: Awaited<ReturnType<typeof runDoctor>>): void {
  console.log(`host: ${report.host.platform}/${report.host.arch}`);
  console.log(`support: ${formatHostSupportSummary(report.support)}`);
  console.log(`default backend: ${report.host.defaultBackend}`);
  console.log(`active backend: ${report.activeBackend}`);
  console.log(
    `compiler family: ${formatCompilerPreference(report.host.platform, report.host.compilerFamily)}`
  );
  console.log(`workspace: ${report.workspace}`);
  console.log("");

  for (const check of report.checks) {
    const prefix =
      check.severity === "blocking"
        ? "BLOCKER"
        : check.severity === "warning"
          ? "WARN"
          : "OK";
    console.log(`[${prefix}] ${check.label}: ${check.summary}`);
    if (check.details) {
      console.log(`  ${check.details}`);
    }
  }

  console.log("");
  console.log(`summary: blockers=${report.blockerCount}, warnings=${report.warningCount}`);
  if (report.nextSteps.length > 0) {
    console.log("next steps:");
    for (const step of report.nextSteps) {
      console.log(`- ${step}`);
    }
  }
}

program
  .name("cppx")
  .description("Cargo-like C++ workflow orchestrator for Windows, macOS, and Linux")
  .version("0.1.0");

program
  .command("install-tools")
  .description(
    "Resolve or install host tools such as CMake, Ninja, vcpkg, conan, and C++ compiler"
  )
  .option("--compiler <compiler>", "Compiler family (Windows only: mingw or msvc)")
  .option("--msvc-installation-path <path>", "Preferred MSVC installation path")
  .action(async (options: { compiler?: "mingw" | "msvc"; msvcInstallationPath?: string }) => {
    await execute({
      action: "install-tools",
      workspace: process.cwd(),
      compilerPreference: options.compiler,
      msvcInstallationPath: options.msvcInstallationPath
    });
  });

program
  .command("init [workspace]")
  .description("Initialize a C++ project with presets, backend manifest, and VSCode configs")
  .addOption(
    new Option("--backend <backend>", "Dependency backend (vcpkg, conan, none)").choices([
      "vcpkg",
      "conan",
      "none"
    ])
  )
  .option("-n, --name <name>", "Project name")
  .action(
    async (
      workspace: string | undefined,
      options: { name?: string; backend?: DependencyBackend }
    ) => {
      const resolvedWorkspace = workspace ?? process.cwd();
      const result = await execute({
      action: "init",
        workspace: resolvedWorkspace,
        projectName: options.name,
        dependencyBackend: options.backend
      });
      if (!result.ok || !result.workspace) {
        return;
      }

      const config = await readWorkspaceConfigSummary(result.workspace);
      printInitGuidance(result.workspace, config);
    }
  );

program
  .command("add <dependency> [workspace]")
  .description("Add dependency to .cppx/config.toml")
  .action(async (dependency: string, workspace: string | undefined) => {
    await execute({
      action: "add",
      workspace: workspace ?? process.cwd(),
      dependency
    });
  });

program
  .command("build [workspace]")
  .description("Configure and build with the selected CMake preset")
  .option("-p, --preset <preset>", "Preset name")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "build",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("run [workspace]")
  .description("Build (incremental) then run the binary from preset output")
  .option("-p, --preset <preset>", "Preset name")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "run",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("test [workspace]")
  .description("Run the CTest preset")
  .option("-p, --preset <preset>", "Preset name")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "test",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("pack [workspace]")
  .description("Run the CPack preset")
  .option("-p, --preset <preset>", "Preset name")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "pack",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("status [workspace]")
  .description("Show installed tool status, resolved metadata, and workspace hints")
  .action(async (workspace: string | undefined) => {
    const resolvedWorkspace = workspace ?? process.cwd();
    const status = await service.toolStatus();
    const rows: Array<[string, boolean, ToolStatusDetail | undefined]> = [
      ["cmake", status.cmake, status.details?.cmake],
      ["ninja", status.ninja, status.details?.ninja],
      ["vcpkg", status.vcpkg, status.details?.vcpkg],
      ["conan", status.conan, status.details?.conan],
      ["cxx", status.cxx, status.details?.cxx]
    ];

    for (const [name, ready, detail] of rows) {
      const detailParts = [
        detail?.mode,
        detail?.provider,
        detail?.ownership ? getToolOwnershipLabel(detail.ownership) : undefined,
        detail?.resolvedVersion,
        detail?.sourceKind,
        detail?.capabilities ? formatLifecycleSummary(detail.capabilities) : undefined,
        detail?.verifiedSha256 ? `sha256:${detail.verifiedSha256.slice(0, 12)}` : undefined,
        detail?.executable
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const suffix = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
      console.log(`${name}: ${ready ? "ready" : "missing"}${suffix}`);
    }

    try {
      const config = await readWorkspaceConfigSummary(resolvedWorkspace);
      printStatusGuidance(resolvedWorkspace, rows, config);
    } catch (error) {
      console.log("");
      console.log(
        `hint: workspace 설정을 읽는 중 오류가 발생했습니다. 전체 진단은 npm run cppx -- doctor ${quoteForCommand(path.resolve(resolvedWorkspace))}`
      );
      if (error instanceof Error && error.message.trim().length > 0) {
        console.log(`hint: ${error.message}`);
      }
    }
  });

program
  .command("doctor [workspace]")
  .description("Show blocking issues, warnings, and next steps for the current host/workspace")
  .action(async (workspace: string | undefined) => {
    const report = await runDoctor(workspace ?? process.cwd());
    printDoctorReport(report);
    process.exitCode = report.blockerCount > 0 ? 1 : 0;
  });

void program.parseAsync(process.argv);

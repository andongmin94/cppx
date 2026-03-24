#!/usr/bin/env node
import { Command } from "commander";
import type { LogEntry, RunCommandPayload, ToolStatusDetail } from "@shared/contracts";
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

async function execute(payload: RunCommandPayload): Promise<void> {
  const result = await service.execute(payload);
  if (!result.ok) {
    process.exitCode = result.code;
  }
}

program
  .name("cppx")
  .description("Cargo-like C++ workflow orchestrator for Windows, macOS, and Linux")
  .version("0.1.0");

program
  .command("install-tools")
  .description(
    "Resolve or install CMake, Ninja, vcpkg, and C++ compiler according to host policy"
  )
  .option("--compiler <compiler>", "Compiler family (mingw or msvc)")
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
  .option("-n, --name <name>", "Project name")
  .action(async (workspace: string | undefined, options: { name?: string }) => {
    await execute({
      action: "init",
      workspace: workspace ?? process.cwd(),
      projectName: options.name
    });
  });

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
  .command("status")
  .description("Show installed tool status and resolved metadata")
  .action(async () => {
    const status = await service.toolStatus();
    const rows: Array<[string, boolean, ToolStatusDetail | undefined]> = [
      ["cmake", status.cmake, status.details?.cmake],
      ["ninja", status.ninja, status.details?.ninja],
      ["vcpkg", status.vcpkg, status.details?.vcpkg],
      ["cxx", status.cxx, status.details?.cxx]
    ];

    for (const [name, ready, detail] of rows) {
      const detailParts = [
        detail?.mode,
        detail?.resolvedVersion,
        detail?.sourceKind,
        detail?.executable
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const suffix = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
      console.log(`${name}: ${ready ? "ready" : "missing"}${suffix}`);
    }
  });

void program.parseAsync(process.argv);

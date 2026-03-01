#!/usr/bin/env node
import { Command } from "commander";
import type { LogEntry, RunCommandPayload } from "@shared/contracts";
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
  .description("Cargo-like C++ workflow orchestrator for Windows")
  .version("0.1.0");

program
  .command("install-tools")
  .description(
    "Install CMake, Ninja, vcpkg, and local C++ compiler under %LOCALAPPDATA%/cppx"
  )
  .action(async () => {
    await execute({
      action: "install-tools",
      workspace: process.cwd()
    });
  });

program
  .command("init [workspace]")
  .description("Initialize a C++ project with presets and VSCode configs")
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
  .description("Configure and build with cmake preset")
  .option("-p, --preset <preset>", "Preset name", "debug-x64")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "build",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("run [workspace]")
  .description("Build (incremental) then run binary from preset output")
  .option("-p, --preset <preset>", "Preset name", "debug-x64")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "run",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("test [workspace]")
  .description("Run ctest preset")
  .option("-p, --preset <preset>", "Preset name", "debug-x64")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "test",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("pack [workspace]")
  .description("Run cpack preset")
  .option("-p, --preset <preset>", "Preset name", "debug-x64")
  .action(async (workspace: string | undefined, options: { preset: string }) => {
    await execute({
      action: "pack",
      workspace: workspace ?? process.cwd(),
      preset: options.preset
    });
  });

program
  .command("status")
  .description("Show installed tool status")
  .action(async () => {
    const status = await service.toolStatus();
    const rows = [
      ["cmake", status.cmake],
      ["ninja", status.ninja],
      ["vcpkg", status.vcpkg],
      ["cxx", status.cxx]
    ];

    for (const [name, ready] of rows) {
      console.log(`${name}: ${ready ? "ready" : "missing"}`);
    }
  });

void program.parseAsync(process.argv);

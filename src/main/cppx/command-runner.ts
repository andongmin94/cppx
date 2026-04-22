import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { CppxAction } from "@shared/contracts";
import { CppxError } from "./errors";
import type { CppxLogger } from "./logger";

export interface SpawnOptions {
  action: CppxAction | "system";
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowNonZeroExit?: boolean;
}

export interface SpawnResult {
  code: number;
}

export async function runSpawn(
  options: SpawnOptions,
  logger: CppxLogger
): Promise<SpawnResult> {
  const args = options.args ?? [];
  logger.info(options.action, `> ${options.command} ${args.join(" ")}`);

  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(options.command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      shell: false,
      windowsHide: true
    });

    child.once("error", (error) => {
      reject(
        new CppxError(
          `명령 실행(spawn) 실패: ${options.command}`,
          error.message
        )
      );
    });

    if (child.stdout) {
      const stdout = createInterface({ input: child.stdout });
      stdout.on("line", (line) => {
        if (line.trim().length > 0) {
          logger.emit(options.action, "stdout", line);
        }
      });
    }

    if (child.stderr) {
      const stderr = createInterface({ input: child.stderr });
      stderr.on("line", (line) => {
        if (line.trim().length > 0) {
          logger.emit(options.action, "stderr", line);
        }
      });
    }

    child.once("close", (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !options.allowNonZeroExit) {
        reject(
          new CppxError(
            `명령이 코드 ${exitCode}로 종료되었습니다: ${options.command}`
          )
        );
        return;
      }

      resolve({ code: exitCode });
    });
  });
}


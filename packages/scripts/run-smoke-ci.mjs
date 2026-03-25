import { spawn } from "node:child_process";

function escapeAnnotation(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

async function main() {
  const child = spawn(process.execPath, ["./node_modules/tsx/dist/cli.mjs", "./scripts/smoke-native-host.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";

  const onChunk = (chunk, writer) => {
    const text = chunk.toString();
    output += text;
    writer.write(text);
  };

  child.stdout.on("data", (chunk) => onChunk(chunk, process.stdout));
  child.stderr.on("data", (chunk) => onChunk(chunk, process.stderr));

  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (code !== 0) {
    const missingTools = output.includes("누락된 도구:");
    const runningInCi =
      process.env.CI === "true" ||
      process.env.CI === "1" ||
      process.env.GITHUB_ACTIONS === "true";

    if (missingTools && !runningInCi) {
      const tail = output
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(-20)
        .join("\n");

      console.log(`Smoke skipped: ${tail}`);
      return;
    }

    const tail = output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-120)
      .join("\n");

    console.error(`::error title=Smoke failure::${escapeAnnotation(tail)}`);
    process.exit(code ?? 1);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`::error title=Smoke runner failed::${escapeAnnotation(message)}`);
  process.exit(1);
});

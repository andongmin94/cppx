import { spawn } from "node:child_process";

function escapeAnnotation(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

async function main() {
  const child = spawn(process.execPath, ["./scripts/run-tests.mjs"], {
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
    const tail = output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-120)
      .join("\n");

    console.error(`::error title=Test failure::${escapeAnnotation(tail)}`);
    process.exit(code ?? 1);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`::error title=Test runner failed::${escapeAnnotation(message)}`);
  process.exit(1);
});

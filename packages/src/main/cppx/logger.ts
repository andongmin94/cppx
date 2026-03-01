import { randomUUID } from "node:crypto";
import type { CppxAction, LogEntry, LogLevel } from "@shared/contracts";

export type LogSink = (entry: LogEntry) => void;

export class CppxLogger {
  constructor(private readonly sink: LogSink) {}

  emit(action: CppxAction | "system", level: LogLevel, message: string): void {
    this.sink({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      level,
      message
    });
  }

  info(action: CppxAction | "system", message: string): void {
    this.emit(action, "info", message);
  }

  warn(action: CppxAction | "system", message: string): void {
    this.emit(action, "warn", message);
  }

  error(action: CppxAction | "system", message: string): void {
    this.emit(action, "error", message);
  }

  success(action: CppxAction | "system", message: string): void {
    this.emit(action, "success", message);
  }
}

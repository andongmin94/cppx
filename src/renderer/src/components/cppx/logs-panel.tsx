import type { RefObject } from "react";
import type { LogEntry } from "@shared/contracts";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@renderer/components/ui/card";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { Terminal } from "lucide-react";

interface LogsPanelProps {
  logs: LogEntry[];
  busy: boolean;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  onClearLogs: () => void;
}

function levelClass(level: LogEntry["level"]): string {
  switch (level) {
    case "error":
    case "stderr":
      return "text-red-600";
    case "warn":
      return "text-amber-600";
    case "success":
      return "text-emerald-600";
    case "stdout":
      return "text-slate-700";
    default:
      return "text-slate-900";
  }
}

export function LogsPanel({
  logs,
  busy,
  scrollAreaRef,
  onClearLogs
}: LogsPanelProps) {
  return (
    <section>
      <Card className="flex h-[max(320px,calc(100dvh-300px))] flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                실행 로그
              </CardTitle>
              <CardDescription>child_process.spawn 실시간 로그 스트림</CardDescription>
            </div>
            <div className="flex items-center">
              <Button size="sm" variant="ghost" onClick={onClearLogs} disabled={busy}>
                지우기
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea
            ref={scrollAreaRef}
            className="h-full rounded-[10px] border bg-card p-3 font-mono text-xs"
          >
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">아직 로그가 없습니다.</p>
              ) : (
                logs.map((entry) => (
                  <p
                    key={entry.id}
                    className={`rounded-md border border-border/70 bg-secondary/40 px-2 py-1 whitespace-pre-wrap break-words ${levelClass(entry.level)}`}
                  >
                    [{new Date(entry.timestamp).toLocaleTimeString()}] [{entry.action}]{" "}
                    {entry.message}
                  </p>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  );
}

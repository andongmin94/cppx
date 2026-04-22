import type { HostSupportPayload, ToolStatus, ToolStatusDetail } from "@shared/contracts";
import { formatHostSupportSummary } from "@shared/tooling-display";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackagePlus,
  RefreshCcw
} from "lucide-react";
import {
  type InstallProgressStatus,
  type InstallToolKey,
  type InstallToolProgress,
  getToolchainInstallGuidance,
  getToolCapabilityNote,
  getToolStatusSummary
} from "./tooling";

type InstallButtonStatus = "idle" | "running" | "success" | "error";

interface ToolchainStatusCardProps {
  hostSupport: HostSupportPayload;
  toolStatus: ToolStatus;
  installProgressTools: Record<InstallToolKey, InstallToolProgress>;
  showProgress: boolean;
  installButtonStatus: InstallButtonStatus;
  installButtonText: string;
  installButtonClassName: string;
  readyToolCount: number;
  requiredToolCount: number;
  busy: boolean;
  canRefresh: boolean;
  onInstallTools: () => void;
  onRefresh: () => void;
}

const TOOL_STATUS_ROWS: {
  key: InstallToolKey;
  label: string;
}[] = [
  { key: "cmake", label: "CMake" },
  { key: "ninja", label: "Ninja" },
  { key: "vcpkg", label: "vcpkg" },
  { key: "conan", label: "conan" },
  { key: "cxx", label: "C++ 컴파일러" }
];

export function ToolchainStatusCard({
  hostSupport,
  toolStatus,
  installProgressTools,
  showProgress,
  installButtonStatus,
  installButtonText,
  installButtonClassName,
  readyToolCount,
  requiredToolCount,
  busy,
  canRefresh,
  onInstallTools,
  onRefresh
}: ToolchainStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>툴체인 상태</CardTitle>
        <CardDescription>
          명령 실행 전 현재 backend 기준 필수 도구 설치 여부를 확인합니다 ({readyToolCount}/{requiredToolCount} 준비됨)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[10px] border border-border/70 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <p>{formatHostSupportSummary(hostSupport)}</p>
          {hostSupport.notes.map((note, index) => (
            <p key={`${note}-${index}`} className="mt-1">
              {note}
            </p>
          ))}
        </div>
        <div className="space-y-1.5">
          {TOOL_STATUS_ROWS.map((row) => (
            <ToolStatusRow
              key={row.key}
              name={row.label}
              ready={toolStatus[row.key]}
              detail={toolStatus.details?.[row.key]}
              progress={installProgressTools[row.key]}
              showProgress={showProgress}
            />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className={installButtonClassName}
            onClick={onInstallTools}
            disabled={busy}
          >
            {installButtonStatus === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="h-4 w-4" />
            )}
            <span className="truncate">{installButtonText}</span>
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-center gap-2"
            onClick={onRefresh}
            disabled={busy || !canRefresh}
          >
            <RefreshCcw className="h-4 w-4" />
            툴체인 다시 검사
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {getToolchainInstallGuidance(hostSupport)}
        </p>
      </CardContent>
    </Card>
  );
}

function getInstallToolStatusText(status: InstallProgressStatus): string {
  switch (status) {
    case "running":
      return "진행";
    case "success":
      return "완료";
    case "error":
      return "실패";
    default:
      return "대기";
  }
}

function getInstallToolProgressBarClass(status: InstallProgressStatus): string {
  switch (status) {
    case "running":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-600";
    case "error":
      return "bg-red-600";
    default:
      return "bg-slate-400";
  }
}

function ToolStatusRow({
  name,
  ready,
  detail,
  progress,
  showProgress = false
}: {
  name: string;
  ready: boolean;
  detail?: ToolStatusDetail;
  progress?: InstallToolProgress;
  showProgress?: boolean;
}) {
  const percent = progress
    ? Math.max(0, Math.min(100, Math.trunc(progress.percent)))
    : 0;
  const summary = getToolStatusSummary(detail);
  const capabilityNote = getToolCapabilityNote(detail);

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border/70 bg-secondary/35 px-3 py-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {ready ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          )}
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
        {summary && (
          <p className="truncate pl-6 text-[11px] text-muted-foreground" title={summary}>
            {summary}
          </p>
        )}
        {capabilityNote && (
          <p className="pl-6 text-[11px] text-muted-foreground/90" title={capabilityNote}>
            {capabilityNote}
          </p>
        )}
      </div>
      {showProgress && progress && (
        <div className="mx-1 flex min-w-0 flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/70">
            <div
              className={`h-full transition-[width] duration-300 ${getInstallToolProgressBarClass(progress.status)}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {getInstallToolStatusText(progress.status)} {percent}%
          </span>
        </div>
      )}
      <div className="ml-auto">
        <ToolChip ready={ready} />
      </div>
    </div>
  );
}

function ToolChip({
  ready
}: {
  ready: boolean;
}) {
  return <Badge variant={ready ? "success" : "secondary"}>{ready ? "준비됨" : "누락"}</Badge>;
}

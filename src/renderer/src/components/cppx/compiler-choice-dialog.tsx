import type { CompilerScanResult } from "@shared/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@renderer/components/ui/card";

interface CompilerChoiceDialogProps {
  scan: CompilerScanResult | null;
  open: boolean;
  onSelectMsvc: (installationPath: string) => void;
  onSelectMingw: () => void;
  onClose: () => void;
}

export function CompilerChoiceDialog({
  scan,
  open,
  onSelectMsvc,
  onSelectMingw,
  onClose
}: CompilerChoiceDialogProps) {
  if (!open || !scan) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-[620px] border-border bg-card shadow-2xl">
        <CardHeader className="space-y-2">
          <Badge className="w-fit uppercase tracking-[0.08em]">compiler</Badge>
          <CardTitle>컴파일러 선택</CardTitle>
          <CardDescription>
            MSVC가 감지되었습니다. 설치에 사용할 컴파일러를 선택하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-[10px] border border-border/70 bg-secondary p-3">
            <p className="text-xs text-muted-foreground">감지된 MSVC 목록</p>
            <div className="space-y-2">
              {scan.msvcCandidates.map((candidate) => (
                <div
                  key={candidate.installationPath}
                  className="flex flex-col gap-2 rounded-[10px] border border-border/70 bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {candidate.displayName ?? "Visual Studio"}
                      {candidate.version ? ` (${candidate.version})` : ""}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {candidate.installationPath}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {candidate.clPath}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto sm:shrink-0"
                    onClick={() => onSelectMsvc(candidate.installationPath)}
                  >
                    설치
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" className="w-full justify-center" onClick={onSelectMingw}>
              MinGW 설치
            </Button>
            <Button variant="outline" className="w-full justify-center" onClick={onClose}>
              닫기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

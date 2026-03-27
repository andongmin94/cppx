import type { PresetConfigPayload } from "@shared/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@renderer/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const EMPTY_BUILD_TYPE = "__none__";

interface PresetMatrixCardProps {
  busy: boolean;
  presetConfigs: PresetConfigPayload[];
  selectedPreset: string;
  targetTriplet: string;
  onAddPreset: () => void;
  onReloadPresets: () => void;
  onRemovePreset: (index: number) => void;
  onUpdatePreset: (
    index: number,
    field: keyof PresetConfigPayload,
    value: string | boolean
  ) => void;
}

export function PresetMatrixCard({
  busy,
  presetConfigs,
  selectedPreset,
  targetTriplet,
  onAddPreset,
  onReloadPresets,
  onRemovePreset,
  onUpdatePreset
}: PresetMatrixCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>프리셋 매트릭스</CardTitle>
        <CardDescription>
          data-driven preset 목록과 실행 가능 여부를 GUI에서 편집합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={onAddPreset} disabled={busy} className="gap-2">
            <Plus className="h-4 w-4" />
            프리셋 추가
          </Button>
          <Button variant="secondary" onClick={onReloadPresets} disabled={busy}>
            프리셋 다시 불러오기
          </Button>
        </div>
        {presetConfigs.length === 0 ? (
          <p className="rounded-[10px] border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
            현재 로드된 프리셋이 없습니다. config를 저장하면 기본 프리셋이 다시 생성됩니다.
          </p>
        ) : (
          <div className="space-y-3">
            {presetConfigs.map((presetConfig, index) => (
              <div
                key={`${presetConfig.name}-${index}`}
                className="space-y-3 rounded-[10px] border border-border/70 bg-secondary/35 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {presetConfig.displayName?.trim() || presetConfig.name || `preset-${index + 1}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>기본 선택 여부: {selectedPreset === presetConfig.name ? "예" : "아니오"}</span>
                      {selectedPreset === presetConfig.name && <Badge variant="secondary">default_preset</Badge>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRemovePreset(index)}
                    disabled={busy}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">name</Label>
                    <Input
                      value={presetConfig.name}
                      onChange={(event) => onUpdatePreset(index, "name", event.target.value)}
                      placeholder={`preset-${index + 1}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">display_name</Label>
                    <Input
                      value={presetConfig.displayName ?? ""}
                      onChange={(event) => onUpdatePreset(index, "displayName", event.target.value)}
                      placeholder="Debug x64"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">build_type</Label>
                    <Select
                      value={presetConfig.buildType ?? EMPTY_BUILD_TYPE}
                      onValueChange={(value) =>
                        onUpdatePreset(
                          index,
                          "buildType",
                          value === EMPTY_BUILD_TYPE ? "" : value
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="build type 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_BUILD_TYPE}>지정 안 함</SelectItem>
                        <SelectItem value="Debug">Debug</SelectItem>
                        <SelectItem value="Release">Release</SelectItem>
                        <SelectItem value="RelWithDebInfo">RelWithDebInfo</SelectItem>
                        <SelectItem value="MinSizeRel">MinSizeRel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">target_triplet</Label>
                    <Input
                      value={presetConfig.targetTriplet ?? ""}
                      onChange={(event) => onUpdatePreset(index, "targetTriplet", event.target.value)}
                      placeholder="비우면 상위 target_triplet 사용"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">runnable</Label>
                    <Select
                      value={presetConfig.runnable === false ? "false" : "true"}
                      onValueChange={(value) => onUpdatePreset(index, "runnable", value === "true")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="실행 가능 여부" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">default target</Label>
                    <p className="rounded-[10px] border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
                      상위 설정: <span className="font-mono">{targetTriplet || "(비어 있음)"}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

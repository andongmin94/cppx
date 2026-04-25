import type { PresetConfigPayload } from "@shared/contracts";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@renderer/components/ui/card";
import { Label } from "@renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@renderer/components/ui/select";
import { FolderOpen, Hammer, Play } from "lucide-react";

interface BuildActionPanelProps {
  busy: boolean;
  configLoaded: boolean;
  buildPreset: string;
  presetConfigs: PresetConfigPayload[];
  selectedPresetConfig?: PresetConfigPayload;
  targetTriplet: string;
  onChangeBuildPreset: (value: string) => void;
  onRun: () => void;
  onBuild: () => void;
  onTest: () => void;
  onPack: () => void;
  onOpenProject: () => void;
}

export function BuildActionPanel({
  busy,
  configLoaded,
  buildPreset,
  presetConfigs,
  selectedPresetConfig,
  targetTriplet,
  onChangeBuildPreset,
  onRun,
  onBuild,
  onTest,
  onPack,
  onOpenProject
}: BuildActionPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Build / Run / Test / Pack</CardTitle>
        <CardDescription>
          빌드 명령 예시: <code className="font-mono">cppx build --preset {buildPreset || "(preset)"}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>프리셋</Label>
          {presetConfigs.length > 0 ? (
            <Select value={buildPreset} onValueChange={onChangeBuildPreset}>
              <SelectTrigger>
                <SelectValue placeholder="프리셋 선택" />
              </SelectTrigger>
              <SelectContent>
                {presetConfigs.map((item, index) => (
                  <SelectItem key={`${item.name}-${index}`} value={item.name}>
                    {item.displayName?.trim() || item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-[10px] border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
              {configLoaded
                ? "프리셋이 없습니다. 프로젝트 설정에서 프리셋을 추가하세요."
                : "프로젝트를 초기화하거나 기존 .cppx 설정을 불러오면 프리셋을 선택할 수 있습니다."}
            </p>
          )}
          {selectedPresetConfig && (
            <p className="text-xs text-muted-foreground">
              target_triplet:{" "}
              <span className="font-mono">
                {selectedPresetConfig.targetTriplet?.trim() || targetTriplet || "(기본값 자동 결정)"}
              </span>
              {" · "}
              runnable:{" "}
              <span className="font-mono">
                {selectedPresetConfig.runnable === false ? "false" : "true"}
              </span>
            </p>
          )}
        </div>
        {!configLoaded && (
          <Button
            variant="secondary"
            onClick={onOpenProject}
            disabled={busy}
            className="w-full gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            프로젝트 탭에서 열기
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={onRun}
            disabled={
              busy ||
              !configLoaded ||
              presetConfigs.length === 0 ||
              selectedPresetConfig?.runnable === false
            }
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run
          </Button>
          <Button
            onClick={onBuild}
            disabled={busy || !configLoaded || presetConfigs.length === 0}
            className="gap-2"
          >
            <Hammer className="h-4 w-4" />
            Build
          </Button>
          <Button
            variant="outline"
            onClick={onTest}
            disabled={busy || !configLoaded || presetConfigs.length === 0}
          >
            Test
          </Button>
          <Button
            variant="outline"
            onClick={onPack}
            disabled={busy || !configLoaded || presetConfigs.length === 0}
          >
            Pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

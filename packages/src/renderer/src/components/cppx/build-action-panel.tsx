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
import { Hammer, Play } from "lucide-react";

interface BuildActionPanelProps {
  busy: boolean;
  buildPreset: string;
  presetConfigs: PresetConfigPayload[];
  selectedPresetConfig?: PresetConfigPayload;
  targetTriplet: string;
  onChangeBuildPreset: (value: string) => void;
  onRun: () => void;
  onBuild: () => void;
  onTest: () => void;
  onPack: () => void;
}

export function BuildActionPanel({
  busy,
  buildPreset,
  presetConfigs,
  selectedPresetConfig,
  targetTriplet,
  onChangeBuildPreset,
  onRun,
  onBuild,
  onTest,
  onPack
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
              먼저 config를 불러오거나 저장해서 프리셋 목록을 동기화하세요.
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
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={onRun}
            disabled={busy || presetConfigs.length === 0 || selectedPresetConfig?.runnable === false}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run
          </Button>
          <Button onClick={onBuild} disabled={busy || presetConfigs.length === 0} className="gap-2">
            <Hammer className="h-4 w-4" />
            Build
          </Button>
          <Button variant="outline" onClick={onTest} disabled={busy || presetConfigs.length === 0}>
            Test
          </Button>
          <Button variant="outline" onClick={onPack} disabled={busy || presetConfigs.length === 0}>
            Pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

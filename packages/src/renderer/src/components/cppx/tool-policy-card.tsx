import type {
  CompilerPreference,
  HostPlatformPayload,
  ProjectToolPoliciesPayload,
  ToolStatusDetail
} from "@shared/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@renderer/components/ui/select";
import {
  EDITABLE_TOOL_IDS,
  type EditableToolId,
  getCxxVersionPlaceholder,
  getToolStatusSummary,
  supportsMsvcInstallationPath,
  toolLabels,
  toolModeOptions
} from "./tooling";

type ToolPolicyField = "mode" | "version" | "preferredFamily" | "msvcInstallationPath";

interface ToolPolicyCardProps {
  toolPolicies: Required<ProjectToolPoliciesPayload>;
  toolStatusDetails?: Partial<Record<EditableToolId, ToolStatusDetail>>;
  hostPlatform: HostPlatformPayload;
  compilerFamilyOptions: { value: CompilerPreference; label: string }[];
  defaultCompilerPreference: CompilerPreference;
  onUpdateToolPolicy: (
    tool: EditableToolId,
    field: ToolPolicyField,
    value: string
  ) => void;
}

export function ToolPolicyCard({
  toolPolicies,
  toolStatusDetails,
  hostPlatform,
  compilerFamilyOptions,
  defaultCompilerPreference,
  onUpdateToolPolicy
}: ToolPolicyCardProps) {
  const compilerPreference = toolPolicies.cxx.preferredFamily ?? defaultCompilerPreference;
  const showMsvcInstallationPath = supportsMsvcInstallationPath(
    hostPlatform,
    compilerPreference
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>도구 정책</CardTitle>
        <CardDescription>
          managed / system 모드와 버전 정책을 GUI에서 직접 조정합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {EDITABLE_TOOL_IDS.map((tool) => (
          <div
            key={tool}
            className="space-y-2 rounded-[10px] border border-border/70 bg-secondary/35 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">{toolLabels[tool]}</Label>
              <span className="text-[11px] text-muted-foreground">
                {getToolStatusSummary(toolStatusDetails?.[tool]) ?? "미확인"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">mode</Label>
                <Select
                  value={toolPolicies[tool].mode ?? "managed"}
                  onValueChange={(value) => onUpdateToolPolicy(tool, "mode", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="mode 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {toolModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">version</Label>
                <Input
                  value={toolPolicies[tool].version ?? ""}
                  onChange={(event) => onUpdateToolPolicy(tool, "version", event.target.value)}
                  placeholder={
                    tool === "cxx"
                      ? getCxxVersionPlaceholder(hostPlatform, compilerPreference)
                      : "default / latest / exact"
                  }
                />
              </div>
            </div>
            {tool === "cxx" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">preferred_family</Label>
                  <Select
                    value={toolPolicies.cxx.preferredFamily ?? defaultCompilerPreference}
                    onValueChange={(value) =>
                      onUpdateToolPolicy("cxx", "preferredFamily", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="컴파일러 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {compilerFamilyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hostPlatform !== "win32" && (
                    <p className="text-[11px] text-muted-foreground">
                      이 호스트에서는 Clang compiler model을 사용합니다.
                    </p>
                  )}
                </div>
                {showMsvcInstallationPath && (
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="msvc-path">msvc_installation_path</Label>
                    <Input
                      id="msvc-path"
                      value={toolPolicies.cxx.msvcInstallationPath ?? ""}
                      onChange={(event) =>
                        onUpdateToolPolicy("cxx", "msvcInstallationPath", event.target.value)
                      }
                      placeholder="MSVC 사용 시 선택 경로를 저장"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

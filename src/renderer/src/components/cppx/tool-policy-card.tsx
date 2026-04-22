import type {
  CompilerPreference,
  DependencyBackend,
  HostSupportPayload,
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
  getCxxModeGuidance,
  getCxxVersionPlaceholder,
  getToolModeOptions,
  getToolStatusSummary,
  getToolVersionGuidance,
  getWindowsConanCompilerGuidance,
  supportsMsvcInstallationPath,
  toolLabels,
} from "./tooling";

type ToolPolicyField = "mode" | "version" | "preferredFamily" | "msvcInstallationPath";

interface ToolPolicyCardProps {
  toolPolicies: Required<ProjectToolPoliciesPayload>;
  toolStatusDetails?: Partial<Record<EditableToolId, ToolStatusDetail>>;
  hostPlatform: HostPlatformPayload;
  hostSupport: HostSupportPayload;
  dependencyBackend: DependencyBackend;
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
  hostSupport,
  dependencyBackend,
  compilerFamilyOptions,
  defaultCompilerPreference,
  onUpdateToolPolicy
}: ToolPolicyCardProps) {
  const compilerPreference = toolPolicies.cxx.preferredFamily ?? defaultCompilerPreference;
  const showMsvcInstallationPath = supportsMsvcInstallationPath(
    hostPlatform,
    compilerPreference
  );
  const cxxModeGuidance = getCxxModeGuidance(hostSupport);
  const windowsConanGuidance = getWindowsConanCompilerGuidance(
    hostPlatform,
    dependencyBackend,
    compilerPreference
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>도구 정책</CardTitle>
        <CardDescription>
          managed / system 모드와 버전 정책을 GUI에서 직접 조정합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {EDITABLE_TOOL_IDS.map((tool) => {
          const versionGuidance = getToolVersionGuidance(toolStatusDetails?.[tool]);
          const modeOptions = getToolModeOptions(hostSupport, toolPolicies[tool].mode);

          return (
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
                      {modeOptions.map((option) => (
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
                  {versionGuidance && (
                    <p className="text-[11px] text-muted-foreground">{versionGuidance}</p>
                  )}
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
                    {cxxModeGuidance && (
                      <p className="text-[11px] text-muted-foreground">{cxxModeGuidance}</p>
                    )}
                    {windowsConanGuidance && (
                      <p className="text-[11px] text-amber-700">{windowsConanGuidance}</p>
                    )}
                  </div>
                  {showMsvcInstallationPath && (
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="msvc-path">
                        msvc_installation_path
                      </Label>
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
          );
        })}
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import type {
  CppxAction,
  CppxApi,
  LogEntry,
  ProjectConfigPayload,
  RunCommandPayload,
  RunCommandResult,
  ToolStatus
} from "@shared/contracts";
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
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@renderer/components/ui/select";
import { Separator } from "@renderer/components/ui/separator";
import {
  FolderOpen,
  Hammer,
  PackagePlus,
  Play,
  RefreshCcw,
  Terminal
} from "lucide-react";

const initialToolStatus: ToolStatus = {
  cmake: false,
  ninja: false,
  vcpkg: false,
  clangd: false,
  cxx: false
};

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

function toListInput(values: string[]): string {
  return values.join(", ");
}

function fromListInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export default function App() {
  const cppx = (window as unknown as { cppx?: CppxApi }).cppx;
  const [workspace, setWorkspace] = useState("");
  const [projectName, setProjectName] = useState("cppx-app");
  const [dependency, setDependency] = useState("");
  const [preset, setPreset] = useState("debug-x64");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RunCommandResult | null>(null);
  const [toolStatus, setToolStatus] = useState<ToolStatus>(initialToolStatus);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);

  const [cmakeDefinitionsInput, setCmakeDefinitionsInput] = useState("");
  const [cmakeOptionsInput, setCmakeOptionsInput] = useState("");
  const [cmakeIncludesInput, setCmakeIncludesInput] = useState("");
  const [cmakeLinksInput, setCmakeLinksInput] = useState("");

  const toolBadgeVariant = useMemo(
    () => (allToolsReady(toolStatus) ? "success" : "secondary"),
    [toolStatus]
  );

  useEffect(() => {
    if (!cppx) {
      setBridgeError(
        "Electron preload 브리지를 사용할 수 없습니다. main/preload 설정을 확인하세요."
      );
      return;
    }

    void cppx.getDefaultWorkspace().then(setWorkspace);
    void refreshToolStatus(cppx);

    const unsubscribe = cppx.onLog((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 5000) {
          return next.slice(-5000);
        }
        return next;
      });
    });

    const onFocus = () => {
      void refreshToolStatus(cppx);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [cppx]);

  async function refreshToolStatus(api: CppxApi): Promise<void> {
    try {
      const current = await api.getToolStatus();
      setToolStatus(current);
    } catch {
      setToolStatus(initialToolStatus);
    }
  }

  function applyProjectConfig(config: ProjectConfigPayload): void {
    setProjectName(config.name);
    setPreset(config.defaultPreset);
    setCmakeDefinitionsInput(toListInput(config.cmake.compileDefinitions));
    setCmakeOptionsInput(toListInput(config.cmake.compileOptions));
    setCmakeIncludesInput(toListInput(config.cmake.includeDirectories));
    setCmakeLinksInput(toListInput(config.cmake.linkLibraries));
  }

  async function loadProjectConfig(): Promise<void> {
    if (!cppx) {
      return;
    }

    if (!workspace.trim()) {
      setConfigNotice("작업 폴더 경로를 먼저 입력하세요.");
      return;
    }

    setConfigNotice(null);
    try {
      const config = await cppx.getProjectConfig(workspace);
      applyProjectConfig(config);
      setConfigNotice(".cppx/config.toml을 불러왔습니다.");
    } catch (error) {
      setConfigNotice(error instanceof Error ? error.message : "config.toml 불러오기에 실패했습니다.");
    }
  }

  async function saveProjectConfigToWorkspace(): Promise<void> {
    if (!cppx) {
      return;
    }

    if (!workspace.trim()) {
      setConfigNotice("작업 폴더 경로를 먼저 입력하세요.");
      return;
    }

    if (busy) {
      return;
    }

    setBusy(true);
    setConfigNotice(null);

    try {
      const current = await cppx.getProjectConfig(workspace);
      const updated: ProjectConfigPayload = {
        ...current,
        name: projectName.trim() || current.name,
        defaultPreset: preset.trim() || current.defaultPreset,
        cmake: {
          ...current.cmake,
          compileDefinitions: fromListInput(cmakeDefinitionsInput),
          compileOptions: fromListInput(cmakeOptionsInput),
          includeDirectories: fromListInput(cmakeIncludesInput),
          linkLibraries: fromListInput(cmakeLinksInput)
        }
      };

      const saved = await cppx.saveProjectConfig(workspace, updated);
      applyProjectConfig(saved);
      setConfigNotice(".cppx/config.toml에 저장했습니다.");
    } catch (error) {
      setConfigNotice(error instanceof Error ? error.message : "config.toml 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: CppxAction): Promise<void> {
    if (!cppx) {
      setStatus({
        action,
        ok: false,
        code: 1,
        message: "브리지를 사용할 수 없어 명령을 실행할 수 없습니다."
      });
      return;
    }

    if (busy) {
      return;
    }

    await refreshToolStatus(cppx);

    const payload: RunCommandPayload = {
      action,
      workspace,
      projectName,
      dependency,
      preset
    };

    setBusy(true);
    setStatus(null);
    const result = await cppx.runCommand(payload);
    setStatus(result);
    await refreshToolStatus(cppx);
    setBusy(false);
  }

  async function browseWorkspace(): Promise<void> {
    if (!cppx) {
      return;
    }

    const selected = await cppx.selectWorkspace();
    if (selected) {
      setWorkspace(selected);
      setConfigNotice(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-8">
      <section className="rounded-2xl border border-sky-200/60 bg-white/70 p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="default">cppx</Badge>
              <Badge variant={toolBadgeVariant}>
                {allToolsReady(toolStatus) ? "툴체인 준비됨" : "툴체인 누락"}
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Windows용 Cargo 스타일 C++ 워크플로
            </h1>
            <p className="text-sm text-muted-foreground">
              루트 폴더: <code>%LOCALAPPDATA%/cppx</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => cppx && void refreshToolStatus(cppx)}
              disabled={busy || !cppx}
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              상태 새로고침
            </Button>
            <Button
              onClick={() => runAction("install-tools")}
              disabled={busy}
              className="gap-2"
            >
              <PackagePlus className="h-4 w-4" />
              도구 설치 / 업데이트
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>작업 폴더</CardTitle>
              <CardDescription>
                init, add, build, run, test, pack을 실행할 프로젝트 루트
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="workspace">경로</Label>
              <div className="flex gap-2">
                <Input
                  id="workspace"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="C:\\dev\\my-cpp-project"
                />
                <Button
                  variant="secondary"
                  onClick={browseWorkspace}
                  disabled={busy}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  찾아보기
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>프로젝트 설정</CardTitle>
              <CardDescription>
                CMakePresets, vcpkg.json, VSCode tasks/launch를 생성합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">프로젝트 이름</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="cppx-app"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => runAction("init")}
                  disabled={busy}
                >
                  cppx init
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CMake 설정</CardTitle>
              <CardDescription>
                값은 .cppx/config.toml의 [cmake] 섹션에 저장되며 build 시 적용됩니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cmake-definitions">compile_definitions</Label>
                <Input
                  id="cmake-definitions"
                  value={cmakeDefinitionsInput}
                  onChange={(event) => setCmakeDefinitionsInput(event.target.value)}
                  placeholder="USE_SSL, APP_VERSION=1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cmake-options">compile_options</Label>
                <Input
                  id="cmake-options"
                  value={cmakeOptionsInput}
                  onChange={(event) => setCmakeOptionsInput(event.target.value)}
                  placeholder="-Wall, -Wextra"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cmake-includes">include_directories</Label>
                <Input
                  id="cmake-includes"
                  value={cmakeIncludesInput}
                  onChange={(event) => setCmakeIncludesInput(event.target.value)}
                  placeholder="include, third_party/fmt/include"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cmake-links">link_libraries</Label>
                <Input
                  id="cmake-links"
                  value={cmakeLinksInput}
                  onChange={(event) => setCmakeLinksInput(event.target.value)}
                  placeholder="ws2_32, bcrypt"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void loadProjectConfig()}
                  disabled={busy}
                >
                  config 불러오기
                </Button>
                <Button
                  onClick={() => void saveProjectConfigToWorkspace()}
                  disabled={busy}
                >
                  config 저장
                </Button>
              </div>

              {configNotice && (
                <p className="text-sm text-muted-foreground">{configNotice}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>의존성</CardTitle>
              <CardDescription>cppx add로 vcpkg.json에 패키지를 추가합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={dependency}
                  onChange={(event) => setDependency(event.target.value)}
                  placeholder="fmt or boost-asio"
                />
                <Button
                  onClick={() => runAction("add")}
                  disabled={busy}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Build / Run / Test / Pack</CardTitle>
              <CardDescription>
                빌드 명령 예시: <code>cppx build --preset debug-x64</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>프리셋</Label>
                <Select
                  value={preset}
                  onValueChange={setPreset}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="프리셋 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug-x64">debug-x64</SelectItem>
                    <SelectItem value="release-x64">release-x64</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="default"
                  onClick={() => runAction("build")}
                  disabled={busy}
                  className="gap-2"
                >
                  <Hammer className="h-4 w-4" />
                  Build
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => runAction("run")}
                  disabled={busy}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Run
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAction("test")}
                  disabled={busy}
                >
                  Test
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runAction("pack")}
                  disabled={busy}
                >
                  Pack
                </Button>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <p className="font-medium">설치된 도구</p>
                <div className="flex flex-wrap gap-2">
                  <ToolChip
                    name="CMake"
                    ready={toolStatus.cmake}
                  />
                  <ToolChip
                    name="Ninja"
                    ready={toolStatus.ninja}
                  />
                  <ToolChip
                    name="vcpkg"
                    ready={toolStatus.vcpkg}
                  />
                  <ToolChip
                    name="clangd"
                    ready={toolStatus.clangd}
                  />
                  <ToolChip
                    name="C++ 컴파일러"
                    ready={toolStatus.cxx}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="h-[430px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    로그
                  </CardTitle>
                  <CardDescription>child_process.spawn 실시간 로그</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogs([])}
                  disabled={busy}
                >
                  지우기
                </Button>
              </div>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ScrollArea className="h-full rounded-md border bg-slate-50/70 p-3 font-mono text-xs">
                <div className="space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">아직 로그가 없습니다.</p>
                  ) : (
                    logs.map((entry) => (
                      <p
                        key={entry.id}
                        className={levelClass(entry.level)}
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
        </div>
      </section>

      {status && (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {status.message}
        </section>
      )}

      {bridgeError && (
        <section className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {bridgeError}
        </section>
      )}
    </main>
  );
}

function allToolsReady(status: ToolStatus): boolean {
  return status.cmake && status.ninja && status.vcpkg && status.clangd && status.cxx;
}

function ToolChip({
  name,
  ready
}: {
  name: string;
  ready: boolean;
}) {
  return (
    <Badge variant={ready ? "success" : "secondary"}>
      {name} {ready ? "준비됨" : "누락"}
    </Badge>
  );
}

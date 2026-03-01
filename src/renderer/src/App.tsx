import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompilerScanResult,
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
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Hammer,
  Loader2,
  PackagePlus,
  Play,
  RefreshCcw,
  Terminal,
  Wrench,
  type LucideIcon
} from "lucide-react";

const initialToolStatus: ToolStatus = {
  cmake: false,
  ninja: false,
  vcpkg: false,
  cxx: false
};

type ViewId = "workspace" | "build" | "logs";
type InstallToolKey = "cmake" | "ninja" | "vcpkg" | "cxx";
type InstallProgressStatus = "idle" | "running" | "success" | "error";
type InitButtonStatus = "idle" | "running" | "success" | "error";
type InstallButtonStatus = "idle" | "running" | "success" | "error";
type StatusToastTone = "info" | "success" | "error";
type CompilerChoiceDecision =
  | { kind: "msvc"; installationPath: string }
  | { kind: "mingw" }
  | { kind: "close" };

interface StatusToastState {
  message: string;
  tone: StatusToastTone;
  visible: boolean;
}

interface InstallToolProgress {
  percent: number;
  status: InstallProgressStatus;
}

interface InstallProgressState {
  status: InstallProgressStatus;
  stage: string;
  percent: number;
  completed: Record<InstallToolKey, boolean>;
  tools: Record<InstallToolKey, InstallToolProgress>;
}

interface CompilerChoiceDialogState {
  open: boolean;
  scan: CompilerScanResult | null;
}

const viewItems: {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "workspace", label: "탐색", icon: FolderOpen },
  { id: "build", label: "빌드", icon: Hammer },
  { id: "logs", label: "로그", icon: Terminal }
];

const INSTALL_TOOL_ORDER: InstallToolKey[] = ["cmake", "ninja", "vcpkg", "cxx"];

const INSTALL_TOOL_DONE_PATTERNS: Record<InstallToolKey, string[]> = {
  cmake: ["cmake 설치됨", "cmake 이미 설치됨"],
  ninja: ["ninja 설치됨", "ninja 이미 설치됨"],
  vcpkg: ["vcpkg 설치됨"],
  cxx: ["cxx 설치됨", "cxx 이미 설치됨"]
};

function createEmptyInstallCompleted(): Record<InstallToolKey, boolean> {
  return {
    cmake: false,
    ninja: false,
    vcpkg: false,
    cxx: false
  };
}

function createEmptyInstallToolProgress(): Record<InstallToolKey, InstallToolProgress> {
  return {
    cmake: { percent: 0, status: "idle" },
    ninja: { percent: 0, status: "idle" },
    vcpkg: { percent: 0, status: "idle" },
    cxx: { percent: 0, status: "idle" }
  };
}

function createInitialInstallProgress(): InstallProgressState {
  return {
    status: "idle",
    stage: "설치 대기 중",
    percent: 0,
    completed: createEmptyInstallCompleted(),
    tools: createEmptyInstallToolProgress()
  };
}

function installPercentFromCompleted(count: number): number {
  return Math.min(95, 8 + count * 17);
}

function findInstallStage(message: string): string | null {
  if (message.includes("'install-tools' 시작")) return "도구 설치를 시작합니다";
  if (message.includes("MSVC 컴파일러 사용을 시도합니다")) return "MSVC 컴파일러 감지 중";
  if (message.includes("llvm-mingw 기반 C++ 컴파일러를 설치합니다")) return "MinGW 컴파일러 설치 준비 중";
  if (message.includes("다운로드 중")) return "패키지 다운로드 중";
  if (message.includes("Expand-Archive")) return "압축 해제 중";
  if (message.includes("git clone")) return "vcpkg 저장소 클론 중";
  if (message.includes("git pull")) return "vcpkg 업데이트 중";
  if (message.includes("bootstrap-vcpkg.bat")) return "vcpkg 부트스트랩 중";
  if (message.includes("llvm-mingw 컴파일러 패키지 조회 중")) return "C++ 컴파일러 릴리스 조회 중";
  if (message.includes("캐시된 아카이브 사용")) return "캐시된 설치 파일 사용 중";
  if (message.includes("이미 설치됨")) return "기존 설치 감지, 상태 갱신 중";
  if (message.includes("'install-tools' 완료")) return "도구 설치가 완료되었습니다";
  return null;
}

function getInstallCompletedCount(completed: Record<InstallToolKey, boolean>): number {
  return INSTALL_TOOL_ORDER.filter((tool) => completed[tool]).length;
}

function cloneInstallToolProgress(
  tools: Record<InstallToolKey, InstallToolProgress>
): Record<InstallToolKey, InstallToolProgress> {
  return {
    cmake: { ...tools.cmake },
    ninja: { ...tools.ninja },
    vcpkg: { ...tools.vcpkg },
    cxx: { ...tools.cxx }
  };
}

function markToolProgress(
  next: InstallProgressState,
  tool: InstallToolKey,
  percent: number,
  status: InstallProgressStatus = "running"
): void {
  const current = next.tools[tool];
  next.tools[tool] = {
    percent: Math.max(current.percent, Math.min(100, percent)),
    status:
      current.status === "success" && status !== "error"
        ? "success"
        : status
  };
}

function completeToolProgress(next: InstallProgressState, tool: InstallToolKey): void {
  next.completed[tool] = true;
  next.tools[tool] = { percent: 100, status: "success" };
}

function inferInstallToolFromMessage(message: string): InstallToolKey | null {
  const lower = message.toLowerCase();

  const archiveMatch = lower.match(/(cmake|ninja|cxx)-[a-z0-9._-]+\.zip/);
  if (archiveMatch) {
    const archiveTool = archiveMatch[1];
    if (archiveTool === "cmake" || archiveTool === "ninja" || archiveTool === "cxx") {
      return archiveTool;
    }
  }

  if (lower.includes("cmake")) return "cmake";
  if (lower.includes("ninja")) return "ninja";
  if (lower.includes("vcpkg")) return "vcpkg";
  if (
    lower.includes("llvm-mingw") ||
    lower.includes("cxx") ||
    lower.includes("msvc") ||
    lower.includes("cl.exe")
  ) {
    return "cxx";
  }

  return null;
}

function updateInstallProgressFromLog(
  previous: InstallProgressState,
  entry: LogEntry
): InstallProgressState {
  if (entry.action !== "install-tools") {
    return previous;
  }

  const message = entry.message;
  const toolFromMessage = inferInstallToolFromMessage(message);

  let next: InstallProgressState = {
    ...previous,
    completed: { ...previous.completed },
    tools: cloneInstallToolProgress(previous.tools)
  };

  if (message.includes("'install-tools' 시작")) {
    next = {
      status: "running",
      stage: "도구 설치를 시작합니다",
      percent: Math.max(previous.percent, 4),
      completed: createEmptyInstallCompleted(),
      tools: createEmptyInstallToolProgress()
    };
  }

  const stage = findInstallStage(message);
  if (stage) {
    next.stage = stage;
  }

  if (message.includes("다운로드 중")) {
    if (toolFromMessage) {
      markToolProgress(next, toolFromMessage, 40);
    }
  }
  if (message.includes("캐시된 아카이브 사용")) {
    if (toolFromMessage) {
      markToolProgress(next, toolFromMessage, 52);
    }
  }
  if (message.includes("Expand-Archive")) {
    if (toolFromMessage) {
      markToolProgress(next, toolFromMessage, 78);
    }
  }
  if (message.includes("git clone")) {
    markToolProgress(next, "vcpkg", 36);
  }
  if (message.includes("git pull")) {
    markToolProgress(next, "vcpkg", 42);
  }
  if (message.includes("bootstrap-vcpkg.bat")) {
    markToolProgress(next, "vcpkg", 76);
  }
  if (message.includes("llvm-mingw 컴파일러 패키지 조회 중")) {
    markToolProgress(next, "cxx", 18);
  }
  if (message.includes("llvm-mingw 릴리스 사용")) {
    markToolProgress(next, "cxx", 30);
  }
  if (message.includes("MSVC 컴파일러 사용을 시도합니다")) {
    markToolProgress(next, "cxx", 26);
  }

  for (const tool of INSTALL_TOOL_ORDER) {
    if (next.completed[tool]) {
      continue;
    }
    const done = INSTALL_TOOL_DONE_PATTERNS[tool].some((pattern) =>
      message.includes(pattern)
    );
    if (done) {
      completeToolProgress(next, tool);
    }
  }

  const completedCount = getInstallCompletedCount(next.completed);
  if (next.status === "running") {
    next.percent = Math.max(next.percent, installPercentFromCompleted(completedCount));
  }

  if (entry.level === "error") {
    next.status = "error";
    next.stage = message;
    const targetTool =
      toolFromMessage ??
      INSTALL_TOOL_ORDER.find((tool) => next.tools[tool].status === "running") ??
      INSTALL_TOOL_ORDER.find((tool) => !next.completed[tool]) ??
      null;
    if (targetTool) {
      next.tools[targetTool] = {
        percent: Math.max(next.tools[targetTool].percent, 10),
        status: "error"
      };
    }
  }

  if (message.includes("'install-tools' 완료")) {
    next.status = "success";
    next.percent = 100;
    for (const tool of INSTALL_TOOL_ORDER) {
      if (!next.completed[tool]) {
        completeToolProgress(next, tool);
      }
    }
  }

  return next;
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

function toListInput(values: string[]): string {
  return values.join(", ");
}

function fromListInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}

function getInitButtonText(status: InitButtonStatus): string {
  switch (status) {
    case "running":
      return "초기화 중...";
    case "success":
      return "초기화 완료";
    case "error":
      return "초기화 실패";
    default:
      return "cppx init";
  }
}

function getInitButtonClassName(status: InitButtonStatus): string {
  switch (status) {
    case "running":
      return "w-full justify-center gap-2 border-amber-500 bg-amber-500 text-white hover:bg-amber-500/90";
    case "success":
      return "w-full justify-center gap-2 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90";
    case "error":
      return "w-full justify-center gap-2 border-red-600 bg-red-600 text-white hover:bg-red-600/90";
    default:
      return "w-full justify-center gap-2";
  }
}

function getInstallButtonText(
  status: InstallButtonStatus,
  stage: string
): string {
  switch (status) {
    case "running":
      return stage.trim().length > 0 ? stage : "도구 설치 중...";
    case "success":
      return "도구 설치 완료";
    case "error":
      return "도구 설치 실패";
    default:
      return "설치 / 업데이트 실행";
  }
}

function getInstallButtonClassName(status: InstallButtonStatus): string {
  switch (status) {
    case "running":
      return "w-full justify-center gap-2 border-amber-500 bg-amber-500 text-white hover:bg-amber-500/90";
    case "success":
      return "w-full justify-center gap-2 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90";
    case "error":
      return "w-full justify-center gap-2 border-red-600 bg-red-600 text-white hover:bg-red-600/90";
    default:
      return "w-full justify-center gap-2";
  }
}

function getStatusToastClassName(tone: StatusToastTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-300/45 bg-emerald-500/70 text-emerald-50";
    case "error":
      return "border-red-300/45 bg-red-500/70 text-red-50";
    default:
      return "border-slate-300/45 bg-slate-900/80 text-slate-100";
  }
}

export default function App() {
  const cppx = (window as unknown as { cppx?: CppxApi }).cppx;
  const [defaultRootPath, setDefaultRootPath] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [projectName, setProjectName] = useState("");
  const [dependency, setDependency] = useState("");
  const [projectDependencies, setProjectDependencies] = useState<string[]>([]);
  const [preset, setPreset] = useState("debug-x64");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RunCommandResult | null>(null);
  const [toolStatus, setToolStatus] = useState<ToolStatus>(initialToolStatus);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("workspace");
  const [installProgress, setInstallProgress] = useState<InstallProgressState>(
    createInitialInstallProgress()
  );
  const [initButtonStatus, setInitButtonStatus] = useState<InitButtonStatus>("idle");
  const [installButtonStatus, setInstallButtonStatus] = useState<InstallButtonStatus>("idle");
  const [statusToast, setStatusToast] = useState<StatusToastState | null>(null);
  const [compilerChoiceDialog, setCompilerChoiceDialog] = useState<CompilerChoiceDialogState>({
    open: false,
    scan: null
  });
  const compilerChoiceResolverRef = useRef<((choice: CompilerChoiceDecision) => void) | null>(
    null
  );
  const initButtonResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const installButtonResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusToastFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusToastClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsScrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [cmakeDefinitionsInput, setCmakeDefinitionsInput] = useState("");
  const [cmakeOptionsInput, setCmakeOptionsInput] = useState("");
  const [cmakeIncludesInput, setCmakeIncludesInput] = useState("");
  const [cmakeLinksInput, setCmakeLinksInput] = useState("");

  const activeViewLabel = useMemo(
    () => viewItems.find((item) => item.id === activeView)?.label ?? "",
    [activeView]
  );

  const readyToolCount = useMemo(() => {
    const items = [
      toolStatus.cmake,
      toolStatus.ninja,
      toolStatus.vcpkg,
      toolStatus.cxx
    ];
    return items.filter(Boolean).length;
  }, [toolStatus]);

  function clearInitButtonResetTimer(): void {
    if (initButtonResetTimerRef.current) {
      clearTimeout(initButtonResetTimerRef.current);
      initButtonResetTimerRef.current = null;
    }
  }

  function clearInstallButtonResetTimer(): void {
    if (installButtonResetTimerRef.current) {
      clearTimeout(installButtonResetTimerRef.current);
      installButtonResetTimerRef.current = null;
    }
  }

  function scheduleInitButtonReset(): void {
    clearInitButtonResetTimer();
    initButtonResetTimerRef.current = setTimeout(() => {
      setInitButtonStatus("idle");
      initButtonResetTimerRef.current = null;
    }, 1800);
  }

  function scheduleInstallButtonReset(): void {
    clearInstallButtonResetTimer();
    installButtonResetTimerRef.current = setTimeout(() => {
      setInstallButtonStatus("idle");
      installButtonResetTimerRef.current = null;
    }, 1800);
  }

  function clearStatusToastTimers(): void {
    if (statusToastFadeTimerRef.current) {
      clearTimeout(statusToastFadeTimerRef.current);
      statusToastFadeTimerRef.current = null;
    }
    if (statusToastClearTimerRef.current) {
      clearTimeout(statusToastClearTimerRef.current);
      statusToastClearTimerRef.current = null;
    }
  }

  function showStatusToast(message: string, tone: StatusToastTone): void {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    clearStatusToastTimers();
    setStatusToast({
      message: trimmed,
      tone,
      visible: true
    });

    statusToastFadeTimerRef.current = setTimeout(() => {
      setStatusToast((prev) => (prev ? { ...prev, visible: false } : null));
      statusToastFadeTimerRef.current = null;
    }, 1800);

    statusToastClearTimerRef.current = setTimeout(() => {
      setStatusToast(null);
      statusToastClearTimerRef.current = null;
    }, 2200);
  }

  function closeCompilerChoiceDialog(choice: CompilerChoiceDecision): void {
    const resolver = compilerChoiceResolverRef.current;
    compilerChoiceResolverRef.current = null;
    setCompilerChoiceDialog({ open: false, scan: null });
    resolver?.(choice);
  }

  function requestCompilerChoiceDialog(scan: CompilerScanResult): Promise<CompilerChoiceDecision> {
    return new Promise((resolve) => {
      compilerChoiceResolverRef.current = resolve;
      setCompilerChoiceDialog({ open: true, scan });
    });
  }

  useEffect(() => {
    if (!cppx) {
      setBridgeError(
        "Electron preload 브리지를 사용할 수 없습니다. main/preload 설정을 확인하세요."
      );
      return () => {
        clearInitButtonResetTimer();
        clearInstallButtonResetTimer();
        clearStatusToastTimers();
      };
    }
    setBridgeError(null);

    void cppx.getCppxRoot()
      .then(setDefaultRootPath)
      .catch(() => setDefaultRootPath(""));

    void cppx.getDefaultWorkspace().then((defaultWorkspace) => {
      setWorkspace(defaultWorkspace);
      void refreshProjectDependencies(cppx, defaultWorkspace);
    });
    void refreshToolStatus(cppx);

    const unsubscribe = cppx.onLog((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 5000) {
          return next.slice(-5000);
        }
        return next;
      });

      if (entry.action === "install-tools") {
        setInstallProgress((prev) => updateInstallProgressFromLog(prev, entry));
      }
    });

    const onFocus = () => {
      void refreshToolStatus(cppx);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInitButtonResetTimer();
      clearInstallButtonResetTimer();
      clearStatusToastTimers();
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [cppx]);

  useEffect(() => {
    if (!status) {
      return;
    }
    showStatusToast(status.message, status.ok ? "success" : "error");
  }, [status]);

  useEffect(() => {
    if (!bridgeError) {
      return;
    }
    showStatusToast(bridgeError, "error");
  }, [bridgeError]);

  useEffect(() => {
    return () => {
      if (compilerChoiceResolverRef.current) {
        compilerChoiceResolverRef.current({ kind: "close" });
        compilerChoiceResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeView !== "logs") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const root = logsScrollAreaRef.current;
      if (!root) {
        return;
      }
      const viewport = root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
      if (!viewport) {
        return;
      }
      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeView, logs.length]);

  async function refreshToolStatus(api: CppxApi): Promise<void> {
    try {
      const current = await api.getToolStatus();
      setToolStatus(current);
    } catch {
      setToolStatus(initialToolStatus);
    }
  }

  async function refreshProjectDependencies(
    api: CppxApi,
    workspacePath: string
  ): Promise<void> {
    const path = workspacePath.trim();
    if (!path) {
      setProjectDependencies([]);
      return;
    }

    try {
      const config = await api.getProjectConfig(path);
      setProjectDependencies(config.dependencies);
      setProjectName(config.name);
    } catch {
      setProjectDependencies([]);
    }
  }

  function applyProjectConfig(config: ProjectConfigPayload): void {
    setProjectName(config.name);
    setPreset(config.defaultPreset);
    setProjectDependencies(config.dependencies);
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

    if (busy || compilerChoiceDialog.open) {
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

    if (busy || compilerChoiceDialog.open) {
      return;
    }

    await refreshToolStatus(cppx);

    let compilerPreference: RunCommandPayload["compilerPreference"];
    let msvcInstallationPath: RunCommandPayload["msvcInstallationPath"];
    if (action === "install-tools") {
      try {
        const scan = await cppx.getCompilerScan();
        if (scan.msvcAvailable) {
          const choice = await requestCompilerChoiceDialog(scan);
          if (choice.kind === "close") {
            showStatusToast("도구 설치를 취소했습니다.", "info");
            return;
          }
          if (choice.kind === "msvc") {
            compilerPreference = "msvc";
            msvcInstallationPath = choice.installationPath;
          } else {
            compilerPreference = "mingw";
          }
          showStatusToast(
            compilerPreference === "msvc"
              ? "MSVC 기준으로 도구 설치를 진행합니다."
              : "MinGW 기준으로 도구 설치를 진행합니다.",
            "info"
          );
        } else {
          compilerPreference = "mingw";
          showStatusToast("MSVC가 감지되지 않아 MinGW 설치를 진행합니다.", "info");
        }
      } catch {
        compilerPreference = "mingw";
      }
    }

    const payload: RunCommandPayload = {
      action,
      workspace,
      projectName,
      dependency,
      preset,
      compilerPreference,
      msvcInstallationPath
    };

    setBusy(true);
    setStatus(null);
    if (action === "init") {
      clearInitButtonResetTimer();
      setInitButtonStatus("running");
    }
    if (action === "install-tools") {
      clearInstallButtonResetTimer();
      setInstallButtonStatus("running");
      const initialTools = createEmptyInstallToolProgress();
      initialTools.cmake = { percent: 6, status: "running" };
      setInstallProgress({
        status: "running",
        stage:
          compilerPreference === "msvc"
            ? "도구 설치를 시작합니다 (컴파일러: MSVC)"
            : "도구 설치를 시작합니다 (컴파일러: MinGW)",
        percent: 4,
        completed: createEmptyInstallCompleted(),
        tools: initialTools
      });
    }

    try {
      const result = await cppx.runCommand(payload);
      setStatus(result);

      if (action === "init" && result.ok && result.workspace) {
        setWorkspace(result.workspace);
        await refreshProjectDependencies(cppx, result.workspace);
      }

      if (action === "add" && result.ok) {
        await refreshProjectDependencies(cppx, workspace);
      }

      if (action === "init") {
        setInitButtonStatus(result.ok ? "success" : "error");
        scheduleInitButtonReset();
      }

      if (action === "install-tools") {
        setInstallProgress((prev) => ({
          ...prev,
          status: result.ok ? "success" : "error",
          stage: result.ok ? "도구 설치가 완료되었습니다" : `설치 실패: ${result.message}`,
          percent: result.ok ? 100 : Math.max(prev.percent, 8),
          completed: result.ok
            ? {
                cmake: true,
                ninja: true,
                vcpkg: true,
                cxx: true
              }
            : prev.completed,
          tools: result.ok
            ? {
                cmake: { percent: 100, status: "success" },
                ninja: { percent: 100, status: "success" },
                vcpkg: { percent: 100, status: "success" },
                cxx: { percent: 100, status: "success" }
              }
            : prev.tools
        }));
        setInstallButtonStatus(result.ok ? "success" : "error");
        scheduleInstallButtonReset();
      }
    } catch (error) {
      const message = toErrorMessage(error);
      setStatus({
        action,
        ok: false,
        code: 1,
        message
      });

      if (action === "init") {
        setInitButtonStatus("error");
        scheduleInitButtonReset();
      }

      if (action === "install-tools") {
        setInstallProgress((prev) => ({
          ...prev,
          status: "error",
          stage: `설치 실패: ${message}`,
          percent: Math.max(prev.percent, 8)
        }));
        setInstallButtonStatus("error");
        scheduleInstallButtonReset();
      }
    } finally {
      await refreshToolStatus(cppx);
      setBusy(false);
    }
  }

  async function browseWorkspace(): Promise<void> {
    if (!cppx) {
      return;
    }

    const selected = await cppx.selectWorkspace();
    if (selected) {
      setWorkspace(selected);
      setConfigNotice(null);
      void refreshProjectDependencies(cppx, selected);
    }
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <main className="relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-3 px-3 py-3 sm:px-4 md:px-6">
      <section className="rounded-[calc(var(--radius)+2px)] border border-border bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--muted)/0.46)_100%)] p-4 shadow-[0_1px_2px_hsl(222_47%_11%_/_0.05),0_10px_28px_hsl(222_47%_11%_/_0.07)] md:p-5">
        <div className="space-y-2">
          <div className="space-y-2">
            <Badge className="uppercase tracking-[0.08em]">cppx</Badge>
            <h1 className="text-[clamp(1.5rem,0.95vw+1.1rem,2rem)] font-bold tracking-tight">
              Windows용 Cargo 스타일 C++ 워크플로
            </h1>
            <p className="break-all text-xs text-muted-foreground">
              루트 폴더: <code className="font-mono">{defaultRootPath || "불러오는 중..."}</code>
            </p>
            <p className="text-xs text-muted-foreground">
              현재 탭: <span className="font-medium text-foreground">{activeViewLabel}</span>
            </p>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
          <p
            className="truncate rounded-[10px] border border-border/70 bg-secondary/60 px-3 py-2"
            title={workspace || "작업 폴더 미지정"}
          >
            작업 폴더: {workspace || "미지정"}
          </p>
          <p className="rounded-[10px] border border-border/70 bg-secondary/60 px-3 py-2">
            기본 프리셋: <span className="font-mono">{preset}</span>
          </p>
        </div>

      </section>

      <section className="grid gap-4 md:grid-cols-[116px_minmax(0,1fr)]">
        <Card className="h-fit md:sticky md:top-4">
          <CardContent className="p-2">
            <nav className="grid grid-cols-3 gap-1.5 md:grid-cols-1">
              {viewItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={() => setActiveView(item.id)}
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border px-2 text-xs font-medium leading-none transition-colors md:justify-start md:px-3 ${
                      isActive
                        ? "border-ring bg-accent/70 text-foreground"
                        : "border-border bg-secondary/45 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden truncate md:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {activeView === "workspace" && (
            <section className="min-w-0 space-y-3">
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>프로젝트 탐색</CardTitle>
                    <CardDescription>
                      init, build, run, test, pack을 실행할 프로젝트 루트 경로
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Label htmlFor="workspace">작업 폴더 경로</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="workspace"
                        value={workspace}
                        onChange={(event) => setWorkspace(event.target.value)}
                        placeholder="C:\\dev\\my-cpp-project"
                        className="sm:min-w-0 sm:flex-1"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => void browseWorkspace()}
                        disabled={busy}
                        className="gap-2 sm:shrink-0"
                      >
                        <FolderOpen className="h-4 w-4" />
                        찾아보기
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>프로젝트 생성/초기화</CardTitle>
                    <CardDescription>
                      CMakePresets, vcpkg.json, VSCode tasks/launch 템플릿 생성
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="projectName">프로젝트 이름</Label>
                      <Input
                        id="projectName"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder="미기재 시 작업 폴더명을 프로젝트 이름으로 사용"
                      />
                    </div>
                    <Button
                      onClick={() => void runAction("init")}
                      disabled={busy}
                      className={getInitButtonClassName(initButtonStatus)}
                    >
                      <Wrench className={`h-4 w-4 ${initButtonStatus === "running" ? "animate-spin" : ""}`} />
                      {getInitButtonText(initButtonStatus)}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>CMake 설정</CardTitle>
                    <CardDescription>
                      .cppx/config.toml의 [cmake] 설정을 읽고 저장합니다
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="cmake-definitions">compile_definitions</Label>
                        <Input
                          id="cmake-definitions"
                          value={cmakeDefinitionsInput}
                          onChange={(event) => setCmakeDefinitionsInput(event.target.value)}
                          placeholder="USE_SSL, APP_VERSION=1"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="cmake-options">compile_options</Label>
                        <Input
                          id="cmake-options"
                          value={cmakeOptionsInput}
                          onChange={(event) => setCmakeOptionsInput(event.target.value)}
                          placeholder="-Wall, -Wextra"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="cmake-includes">include_directories</Label>
                        <Input
                          id="cmake-includes"
                          value={cmakeIncludesInput}
                          onChange={(event) => setCmakeIncludesInput(event.target.value)}
                          placeholder="include, third_party/fmt/include"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="cmake-links">link_libraries</Label>
                        <Input
                          id="cmake-links"
                          value={cmakeLinksInput}
                          onChange={(event) => setCmakeLinksInput(event.target.value)}
                          placeholder="ws2_32, bcrypt"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={() => void saveProjectConfigToWorkspace()}
                        disabled={busy}
                      >
                        config 저장
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void loadProjectConfig()}
                        disabled={busy}
                      >
                        config 불러오기
                      </Button>
                    </div>
                    {configNotice && (
                      <p className="rounded-[10px] border border-border/70 bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                        {configNotice}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>의존성 추가</CardTitle>
                    <CardDescription>cppx add로 vcpkg.json 패키지를 등록합니다</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="dependency-name">패키지 이름</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="dependency-name"
                        value={dependency}
                        onChange={(event) => setDependency(event.target.value)}
                        placeholder="fmt or boost-asio"
                        className="sm:min-w-0 sm:flex-1"
                      />
                      <Button
                        onClick={() => void runAction("add")}
                        disabled={busy}
                        className="sm:min-w-24 sm:shrink-0"
                      >
                        Add
                      </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-muted-foreground">현재 추가된 의존성</Label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cppx && void refreshProjectDependencies(cppx, workspace)}
                          disabled={busy || !cppx || !workspace.trim()}
                        >
                          목록 새로고침
                        </Button>
                      </div>
                      {projectDependencies.length === 0 ? (
                        <p className="rounded-[10px] border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
                          등록된 의존성이 없습니다.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-border/70 bg-secondary/40 p-2">
                          {projectDependencies.map((name, index) => (
                            <Badge
                              key={`${name}-${index}`}
                              variant="secondary"
                              className="text-[11px]"
                            >
                              {name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {activeView === "build" && (
            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Build / Run / Test / Pack</CardTitle>
                  <CardDescription>
                    빌드 명령 예시: <code className="font-mono">cppx build --preset debug-x64</code>
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
                      variant="secondary"
                      onClick={() => void runAction("run")}
                      disabled={busy}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Run
                    </Button>
                    <Button
                      onClick={() => void runAction("build")}
                      disabled={busy}
                      className="gap-2"
                    >
                      <Hammer className="h-4 w-4" />
                      Build
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void runAction("test")}
                      disabled={busy}
                    >
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void runAction("pack")}
                      disabled={busy}
                    >
                      Pack
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>툴체인 상태</CardTitle>
                  <CardDescription>
                    명령 실행 전 필수 도구 설치 여부를 확인합니다 ({readyToolCount}/{INSTALL_TOOL_ORDER.length} 준비됨)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <ToolStatusRow
                      name="CMake"
                      ready={toolStatus.cmake}
                      progress={installProgress.tools.cmake}
                      showProgress={installProgress.status !== "idle"}
                    />
                    <ToolStatusRow
                      name="Ninja"
                      ready={toolStatus.ninja}
                      progress={installProgress.tools.ninja}
                      showProgress={installProgress.status !== "idle"}
                    />
                    <ToolStatusRow
                      name="vcpkg"
                      ready={toolStatus.vcpkg}
                      progress={installProgress.tools.vcpkg}
                      showProgress={installProgress.status !== "idle"}
                    />
                    <ToolStatusRow
                      name="C++ 컴파일러"
                      ready={toolStatus.cxx}
                      progress={installProgress.tools.cxx}
                      showProgress={installProgress.status !== "idle"}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      className={getInstallButtonClassName(installButtonStatus)}
                      onClick={() => void runAction("install-tools")}
                      disabled={busy}
                    >
                      {installButtonStatus === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PackagePlus className="h-4 w-4" />
                      )}
                      <span className="truncate">
                        {getInstallButtonText(installButtonStatus, installProgress.stage)}
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full justify-center gap-2"
                      onClick={() => cppx && void refreshToolStatus(cppx)}
                      disabled={busy || !cppx}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      툴체인 다시 검사
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    도구 누락 상태에서는 <code className="font-mono">install-tools</code>를 먼저 실행하는 것이 안전합니다.
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {activeView === "logs" && (
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLogs([])}
                        disabled={busy}
                      >
                        지우기
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1">
                  <ScrollArea
                    ref={logsScrollAreaRef}
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
          )}
        </div>
      </section>
      </main>
      {compilerChoiceDialog.open && compilerChoiceDialog.scan && (
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
                  {compilerChoiceDialog.scan.msvcCandidates.map((candidate) => (
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
                        onClick={() =>
                          closeCompilerChoiceDialog({
                            kind: "msvc",
                            installationPath: candidate.installationPath
                          })
                        }
                      >
                        설치
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => closeCompilerChoiceDialog({ kind: "mingw" })}
                >
                  MinGW 설치
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => closeCompilerChoiceDialog({ kind: "close" })}
                >
                  닫기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {statusToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div
            className={`max-w-[min(92vw,720px)] rounded-[10px] border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-all duration-300 ${getStatusToastClassName(
              statusToast.tone
            )} ${statusToast.visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            {statusToast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function getInstallToolStatusText(status: InstallProgressStatus): string {
  switch (status) {
    case "running":
      return "설치 중";
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
  progress,
  showProgress = false
}: {
  name: string;
  ready: boolean;
  progress?: InstallToolProgress;
  showProgress?: boolean;
}) {
  const percent = progress
    ? Math.max(0, Math.min(100, Math.trunc(progress.percent)))
    : 0;

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border/70 bg-secondary/35 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        )}
        <span className="truncate text-sm font-medium">{name}</span>
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

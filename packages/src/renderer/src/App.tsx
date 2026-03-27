import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompilerPreference,
  CompilerScanResult,
  CppxAction,
  CppxApi,
  DependencyBackend,
  HostDefaultsPayload,
  HostPlatformPayload,
  HostSupportPayload,
  LogEntry,
  PresetConfigPayload,
  ProjectConfigPayload,
  ProjectToolPoliciesPayload,
  RunCommandPayload,
  RunCommandResult,
  ToolLifecycleCapabilities,
  ToolStatus
} from "@shared/contracts";
import {
  BuildActionPanel
} from "@renderer/components/cppx/build-action-panel";
import {
  CompilerChoiceDialog
} from "@renderer/components/cppx/compiler-choice-dialog";
import {
  getCompilerPreferenceLabel,
  getCompilerPreferenceOptions
} from "@shared/compiler-display";
import { LogsPanel } from "@renderer/components/cppx/logs-panel";
import { PresetMatrixCard } from "@renderer/components/cppx/preset-matrix-card";
import { ToolPolicyCard } from "@renderer/components/cppx/tool-policy-card";
import { ToolchainStatusCard } from "@renderer/components/cppx/toolchain-status-card";
import {
  getDefaultCompilerPreference,
  INSTALL_TOOL_ORDER,
  supportsMsvcInstallationPath,
  type EditableToolId,
  type InstallProgressStatus,
  type InstallToolKey,
  type InstallToolProgress
} from "@renderer/components/cppx/tooling";
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
import { Separator } from "@renderer/components/ui/separator";
import {
  FolderOpen,
  Hammer,
  Terminal,
  Wrench,
  type LucideIcon
} from "lucide-react";

const initialToolStatus: ToolStatus = {
  cmake: false,
  ninja: false,
  vcpkg: false,
  conan: false,
  cxx: false
};

type ViewId = "workspace" | "build" | "logs";
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

const dependencyBackendOptions: { value: DependencyBackend; label: string }[] = [
  { value: "vcpkg", label: "vcpkg" },
  { value: "conan", label: "conan" },
  { value: "none", label: "none" }
];

const INSTALL_TOOL_DONE_PATTERNS: Record<InstallToolKey, string[]> = {
  cmake: ["cmake 설치됨", "cmake 이미 설치됨"],
  ninja: ["ninja 설치됨", "ninja 이미 설치됨"],
  vcpkg: ["vcpkg 설치됨"],
  conan: ["conan 설치됨", "conan 이미 설치됨"],
  cxx: ["cxx 설치됨", "cxx 이미 설치됨"]
};

function createEmptyInstallCompleted(): Record<InstallToolKey, boolean> {
  return {
    cmake: false,
    ninja: false,
    vcpkg: false,
    conan: false,
    cxx: false
  };
}

function createEmptyInstallToolProgress(): Record<InstallToolKey, InstallToolProgress> {
  return {
    cmake: { percent: 0, status: "idle" },
    ninja: { percent: 0, status: "idle" },
    vcpkg: { percent: 0, status: "idle" },
    conan: { percent: 0, status: "idle" },
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
  if (message.includes("Homebrew llvm 기반 C++ 컴파일러를 설치합니다")) return "Homebrew LLVM 설치 준비 중";
  if (message.includes("llvm-mingw 기반 C++ 컴파일러를 설치합니다")) return "MinGW 컴파일러 설치 준비 중";
  if (message.includes("다운로드 중")) return "패키지 다운로드 중";
  if (message.includes("Expand-Archive")) return "압축 해제 중";
  if (message.includes("bootstrap-vcpkg.bat")) return "vcpkg 부트스트랩 중";
  if (message.includes("bootstrap-vcpkg.sh")) return "vcpkg 부트스트랩 중";
  if (message.includes("brew install")) return "Homebrew formula 설치 중";
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
    conan: { ...tools.conan },
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
  if (lower.includes("conan")) return "conan";
  if (
    lower.includes("llvm-mingw") ||
    lower.includes("brew install llvm") ||
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
  if (message.includes("bootstrap-vcpkg.bat")) {
    markToolProgress(next, "vcpkg", 76);
  }
  if (message.includes("bootstrap-vcpkg.sh")) {
    markToolProgress(next, "vcpkg", 76);
  }
  if (message.includes("brew install")) {
    if (toolFromMessage) {
      markToolProgress(next, toolFromMessage, 70);
    }
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

function getMsvcInstallationPathOverride(
  platform: HostPlatformPayload,
  compilerPreference: CompilerPreference | undefined,
  rawValue: string | undefined
): string | undefined {
  const trimmed = rawValue?.trim();
  if (!trimmed || !supportsMsvcInstallationPath(platform, compilerPreference)) {
    return undefined;
  }
  return trimmed;
}

function createLoadingToolPolicies(
  platform: HostPlatformPayload
): Required<ProjectToolPoliciesPayload> {
  const compilerFamily = getDefaultCompilerPreference(platform);

  return {
    cmake: { mode: "system", version: "default" },
    ninja: { mode: "system", version: "default" },
    vcpkg: { mode: "system", version: "default" },
    conan: { mode: "system", version: "default" },
    cxx: {
      mode: "system",
      version: compilerFamily === "mingw" ? "latest" : "default",
      preferredFamily: compilerFamily,
      msvcInstallationPath: ""
    }
  };
}

function createLoadingHostSupport(platform: HostPlatformPayload): HostSupportPayload {
  const arch = detectRendererArch();

  return {
    platform,
    arch,
    hostLabel:
      platform === "win32"
        ? `Windows ${arch}`
        : platform === "darwin"
          ? `macOS ${arch}`
          : `Linux ${arch}`,
    tier: "best-effort",
    managedLifecycleReady: false,
    recommendedProvider: "unknown",
    notes: ["서비스에서 host capability contract를 불러오는 중입니다."]
  };
}

function createLoadingToolCapabilities(): Record<
  "cmake" | "ninja" | "vcpkg" | "conan" | "cxx",
  ToolLifecycleCapabilities
> {
  return {
    cmake: {
      provider: "unknown",
      detect: false,
      install: false,
      repair: false,
      remove: false,
      note: "서비스 연결 후 실제 capability가 채워집니다."
    },
    ninja: {
      provider: "unknown",
      detect: false,
      install: false,
      repair: false,
      remove: false,
      note: "서비스 연결 후 실제 capability가 채워집니다."
    },
    vcpkg: {
      provider: "unknown",
      detect: false,
      install: false,
      repair: false,
      remove: false,
      note: "서비스 연결 후 실제 capability가 채워집니다."
    },
    conan: {
      provider: "unknown",
      detect: false,
      install: false,
      repair: false,
      remove: false,
      note: "서비스 연결 후 실제 capability가 채워집니다."
    },
    cxx: {
      provider: "unknown",
      detect: false,
      install: false,
      repair: false,
      remove: false,
      note: "서비스 연결 후 실제 capability가 채워집니다."
    }
  };
}

function detectRendererPlatform(): HostPlatformPayload {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
  if (userAgent.includes("windows")) {
    return "win32";
  }
  if (userAgent.includes("mac os") || userAgent.includes("macintosh")) {
    return "darwin";
  }
  return "linux";
}

function detectRendererArch(): string {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
  return userAgent.includes("arm64") || userAgent.includes("aarch64") ? "arm64" : "x64";
}

function cloneToolPolicies(
  toolPolicies: Required<ProjectToolPoliciesPayload>
): Required<ProjectToolPoliciesPayload> {
  return {
    cmake: { ...toolPolicies.cmake },
    ninja: { ...toolPolicies.ninja },
    vcpkg: { ...toolPolicies.vcpkg },
    conan: { ...toolPolicies.conan },
    cxx: { ...toolPolicies.cxx }
  };
}

function createLoadingHostDefaults(): HostDefaultsPayload {
  const platform = detectRendererPlatform();
  return {
    platform,
    defaultPreset: `debug-${detectRendererArch()}`,
    dependencyBackend: "none",
    toolPolicies: createLoadingToolPolicies(platform),
    hostSupport: createLoadingHostSupport(platform),
    toolCapabilities: createLoadingToolCapabilities()
  };
}

function toToolPolicyState(
  config: ProjectConfigPayload,
  defaults: HostDefaultsPayload = createLoadingHostDefaults()
): Required<ProjectToolPoliciesPayload> {
  const compilerFamily =
    config.tools?.cxx?.preferredFamily ??
    config.compiler?.preferredFamily ??
    defaults.toolPolicies.cxx.preferredFamily ??
    getDefaultCompilerPreference(defaults.platform);

  return {
    cmake: {
      mode: config.tools?.cmake?.mode ?? defaults.toolPolicies.cmake.mode,
      version: config.tools?.cmake?.version ?? defaults.toolPolicies.cmake.version
    },
    ninja: {
      mode: config.tools?.ninja?.mode ?? defaults.toolPolicies.ninja.mode,
      version: config.tools?.ninja?.version ?? defaults.toolPolicies.ninja.version
    },
    vcpkg: {
      mode: config.tools?.vcpkg?.mode ?? defaults.toolPolicies.vcpkg.mode,
      version: config.tools?.vcpkg?.version ?? defaults.toolPolicies.vcpkg.version
    },
    conan: {
      mode: config.tools?.conan?.mode ?? defaults.toolPolicies.conan.mode,
      version: config.tools?.conan?.version ?? defaults.toolPolicies.conan.version
    },
    cxx: {
      mode: config.tools?.cxx?.mode ?? defaults.toolPolicies.cxx.mode,
      version: config.tools?.cxx?.version ?? defaults.toolPolicies.cxx.version,
      preferredFamily: compilerFamily,
      msvcInstallationPath:
        config.tools?.cxx?.msvcInstallationPath ??
        config.compiler?.msvcInstallationPath ??
        ""
    }
  };
}

const toToolPoliciesPayload = (
  toolPolicies: Required<ProjectToolPoliciesPayload>,
  platform: HostPlatformPayload
): ProjectToolPoliciesPayload => ({
  cmake: {
    mode: toolPolicies.cmake.mode,
    version: toolPolicies.cmake.version
  },
  ninja: {
    mode: toolPolicies.ninja.mode,
    version: toolPolicies.ninja.version
  },
  vcpkg: {
    mode: toolPolicies.vcpkg.mode,
    version: toolPolicies.vcpkg.version
  },
  conan: {
    mode: toolPolicies.conan.mode,
    version: toolPolicies.conan.version
  },
  cxx: {
    mode: toolPolicies.cxx.mode,
    version: toolPolicies.cxx.version,
    preferredFamily: toolPolicies.cxx.preferredFamily,
    ...(getMsvcInstallationPathOverride(
      platform,
      toolPolicies.cxx.preferredFamily,
      toolPolicies.cxx.msvcInstallationPath
    )
      ? {
          msvcInstallationPath: getMsvcInstallationPathOverride(
            platform,
            toolPolicies.cxx.preferredFamily,
            toolPolicies.cxx.msvcInstallationPath
          )
        }
      : {})
  }
});

const createNewPreset = (index: number): PresetConfigPayload => ({
  name: `preset-${index + 1}`,
  displayName: "",
  buildType: undefined,
  targetTriplet: "",
  runnable: true
});

function getDependencyDescription(backend: DependencyBackend): string {
  switch (backend) {
    case "conan":
      return "cppx add로 conan requires를 등록합니다";
    case "none":
      return "dependency_backend = none 에서는 cppx add를 지원하지 않습니다";
    default:
      return "cppx add로 vcpkg 패키지를 등록합니다";
  }
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
  const [hostDefaults, setHostDefaults] = useState<HostDefaultsPayload>(() =>
    createLoadingHostDefaults()
  );
  const [defaultRootPath, setDefaultRootPath] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [projectName, setProjectName] = useState("");
  const [dependency, setDependency] = useState("");
  const [projectDependencies, setProjectDependencies] = useState<string[]>([]);
  const [preset, setPreset] = useState(hostDefaults.defaultPreset);
  const [buildPreset, setBuildPreset] = useState(hostDefaults.defaultPreset);
  const [dependencyBackend, setDependencyBackend] = useState<DependencyBackend>(
    hostDefaults.dependencyBackend
  );
  const [sourceFile, setSourceFile] = useState("src/main.cpp");
  const [cxxStandardInput, setCxxStandardInput] = useState("20");
  const [targetTriplet, setTargetTriplet] = useState("");
  const [toolPolicies, setToolPolicies] = useState<Required<ProjectToolPoliciesPayload>>(
    () => cloneToolPolicies(hostDefaults.toolPolicies)
  );
  const [presetConfigs, setPresetConfigs] = useState<PresetConfigPayload[]>([]);
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

  const compilerFamilyOptions = useMemo(() => {
    const options = getCompilerPreferenceOptions(hostDefaults.platform);
    if (
      toolPolicies.cxx.preferredFamily &&
      !options.some((option) => option.value === toolPolicies.cxx.preferredFamily)
    ) {
      return [
        ...options,
        {
          value: toolPolicies.cxx.preferredFamily,
          label: `${getCompilerPreferenceLabel(
            hostDefaults.platform,
            toolPolicies.cxx.preferredFamily
          )} (legacy)`
        }
      ];
    }
    return options;
  }, [hostDefaults.platform, toolPolicies.cxx.preferredFamily]);

  const requiredToolIds = useMemo(() => {
    switch (dependencyBackend) {
      case "vcpkg":
        return ["cmake", "ninja", "vcpkg", "cxx"] as const;
      case "conan":
        return ["cmake", "ninja", "conan", "cxx"] as const;
      default:
        return ["cmake", "ninja", "cxx"] as const;
    }
  }, [dependencyBackend]);

  const readyToolCount = useMemo(() => {
    return requiredToolIds.filter((tool) => toolStatus[tool]).length;
  }, [requiredToolIds, toolStatus]);

  const selectedPresetConfig = useMemo(
    () => presetConfigs.find((item) => item.name === buildPreset),
    [buildPreset, presetConfigs]
  );

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

    void (async () => {
      let resolvedHostDefaults: HostDefaultsPayload;
      try {
        resolvedHostDefaults = await cppx.getHostDefaults();
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "main process host capability contract를 불러오지 못했습니다.";
        setBridgeError(message);
        return;
      }
      setHostDefaults({
        ...resolvedHostDefaults,
        toolPolicies: cloneToolPolicies(resolvedHostDefaults.toolPolicies)
      });
      resetProjectEditor(resolvedHostDefaults);

      const defaultWorkspace = await cppx.getDefaultWorkspace();
      setWorkspace(defaultWorkspace);
      await refreshProjectConfig(cppx, defaultWorkspace, resolvedHostDefaults);
    })();
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

  useEffect(() => {
    if (presetConfigs.length === 0) {
      return;
    }

    if (!presetConfigs.some((item) => item.name === preset)) {
      setPreset(presetConfigs[0]?.name ?? "");
    }

    if (!presetConfigs.some((item) => item.name === buildPreset)) {
      setBuildPreset(presetConfigs.find((item) => item.name === preset)?.name ?? presetConfigs[0]?.name ?? "");
    }
  }, [buildPreset, preset, presetConfigs]);

  async function refreshToolStatus(api: CppxApi): Promise<void> {
    try {
      const current = await api.getToolStatus();
      setToolStatus(current);
    } catch {
      setToolStatus(initialToolStatus);
    }
  }

  function resetProjectEditor(defaults: HostDefaultsPayload = hostDefaults): void {
    setProjectName("");
    setProjectDependencies([]);
    setPreset(defaults.defaultPreset);
    setBuildPreset(defaults.defaultPreset);
    setDependencyBackend(defaults.dependencyBackend);
    setSourceFile("src/main.cpp");
    setCxxStandardInput("20");
    setTargetTriplet("");
    setToolPolicies(cloneToolPolicies(defaults.toolPolicies));
    setPresetConfigs([]);
    setCmakeDefinitionsInput("");
    setCmakeOptionsInput("");
    setCmakeIncludesInput("");
    setCmakeLinksInput("");
  }

  async function refreshProjectConfig(
    api: CppxApi,
    workspacePath: string,
    defaults: HostDefaultsPayload = hostDefaults
  ): Promise<void> {
    const path = workspacePath.trim();
    if (!path) {
      resetProjectEditor(defaults);
      return;
    }

    try {
      const config = await api.getProjectConfig(path);
      applyProjectConfig(config);
    } catch {
      resetProjectEditor(defaults);
    }
  }

  function applyProjectConfig(config: ProjectConfigPayload): void {
    setProjectName(config.name);
    setPreset(config.defaultPreset);
    setBuildPreset((current) =>
      (config.presets ?? []).some((item) => item.name === current)
        ? current
        : config.defaultPreset
    );
    setProjectDependencies(config.dependencies);
    setDependencyBackend(config.dependencyBackend ?? "vcpkg");
    setSourceFile(config.sourceFile);
    setCxxStandardInput(String(config.cxxStandard));
    setTargetTriplet(config.targetTriplet);
    setToolPolicies(toToolPolicyState(config, hostDefaults));
    setPresetConfigs(config.presets ?? []);
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
      const parsedCxxStandard = Number.parseInt(cxxStandardInput.trim(), 10);
      const msvcInstallationPath = getMsvcInstallationPathOverride(
        hostDefaults.platform,
        toolPolicies.cxx.preferredFamily,
        toolPolicies.cxx.msvcInstallationPath
      );
      const updated: ProjectConfigPayload = {
        ...current,
        name: projectName.trim() || current.name,
        defaultPreset: preset.trim() || current.defaultPreset,
        sourceFile: sourceFile.trim() || current.sourceFile,
        cxxStandard:
          Number.isFinite(parsedCxxStandard) && parsedCxxStandard > 0
            ? parsedCxxStandard
            : current.cxxStandard,
        targetTriplet: targetTriplet.trim() || current.targetTriplet,
        dependencyBackend,
        compiler: {
          preferredFamily: toolPolicies.cxx.preferredFamily,
          ...(msvcInstallationPath
            ? { msvcInstallationPath }
            : {})
        },
        tools: {
          cmake: {
            mode: toolPolicies.cmake.mode,
            version: toolPolicies.cmake.version?.trim() || current.tools?.cmake?.version || "default"
          },
          ninja: {
            mode: toolPolicies.ninja.mode,
            version: toolPolicies.ninja.version?.trim() || current.tools?.ninja?.version || "default"
          },
          vcpkg: {
            mode: toolPolicies.vcpkg.mode,
            version: toolPolicies.vcpkg.version?.trim() || current.tools?.vcpkg?.version || "default"
          },
          cxx: {
            mode: toolPolicies.cxx.mode,
            version: toolPolicies.cxx.version?.trim() || current.tools?.cxx?.version || "latest",
            preferredFamily: toolPolicies.cxx.preferredFamily,
            ...(msvcInstallationPath
              ? { msvcInstallationPath }
              : {})
          }
        },
        presets: presetConfigs.map((presetConfig, index) => ({
          ...presetConfig,
          name: presetConfig.name.trim() || `preset-${index + 1}`,
          displayName: presetConfig.displayName?.trim() || undefined,
          buildType: presetConfig.buildType?.trim() || undefined,
          targetTriplet: presetConfig.targetTriplet?.trim() || undefined,
          runnable: presetConfig.runnable ?? true
        })),
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

  function updateToolPolicy(
    tool: EditableToolId,
    field: "mode" | "version" | "preferredFamily" | "msvcInstallationPath",
    value: string
  ): void {
    setToolPolicies((prev) => ({
      ...prev,
      [tool]: {
        ...prev[tool],
        [field]: value
      }
    }));
  }

  function updatePresetConfig(
    index: number,
    field: keyof PresetConfigPayload,
    value: string | boolean
  ): void {
    setPresetConfigs((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        return {
          ...item,
          [field]:
            field === "runnable"
              ? Boolean(value)
              : field !== "name" && typeof value === "string" && value.length === 0
                ? undefined
                : value
        };
      })
    );
  }

  function addPresetConfig(): void {
    setPresetConfigs((prev) => {
      const next = [...prev, createNewPreset(prev.length)];
      if (next.length === 1) {
        setPreset(next[0]?.name ?? "");
      }
      return next;
    });
  }

  function removePresetConfig(index: number): void {
    setPresetConfigs((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
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
    let payloadToolPolicies: RunCommandPayload["toolPolicies"];
    let payloadDependencyBackend: RunCommandPayload["dependencyBackend"];
    if (action === "install-tools") {
      compilerPreference = toolPolicies.cxx.preferredFamily;
      msvcInstallationPath = getMsvcInstallationPathOverride(
        hostDefaults.platform,
        compilerPreference,
        toolPolicies.cxx.msvcInstallationPath
      );

      if (compilerPreference === "msvc") {
        try {
          const scan = await cppx.getCompilerScan();
          if (scan.msvcAvailable && !msvcInstallationPath) {
            const choice = await requestCompilerChoiceDialog(scan);
            if (choice.kind === "close") {
              showStatusToast("도구 설치를 취소했습니다.", "info");
              return;
            }
            if (choice.kind === "msvc") {
              msvcInstallationPath = choice.installationPath;
            } else {
              compilerPreference = "mingw";
              msvcInstallationPath = undefined;
            }
          }
        } catch {
          // Keep the selected tool policy and let the backend return the concrete error.
        }
      }

      const compilerLabel = getCompilerPreferenceLabel(
        hostDefaults.platform,
        compilerPreference ??
          toolPolicies.cxx.preferredFamily ??
          getDefaultCompilerPreference(hostDefaults.platform)
      );
      showStatusToast(
        `${compilerLabel} 기준으로 도구 설치를 진행합니다.`,
        "info"
      );
    }

    if (action === "install-tools" || action === "init") {
      payloadToolPolicies = toToolPoliciesPayload(toolPolicies, hostDefaults.platform);
      payloadDependencyBackend = dependencyBackend;
    }

    const payload: RunCommandPayload = {
      action,
      workspace,
      projectName,
      dependency,
      preset: buildPreset,
      dependencyBackend: payloadDependencyBackend,
      compilerPreference,
      msvcInstallationPath,
      toolPolicies: payloadToolPolicies
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
        stage: `도구 설치를 시작합니다 (컴파일러: ${getCompilerPreferenceLabel(
          hostDefaults.platform,
          compilerPreference ??
            toolPolicies.cxx.preferredFamily ??
            getDefaultCompilerPreference(hostDefaults.platform)
        )})`,
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
        await refreshProjectConfig(cppx, result.workspace);
      }

      if (action === "add" && result.ok) {
        await refreshProjectConfig(cppx, workspace);
      }

      if (action === "init") {
        setInitButtonStatus(result.ok ? "success" : "error");
        scheduleInitButtonReset();
      }

      if (action === "install-tools") {
        const installsVcpkg = dependencyBackend === "vcpkg";
        const installsConan = dependencyBackend === "conan";
        setInstallProgress((prev) => ({
          ...prev,
          status: result.ok ? "success" : "error",
          stage: result.ok ? "도구 설치가 완료되었습니다" : `설치 실패: ${result.message}`,
          percent: result.ok ? 100 : Math.max(prev.percent, 8),
          completed: result.ok
            ? {
                cmake: true,
                ninja: true,
                vcpkg: installsVcpkg,
                conan: installsConan,
                cxx: true
              }
            : prev.completed,
          tools: result.ok
            ? {
                cmake: { percent: 100, status: "success" },
                ninja: { percent: 100, status: "success" },
                vcpkg: installsVcpkg
                  ? { percent: 100, status: "success" }
                  : { percent: 0, status: "idle" },
                conan: installsConan
                  ? { percent: 100, status: "success" }
                  : { percent: 0, status: "idle" },
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
      void refreshProjectConfig(cppx, selected);
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
              Cargo 스타일 C++ 워크플로 제어판
            </h1>
            <p className="text-sm text-muted-foreground">
              Windows, macOS, Linux 호스트와 `vcpkg` / `conan` / `none` 구성을 한 화면에서 맞춥니다.
            </p>
            <p className="break-all text-xs text-muted-foreground">
              루트 폴더: <code className="font-mono">{defaultRootPath || "불러오는 중..."}</code>
            </p>
            <p className="text-xs text-muted-foreground">
              현재 탭: <span className="font-medium text-foreground">{activeViewLabel}</span>
            </p>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <p
            className="truncate rounded-[10px] border border-border/70 bg-secondary/60 px-3 py-2"
            title={workspace || "작업 폴더 미지정"}
          >
            작업 폴더: {workspace || "미지정"}
          </p>
          <p className="rounded-[10px] border border-border/70 bg-secondary/60 px-3 py-2">
            기본 프리셋: <span className="font-mono">{preset}</span>
          </p>
          <p className="rounded-[10px] border border-border/70 bg-secondary/60 px-3 py-2">
            의존성 백엔드: <span className="font-mono">{dependencyBackend}</span>
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
                      CMakePresets, backend manifest, VSCode tasks/launch 템플릿 생성
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
                    <CardTitle>프로젝트 / 백엔드 설정</CardTitle>
                    <CardDescription>
                      schema v3 기준의 핵심 프로젝트 설정을 읽고 저장합니다
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="source-file">source_file</Label>
                        <Input
                          id="source-file"
                          value={sourceFile}
                          onChange={(event) => setSourceFile(event.target.value)}
                          placeholder="src/main.cpp"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="cxx-standard">cxx_standard</Label>
                        <Input
                          id="cxx-standard"
                          value={cxxStandardInput}
                          onChange={(event) => setCxxStandardInput(event.target.value)}
                          placeholder="20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">dependency_backend</Label>
                        <Select value={dependencyBackend} onValueChange={(value) => setDependencyBackend(value as DependencyBackend)}>
                          <SelectTrigger>
                            <SelectValue placeholder="백엔드 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {dependencyBackendOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">default_preset</Label>
                        {presetConfigs.length > 0 ? (
                          <Select value={preset} onValueChange={setPreset}>
                            <SelectTrigger>
                              <SelectValue placeholder="기본 프리셋 선택" />
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
                            아직 프리셋이 없습니다. 저장 시 기본 프리셋이 다시 생성됩니다.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="target-triplet">target_triplet (기본값)</Label>
                      <Input
                        id="target-triplet"
                        value={targetTriplet}
                        onChange={(event) => setTargetTriplet(event.target.value)}
                        placeholder="x64-mingw-dynamic / x64-windows / x64-osx / x64-linux"
                      />
                    </div>
                  </CardContent>
                </Card>

                <ToolPolicyCard
                  toolPolicies={toolPolicies}
                  toolStatusDetails={toolStatus.details}
                  hostPlatform={hostDefaults.platform}
                  compilerFamilyOptions={compilerFamilyOptions}
                  defaultCompilerPreference={getDefaultCompilerPreference(hostDefaults.platform)}
                  onUpdateToolPolicy={updateToolPolicy}
                />
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
                    <CardDescription>{getDependencyDescription(dependencyBackend)}</CardDescription>
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
                          disabled={busy || dependencyBackend === "none"}
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
                          onClick={() => cppx && void refreshProjectConfig(cppx, workspace)}
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

              <PresetMatrixCard
                busy={busy}
                presetConfigs={presetConfigs}
                selectedPreset={preset}
                targetTriplet={targetTriplet}
                onAddPreset={addPresetConfig}
                onReloadPresets={() => void loadProjectConfig()}
                onRemovePreset={removePresetConfig}
                onUpdatePreset={updatePresetConfig}
              />
            </section>
          )}

          {activeView === "build" && (
            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <BuildActionPanel
                busy={busy}
                buildPreset={buildPreset}
                presetConfigs={presetConfigs}
                selectedPresetConfig={selectedPresetConfig}
                targetTriplet={targetTriplet}
                onChangeBuildPreset={setBuildPreset}
                onRun={() => void runAction("run")}
                onBuild={() => void runAction("build")}
                onTest={() => void runAction("test")}
                onPack={() => void runAction("pack")}
              />

              <ToolchainStatusCard
                hostSupport={hostDefaults.hostSupport}
                toolStatus={toolStatus}
                installProgressTools={installProgress.tools}
                showProgress={installProgress.status !== "idle"}
                installButtonStatus={installButtonStatus}
                installButtonText={getInstallButtonText(installButtonStatus, installProgress.stage)}
                installButtonClassName={getInstallButtonClassName(installButtonStatus)}
                readyToolCount={readyToolCount}
                requiredToolCount={requiredToolIds.length}
                busy={busy}
                canRefresh={Boolean(cppx)}
                onInstallTools={() => void runAction("install-tools")}
                onRefresh={() => {
                  if (cppx) {
                    void refreshToolStatus(cppx);
                  }
                }}
              />
            </section>
          )}

          {activeView === "logs" && (
            <LogsPanel
              logs={logs}
              busy={busy}
              scrollAreaRef={logsScrollAreaRef}
              onClearLogs={() => setLogs([])}
            />
          )}
        </div>
      </section>
      </main>
      <CompilerChoiceDialog
        open={compilerChoiceDialog.open}
        scan={compilerChoiceDialog.scan}
        onSelectMsvc={(installationPath) =>
          closeCompilerChoiceDialog({ kind: "msvc", installationPath })
        }
        onSelectMingw={() => closeCompilerChoiceDialog({ kind: "mingw" })}
        onClose={() => closeCompilerChoiceDialog({ kind: "close" })}
      />
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


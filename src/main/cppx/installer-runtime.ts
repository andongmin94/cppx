import path from "node:path";
import type {
  DependencyBackend,
  ProjectToolPoliciesPayload,
  ToolLifecycleCapabilities,
  ToolOwnership,
  ToolLifecycleProvider,
  ToolStatus
} from "@shared/contracts";
import { CppxError } from "./errors";
import type { MsvcCompilerInfo } from "./installer-msvc";
import type { CppxLogger } from "./logger";
import type {
  CompilerFamily,
  CompilerToolPolicy,
  ToolManifest,
  ToolName,
  ToolPolicy,
  ToolRecord,
  ToolSourceKind,
  Toolchain
} from "./types";

export interface ResolvedToolExecutable {
  executable: string;
  root: string;
  record?: ToolRecord;
  sourceKind: ToolSourceKind;
  mode: "managed" | "system";
  requestedVersion?: string;
  resolvedVersion?: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
}

export interface ToolResolutionDetail {
  ready: boolean;
  mode?: "managed" | "system";
  sourceKind?: ToolSourceKind;
  requestedVersion?: string;
  resolvedVersion?: string;
  executable?: string;
  compilerFamily?: CompilerFamily;
  catalogId?: string;
  verifiedSha256?: string;
  provider?: ToolLifecycleProvider;
  ownership?: ToolOwnership;
  capabilities?: ToolLifecycleCapabilities;
}

export interface ToolResolutionSnapshot {
  cmake: ToolResolutionDetail;
  ninja: ToolResolutionDetail;
  vcpkg: ToolResolutionDetail;
  conan: ToolResolutionDetail;
  cxx: ToolResolutionDetail;
}

export interface ResolvedToolPolicies {
  cmake: ToolPolicy;
  ninja: ToolPolicy;
  vcpkg: ToolPolicy;
  conan: ToolPolicy;
  cxx: CompilerToolPolicy;
}

export interface InstallerRuntimeDependencies {
  ensureCppxLayout: () => Promise<void>;
  readToolManifest: () => Promise<ToolManifest>;
  resolveRequestedPolicies: (
    toolPolicies?: ProjectToolPoliciesPayload
  ) => ResolvedToolPolicies;
  resolveToolExecutable: (
    tool: ToolName,
    manifest: ToolManifest,
    policy?: ToolPolicy | CompilerToolPolicy
  ) => Promise<ResolvedToolExecutable | null>;
  resolveToolLifecycleCapabilities: (
    tool: ToolName
  ) => Promise<ToolLifecycleCapabilities>;
  inferCompilerFamily: (executable: string) => CompilerFamily;
  inferMsvcInstallationPathFromCl: (clPath: string) => string | null;
  resolveMsvcCompilerInfo: (
    preferredInstallationPath?: string
  ) => Promise<MsvcCompilerInfo | null>;
  captureMsvcEnvironment: (devCmdPath: string) => Promise<NodeJS.ProcessEnv>;
  toMessage: (error: unknown) => string;
}

function toStatusDetail(
  resolved: ResolvedToolExecutable | null,
  capabilities: ToolLifecycleCapabilities
): NonNullable<ToolStatus["details"]>[ToolName] {
  if (!resolved) {
    return { ready: false, capabilities };
  }

  return {
    ready: true,
    mode: resolved.mode,
    sourceKind: resolved.sourceKind,
    requestedVersion: resolved.requestedVersion,
    resolvedVersion: resolved.resolvedVersion,
    executable: resolved.executable,
    verifiedSha256: resolved.verifiedSha256,
    provider: resolved.provider,
    ownership: resolved.ownership,
    capabilities
  };
}

function toResolutionDetail(
  resolved: ResolvedToolExecutable | null,
  fallback?: {
    mode?: "managed" | "system";
    requestedVersion?: string;
    compilerFamily?: CompilerFamily;
    verifiedSha256?: string;
    capabilities?: ToolLifecycleCapabilities;
  }
): ToolResolutionDetail {
  if (!resolved) {
    return {
      ready: false,
      mode: fallback?.mode,
      requestedVersion: fallback?.requestedVersion,
      compilerFamily: fallback?.compilerFamily,
      verifiedSha256: fallback?.verifiedSha256,
      capabilities: fallback?.capabilities
    };
  }

  return {
    ready: true,
    mode: resolved.mode,
    sourceKind: resolved.sourceKind,
    requestedVersion: resolved.requestedVersion,
    resolvedVersion: resolved.resolvedVersion,
    executable: resolved.executable,
    compilerFamily: resolved.compilerFamily,
    catalogId: resolved.catalogId,
    verifiedSha256: resolved.verifiedSha256,
    provider: resolved.provider,
    ownership: resolved.ownership,
    capabilities: fallback?.capabilities
  };
}

export async function getResolvedToolSnapshot(
  deps: InstallerRuntimeDependencies,
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = "none"
): Promise<ToolResolutionSnapshot> {
  const policies = deps.resolveRequestedPolicies(toolPolicies);
  const [cmakeCapabilities, ninjaCapabilities, vcpkgCapabilities, conanCapabilities, cxxCapabilities] =
    await Promise.all([
      deps.resolveToolLifecycleCapabilities("cmake"),
      deps.resolveToolLifecycleCapabilities("ninja"),
      deps.resolveToolLifecycleCapabilities("vcpkg"),
      deps.resolveToolLifecycleCapabilities("conan"),
      deps.resolveToolLifecycleCapabilities("cxx")
    ]);
  const requiredCapabilities = [
    cmakeCapabilities,
    ninjaCapabilities,
    dependencyBackend === "vcpkg" ? vcpkgCapabilities : undefined,
    dependencyBackend === "conan" ? conanCapabilities : undefined,
    cxxCapabilities
  ].filter((capabilities): capabilities is ToolLifecycleCapabilities => Boolean(capabilities));

  if (requiredCapabilities.some((capabilities) => !capabilities.detect)) {
    return {
      cmake: toResolutionDetail(null, {
        mode: policies.cmake.mode,
        requestedVersion: policies.cmake.version,
        capabilities: cmakeCapabilities
      }),
      ninja: toResolutionDetail(null, {
        mode: policies.ninja.mode,
        requestedVersion: policies.ninja.version,
        capabilities: ninjaCapabilities
      }),
      vcpkg: toResolutionDetail(null, {
        mode: policies.vcpkg.mode,
        requestedVersion: policies.vcpkg.version,
        capabilities: vcpkgCapabilities
      }),
      conan: toResolutionDetail(null, {
        mode: policies.conan.mode,
        requestedVersion: policies.conan.version,
        capabilities: conanCapabilities
      }),
      cxx: toResolutionDetail(null, {
        mode: policies.cxx.mode,
        requestedVersion: policies.cxx.version,
        compilerFamily: policies.cxx.preferredFamily,
        capabilities: cxxCapabilities
      })
    };
  }

  await deps.ensureCppxLayout();
  const manifest = await deps.readToolManifest();

  const [cmake, ninja, vcpkg, conan, cxx] = await Promise.all([
    cmakeCapabilities.detect
      ? deps.resolveToolExecutable("cmake", manifest, policies.cmake)
      : Promise.resolve(null),
    ninjaCapabilities.detect
      ? deps.resolveToolExecutable("ninja", manifest, policies.ninja)
      : Promise.resolve(null),
    dependencyBackend === "vcpkg" && vcpkgCapabilities.detect
      ? deps.resolveToolExecutable("vcpkg", manifest, policies.vcpkg)
      : Promise.resolve(null),
    dependencyBackend === "conan" && conanCapabilities.detect
      ? deps.resolveToolExecutable("conan", manifest, policies.conan)
      : Promise.resolve(null),
    cxxCapabilities.detect
      ? deps.resolveToolExecutable("cxx", manifest, policies.cxx)
      : Promise.resolve(null)
  ]);

  return {
    cmake: toResolutionDetail(cmake, {
      mode: policies.cmake.mode,
      requestedVersion: policies.cmake.version,
      capabilities: cmakeCapabilities
    }),
    ninja: toResolutionDetail(ninja, {
      mode: policies.ninja.mode,
      requestedVersion: policies.ninja.version,
      capabilities: ninjaCapabilities
    }),
    vcpkg: toResolutionDetail(vcpkg, {
      mode: policies.vcpkg.mode,
      requestedVersion: policies.vcpkg.version,
      capabilities: vcpkgCapabilities
    }),
    conan: toResolutionDetail(conan, {
      mode: policies.conan.mode,
      requestedVersion: policies.conan.version,
      capabilities: conanCapabilities
    }),
    cxx: toResolutionDetail(cxx, {
      mode: policies.cxx.mode,
      requestedVersion: policies.cxx.version,
      compilerFamily: policies.cxx.preferredFamily,
      capabilities: cxxCapabilities
    })
  };
}

export async function getToolStatus(
  deps: InstallerRuntimeDependencies
): Promise<ToolStatus> {
  const [cmakeCapabilities, ninjaCapabilities, vcpkgCapabilities, conanCapabilities, cxxCapabilities] =
    await Promise.all([
      deps.resolveToolLifecycleCapabilities("cmake"),
      deps.resolveToolLifecycleCapabilities("ninja"),
      deps.resolveToolLifecycleCapabilities("vcpkg"),
      deps.resolveToolLifecycleCapabilities("conan"),
      deps.resolveToolLifecycleCapabilities("cxx")
    ]);

  if (
    [cmakeCapabilities, ninjaCapabilities, vcpkgCapabilities, conanCapabilities, cxxCapabilities]
      .some((capabilities) => !capabilities.detect)
  ) {
    return {
      cmake: false,
      ninja: false,
      vcpkg: false,
      conan: false,
      cxx: false,
      details: {
        cmake: toStatusDetail(null, cmakeCapabilities),
        ninja: toStatusDetail(null, ninjaCapabilities),
        vcpkg: toStatusDetail(null, vcpkgCapabilities),
        conan: toStatusDetail(null, conanCapabilities),
        cxx: toStatusDetail(null, cxxCapabilities)
      }
    };
  }

  await deps.ensureCppxLayout();
  const manifest = await deps.readToolManifest();

  const [cmake, ninja, vcpkg, conan, cxx] = await Promise.all([
    cmakeCapabilities.detect
      ? deps.resolveToolExecutable("cmake", manifest)
      : Promise.resolve(null),
    ninjaCapabilities.detect
      ? deps.resolveToolExecutable("ninja", manifest)
      : Promise.resolve(null),
    vcpkgCapabilities.detect
      ? deps.resolveToolExecutable("vcpkg", manifest)
      : Promise.resolve(null),
    conanCapabilities.detect
      ? deps.resolveToolExecutable("conan", manifest)
      : Promise.resolve(null),
    cxxCapabilities.detect
      ? deps.resolveToolExecutable("cxx", manifest)
      : Promise.resolve(null)
  ]);

  return {
    cmake: Boolean(cmake),
    ninja: Boolean(ninja),
    vcpkg: Boolean(vcpkg),
    conan: Boolean(conan),
    cxx: Boolean(cxx),
    details: {
      cmake: toStatusDetail(cmake, cmakeCapabilities),
      ninja: toStatusDetail(ninja, ninjaCapabilities),
      vcpkg: toStatusDetail(vcpkg, vcpkgCapabilities),
      conan: toStatusDetail(conan, conanCapabilities),
      cxx: toStatusDetail(cxx, cxxCapabilities)
    }
  };
}

export async function resolveToolchainOrThrow(
  deps: InstallerRuntimeDependencies,
  logger: CppxLogger,
  toolPolicies?: ProjectToolPoliciesPayload,
  dependencyBackend: DependencyBackend = "none"
): Promise<Toolchain> {
  const policies = deps.resolveRequestedPolicies(toolPolicies);
  const [cmakeCapabilities, ninjaCapabilities, vcpkgCapabilities, conanCapabilities, cxxCapabilities] =
    await Promise.all([
      deps.resolveToolLifecycleCapabilities("cmake"),
      deps.resolveToolLifecycleCapabilities("ninja"),
      deps.resolveToolLifecycleCapabilities("vcpkg"),
      deps.resolveToolLifecycleCapabilities("conan"),
      deps.resolveToolLifecycleCapabilities("cxx")
    ]);
  const unsupportedNotes = [
    cmakeCapabilities,
    ninjaCapabilities,
    dependencyBackend === "vcpkg" ? vcpkgCapabilities : undefined,
    dependencyBackend === "conan" ? conanCapabilities : undefined,
    cxxCapabilities
  ]
    .filter((capabilities): capabilities is ToolLifecycleCapabilities =>
      Boolean(capabilities && !capabilities.detect)
    )
    .map((capabilities) => capabilities.note)
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0);

  if (unsupportedNotes.length > 0) {
    throw new CppxError(
      "현재 host는 cppx 도구 해석 대상이 아닙니다.",
      Array.from(new Set(unsupportedNotes)).join(" ")
    );
  }

  await deps.ensureCppxLayout();
  const manifest = await deps.readToolManifest();

  const [cmake, ninja, vcpkg, conan, cxxResolved] = await Promise.all([
    deps.resolveToolExecutable("cmake", manifest, policies.cmake),
    deps.resolveToolExecutable("ninja", manifest, policies.ninja),
    dependencyBackend === "vcpkg"
      ? deps.resolveToolExecutable("vcpkg", manifest, policies.vcpkg)
      : Promise.resolve(null),
    dependencyBackend === "conan"
      ? deps.resolveToolExecutable("conan", manifest, policies.conan)
      : Promise.resolve(null),
    deps.resolveToolExecutable("cxx", manifest, policies.cxx)
  ]);

  const missing: string[] = [];
  if (!cmake) missing.push("cmake");
  if (!ninja) missing.push("ninja");
  if (dependencyBackend === "vcpkg" && !vcpkg) missing.push("vcpkg");
  if (dependencyBackend === "conan" && !conan) missing.push("conan");
  if (!cxxResolved) missing.push("cxx-compiler");

  if (missing.length > 0) {
    throw new CppxError(
      `누락된 도구: ${missing.join(", ")}. 먼저 install-tools를 실행하거나 시스템 PATH를 확인하세요.`
    );
  }

  if (
    !cmake ||
    !ninja ||
    !cxxResolved ||
    (dependencyBackend === "vcpkg" && !vcpkg) ||
    (dependencyBackend === "conan" && !conan)
  ) {
    throw new CppxError("도구 확인 중 예기치 않은 오류가 발생했습니다.");
  }

  let cxx = cxxResolved.executable;
  let compilerFamily = cxxResolved.compilerFamily ?? deps.inferCompilerFamily(cxxResolved.executable);
  let baseEnv: NodeJS.ProcessEnv | undefined;

  if (compilerFamily === "msvc") {
    const preferredInstallationPath =
      policies.cxx.msvcInstallationPath ??
      manifest.tools.cxx?.root ??
      deps.inferMsvcInstallationPathFromCl(cxxResolved.executable) ??
      undefined;
    let msvc: MsvcCompilerInfo | null = null;
    try {
      msvc = await deps.resolveMsvcCompilerInfo(preferredInstallationPath);
    } catch (error) {
      throw new CppxError("MSVC 정보 조회에 실패했습니다.", deps.toMessage(error));
    }

    if (!msvc) {
      throw new CppxError(
        "MSVC 개발자 환경을 찾을 수 없습니다.",
        "install-tools를 다시 실행해 MinGW로 전환하거나 Visual Studio Build Tools 설치를 확인하세요."
      );
    }

    cxx = msvc.clPath;
    try {
      baseEnv = await deps.captureMsvcEnvironment(msvc.devCmdPath);
    } catch (error) {
      throw new CppxError("MSVC 환경 변수를 불러오지 못했습니다.", deps.toMessage(error));
    }
    logger.info("system", `MSVC 컴파일러 사용: ${cxx}`);
  }

  const envPath = Array.from(
    new Set([
      path.dirname(cmake.executable),
      path.dirname(ninja.executable),
      ...(vcpkg ? [path.dirname(vcpkg.executable)] : []),
      ...(conan ? [path.dirname(conan.executable)] : []),
      path.dirname(cxx)
    ])
  );

  if (vcpkg) {
    logger.info("system", `사용 중인 toolchain 루트: ${path.dirname(vcpkg.executable)}`);
  }

  return {
    cmake: cmake.executable,
    ninja: ninja.executable,
    vcpkg: vcpkg?.executable,
    conan: conan?.executable,
    cxx,
    envPath,
    compilerFamily,
    baseEnv
  };
}

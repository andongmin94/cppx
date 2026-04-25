export type CppxErrorCode = "PROJECT_CONFIG_MISSING";

export class CppxError extends Error {
  readonly details?: string;
  readonly code?: CppxErrorCode;

  constructor(message: string, details?: string, code?: CppxErrorCode) {
    super(message);
    this.name = "CppxError";
    this.details = details;
    this.code = code;
  }
}

export function isCppxErrorWithCode(
  error: unknown,
  code: CppxErrorCode
): error is CppxError {
  return error instanceof CppxError && error.code === code;
}

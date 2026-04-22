export class CppxError extends Error {
  readonly details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = "CppxError";
    this.details = details;
  }
}

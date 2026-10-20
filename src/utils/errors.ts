/**
 * Custom error classes for workspace-map plugin.
 * Provides consistent error handling with codes for programmatic handling.
 */

export type ErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "CONFIG_VALIDATION_FAILED"
  | "SUMMARIZATION_FAILED"
  | "SUMMARIZATION_TIMEOUT"
  | "SUMMARIZATION_CANCELLED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_CORRUPTED"
  | "STORAGE_LOCK_FAILED"
  | "WATCH_FAILED"
  | "WATCH_TIMEOUT"
  | "WATCH_CANCELLED"
  | "LSP_UNAVAILABLE"
  | "LSP_TIMEOUT"
  | "LSP_ERROR"
  | "LSP_CANCELLED"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_BINARY"
  | "FILE_GENERATED"
  | "FILE_SECRET"
  | "WALK_FAILED"
  | "WALK_CANCELLED"
  | "INJECTION_FAILED"
  | "INJECTION_TIMEOUT"
  | "INTERNAL_ERROR";

export class WorkspaceMapError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: Error;
  public readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message);
    this.name = "WorkspaceMapError";
    this.code = code;
    this.cause = options?.cause;
    this.context = options?.context;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkspaceMapError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause?.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class ConfigError extends WorkspaceMapError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super("CONFIG_INVALID", message, options);
    this.name = "ConfigError";
  }
}

export class ConfigNotFoundError extends WorkspaceMapError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super("CONFIG_NOT_FOUND", message, options);
    this.name = "ConfigNotFoundError";
  }
}

export class ConfigValidationError extends WorkspaceMapError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super("CONFIG_VALIDATION_FAILED", message, options);
    this.name = "ConfigValidationError";
  }
}

export class SummarizationError extends WorkspaceMapError {
  constructor(code: "SUMMARIZATION_FAILED" | "SUMMARIZATION_TIMEOUT" | "SUMMARIZATION_CANCELLED", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "SummarizationError";
  }
}

export class StorageError extends WorkspaceMapError {
  constructor(code: "STORAGE_READ_FAILED" | "STORAGE_WRITE_FAILED" | "STORAGE_CORRUPTED" | "STORAGE_LOCK_FAILED", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "StorageError";
  }
}

export class WatchError extends WorkspaceMapError {
  constructor(code: "WATCH_FAILED" | "WATCH_TIMEOUT" | "WATCH_CANCELLED", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "WatchError";
  }
}

export class LspError extends WorkspaceMapError {
  constructor(code: "LSP_UNAVAILABLE" | "LSP_TIMEOUT" | "LSP_ERROR" | "LSP_CANCELLED", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "LspError";
  }
}

export class FileError extends WorkspaceMapError {
  constructor(code: "FILE_NOT_FOUND" | "FILE_TOO_LARGE" | "FILE_BINARY" | "FILE_GENERATED" | "FILE_SECRET", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "FileError";
  }
}

export class WalkError extends WorkspaceMapError {
  constructor(code: "WALK_FAILED" | "WALK_CANCELLED", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "WalkError";
  }
}

export class InjectionError extends WorkspaceMapError {
  constructor(code: "INJECTION_FAILED" | "INJECTION_TIMEOUT", message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(code, message, options);
    this.name = "InjectionError";
  }
}

export class InternalError extends WorkspaceMapError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super("INTERNAL_ERROR", message, options);
    this.name = "InternalError";
  }
}

/**
 * Type guard to check if an error is a WorkspaceMapError
 */
export function isWorkspaceMapError(error: unknown): error is WorkspaceMapError {
  return error instanceof WorkspaceMapError;
}

/**
 * Type guard to check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isWorkspaceMapError(error) && error.code === code;
}

/**
 * Extract error code from any error
 */
export function getErrorCode(error: unknown): ErrorCode | undefined {
  if (isWorkspaceMapError(error)) {
    return error.code;
  }
  return undefined;
}
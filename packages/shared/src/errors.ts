// ─────────────────────────────────────────────────────────────────────────────
// Shared Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class WorkspaceError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKSPACE_ERROR', 500, details);
    this.name = 'WorkspaceError';
  }
}

export class AgentError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', 500, details);
    this.name = 'AgentError';
  }
}

export class ToolExecutionError extends AppError {
  public readonly toolName: string;

  constructor(toolName: string, message: string) {
    super(`Tool '${toolName}' failed: ${message}`, 'TOOL_EXECUTION_ERROR', 500, { toolName });
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
  }
}

export class PermissionDeniedError extends AppError {
  constructor(action: string) {
    super(`Destructive action '${action}' was denied by user`, 'PERMISSION_DENIED', 403, {
      action,
    });
    this.name = 'PermissionDeniedError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, { service });
    this.name = 'ExternalServiceError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function toApiError(err: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (isAppError(err)) {
    return { code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
  return { code: 'UNKNOWN_ERROR', message: 'An unknown error occurred' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Logger (pino-compatible interface)
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface Logger {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  fatal(msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

function formatError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

export function createConsoleLogger(level: LogLevel = 'info'): Logger {
  const levels: Record<LogLevel, number> = {
    trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5,
  };
  const currentLevel = levels[level];

  function log(lvl: LogLevel, msg: string, err?: unknown, ctx?: Record<string, unknown>) {
    if (levels[lvl] < currentLevel) return;
    const entry: LogEntry = {
      level: lvl,
      message: msg,
      timestamp: new Date().toISOString(),
      context: ctx,
      ...(err ? { error: formatError(err) } : {}),
    };
    const output = JSON.stringify(entry);
    if (lvl === 'error' || lvl === 'fatal') {
      console.error(output);
    } else if (lvl === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  const logger: Logger = {
    trace: (msg, ctx) => log('trace', msg, undefined, ctx),
    debug: (msg, ctx) => log('debug', msg, undefined, ctx),
    info: (msg, ctx) => log('info', msg, undefined, ctx),
    warn: (msg, ctx) => log('warn', msg, undefined, ctx),
    error: (msg, err, ctx) => log('error', msg, err, ctx),
    fatal: (msg, err, ctx) => log('fatal', msg, err, ctx),
    child: (ctx) => {
      const child = createConsoleLogger(level);
      const originalLog = child.info.bind(child);
      void originalLog;
      return {
        trace: (msg, c) => log('trace', msg, undefined, { ...ctx, ...c }),
        debug: (msg, c) => log('debug', msg, undefined, { ...ctx, ...c }),
        info: (msg, c) => log('info', msg, undefined, { ...ctx, ...c }),
        warn: (msg, c) => log('warn', msg, undefined, { ...ctx, ...c }),
        error: (msg, err, c) => log('error', msg, err, { ...ctx, ...c }),
        fatal: (msg, err, c) => log('fatal', msg, err, { ...ctx, ...c }),
        child: child.child,
      };
    },
  };
  return logger;
}

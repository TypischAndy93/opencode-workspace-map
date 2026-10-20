import { randomUUID } from "node:crypto"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogContext {
  correlationId?: string
  operation?: string
  component?: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext, error?: Error): void
  child(context: LogContext): Logger
  setLevel(level: LogLevel): void
  getLevel(): LogLevel
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
  error?: { message: string; stack?: string }
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function formatEntry(entry: LogEntry, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(entry)
  }
  const ctx = Object.entries(entry.context)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" ")
  const ctxStr = ctx ? ` ${ctx}` : ""
  const errStr = entry.error ? ` error="${entry.error.message}"` : ""
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctxStr}${errStr}`
}

export function createLogger(
  opts: { level?: LogLevel; format?: "text" | "json"; component?: string; correlationId?: string } = {}
): Logger {
  const { level = "info", format = "text", component, correlationId } = opts
  let currentLevel = level
  let currentCorrelationId = correlationId
  let currentComponent = component

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel]
  }

  function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        ...(currentComponent && { component: currentComponent }),
        ...(currentCorrelationId && { correlationId: currentCorrelationId }),
      },
      ...(error && { error: { message: error.message, stack: error.stack } }),
    }

    const formatted = formatEntry(entry, format)
    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    consoleMethod(formatted)
  }

  return {
    debug: (message: string, context?: LogContext) => log("debug", message, context),
    info: (message: string, context?: LogContext) => log("info", message, context),
    warn: (message: string, context?: LogContext) => log("warn", message, context),
    error: (message: string, context?: LogContext, error?: Error) => log("error", message, context, error),
    child: (context: LogContext) => {
      const childLogger = createLogger({ level: currentLevel, format, component: currentComponent })
      const originalChild = childLogger.child
      childLogger.child = (ctx: LogContext) => {
        const merged = { ...context, ...ctx }
        return createLogger({ level: currentLevel, format, component: currentComponent, correlationId: currentCorrelationId }).child(merged)
      }
      return childLogger.child(context)
    },
    setLevel: (level: LogLevel) => { currentLevel = level },
    getLevel: () => currentLevel,
  }
}

export function createNoOpLogger(): Logger {
  const noop = () => {}
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => createNoOpLogger(),
    setLevel: noop,
    getLevel: () => "info",
  }
}

export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8)
}

export function withCorrelationId<T>(
  logger: Logger,
  correlationId: string,
  fn: (logger: Logger) => T | Promise<T>
): T | Promise<T> {
  const childLogger = logger.child({ correlationId })
  return fn(childLogger)
}

export async function withCorrelationIdAsync<T>(
  logger: Logger,
  correlationId: string,
  fn: (logger: Logger) => Promise<T>
): Promise<T> {
  const childLogger = logger.child({ correlationId })
  return fn(childLogger)
}
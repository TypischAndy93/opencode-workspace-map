import type { Options, FileEntry, Stats, ProjectInfo, SummarizerKind, SymbolInfo, SummarySections } from "./config/index.ts"
import type { Context } from "@opencode/plugin/promise/plugin"
import type { Logger } from "./utils/logger.ts"

/**
 * Interface for file storage operations.
 */
export interface Storage {
  scan(options: { prefix: string; limit: number; after?: string }): Promise<{ entries: Array<{ key: string; value: unknown }>; next?: string }>
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/**
 * Interface for VCS operations.
 */
export interface VcsProvider {
  getChangedFiles(root: string): Promise<string[]>
  isAvailable(root: string): Promise<boolean>
}

/**
 * Interface for file watching.
 */
export interface FileWatcher {
  start(): Promise<void>
  stop(): Promise<void>
  onChange(callback: (changes: string[]) => void): void
}

/**
 * Interface for summarizers.
 */
export interface Summarizer {
  kind: SummarizerKind
  summarize(rel: string, content: string, opts: Options, stats: Stats, log: Logger): Promise<{
    summary: string
    symbols: Array<{ name: string; kind?: string }>
    imports: string[]
    sections?: SummarySections
    inputTokens?: number
    outputTokens?: number
  } | null>
}

/**
 * Interface for LSP client.
 * Matches the OpenCode plugin LSP API.
 */
export interface LspDocumentSymbol {
  name: string
  kind: number
  range?: { start: { line: number; character: number }; end: { line: number; character: number } }
  selectionRange?: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: LspDocumentSymbol[]
  deprecated?: boolean
}

export interface LspClient {
  documentSymbols(params: { textDocument: { uri: string } }, options?: { signal?: AbortSignal }): Promise<LspDocumentSymbol[] | null>
  hover(params: { textDocument: { uri: string }; position: { line: number; character: number } }, options?: { signal?: AbortSignal }): Promise<{ contents: string } | null>
  isHealthy(): boolean
}

/**
 * Interface for plugin API context.
 */
export interface PluginApi {
  storage: Storage
  tool: {
    transform(fn: (editor: ToolEditor) => void): Promise<void>
  }
  session: {
    onContext(fn: (session: SessionContext) => Promise<void>): Cleanup
    onWrite(fn: (event: WriteEvent) => Promise<void>): Cleanup
  }
  config: {
    get<T>(key: string): T | undefined
    set(key: string, value: unknown): void
  }
}

export interface ToolEditor {
  add(tool: Tool): void
  remove(name: string): void
}

export interface Tool {
  name: string
  description: string
  inputSchema: object
  execute(input: unknown, context: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  session: SessionContext
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export interface SessionContext {
  id: string
  root: string
}

export interface WriteEvent {
  path: string
  sessionId: string
}

export type Cleanup = () => Promise<void>
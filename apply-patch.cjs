const fs = require('fs');
const content = fs.readFileSync('src/injection-engine.ts', 'utf8');

// 1. Add cleanup to interface
let result = content.replace(
  'export interface InjectionEngine {\n  listFiles(force: boolean): Promise<string[]>\n  getInjection(sessionID: string | undefined): Promise<string>\n  getChangedFilesCached(): Promise<string[]>\n  detectGit(): Promise<boolean>\n}',
  'export interface InjectionEngine {\n  listFiles(force: boolean): Promise<string[]>\n  getInjection(sessionID: string | undefined): Promise<string>\n  getChangedFilesCached(): Promise<string[]>\n  detectGit(): Promise<boolean>\n  cleanup(): void\n}'
);

// 2. Add adaptive walk concurrency tracking after the function signature
result = result.replace(
  '): InjectionEngine {\n\n  let vcsCacheLocal = vcsCache',
  '): InjectionEngine {\n\n  // Adaptive walk concurrency tracking\n  const walkLatencies: number[] = []\n  let adaptiveWalkTimer: ReturnType<typeof setTimeout> | undefined\n  \n  function recordWalkLatency(fileCount: number, durationMs: number): void {\n    if (!opts.adaptiveWalkConcurrency) return\n    \n    const latencyPerFile = fileCount > 0 ? durationMs / fileCount : durationMs\n    walkLatencies.push(latencyPerFile)\n    \n    if (walkLatencies.length > 20) walkLatencies.shift()\n  }\n  \n  function adjustWalkConcurrency(): void {\n    if (!opts.adaptiveWalkConcurrency) return\n    if (walkLatencies.length < 3) return\n    \n    const sorted = [...walkLatencies].sort((a, b) => a - b)\n    const medianLatency = sorted[Math.floor(sorted.length / 2)]\n    \n    const minConcurrency = opts.adaptiveWalkMinConcurrency ?? 1\n    const maxConcurrency = opts.adaptiveWalkMaxConcurrency ?? 16\n    const targetLatency = opts.adaptiveWalkTargetLatencyMs ?? 5\n    \n    let currentConcurrency = typeof opts.walkConcurrency === "number" ? opts.walkConcurrency : 4\n    let newConcurrency = currentConcurrency\n    \n    if (medianLatency > targetLatency * 2 && currentConcurrency < (opts.adaptiveWalkMaxConcurrency ?? 16)) {\n      newConcurrency = Math.min(currentConcurrency + 1, opts.adaptiveWalkMaxConcurrency ?? 16)\n    } else if (medianLatency < targetLatency / 2 && currentConcurrency > (opts.adaptiveWalkMinConcurrency ?? 1)) {\n      newConcurrency = Math.max(currentConcurrency - 1, opts.adaptiveWalkMinConcurrency ?? 1)\n    }\n    \n    if (newConcurrency !== currentConcurrency) {\n      opts.walkConcurrency = newConcurrency\n      log(`adaptive walk: concurrency ${currentConcurrency} -> ${newConcurrency} (median latency: ${medianLatency.toFixed(2)}ms/file, target: ${(opts.adaptiveWalkTargetLatencyMs ?? 5)}ms)`)\n    }\n  }\n  \n  function startAdaptiveWalkAdjustment(): void {\n    if (!opts.adaptiveWalkConcurrency) return\n    const interval = (opts.adaptiveWalkAdjustmentInterval ?? 10) * 60_000\n    adaptiveWalkTimer = setInterval(adjustWalkConcurrency, interval)\n  }\n  \n  function stopAdaptiveWalkAdjustment(): void {\n    if (adaptiveWalkTimer) clearTimeout(adaptiveWalkTimer)\n  }\n\n  let vcsCacheLocal = vcsCache'
);

// 2. Add recordWalkLatency call after metricsCollector.recordWalk
result = result.replace(
  'metricsCollector.recordWalk(out.length, walkDurationMs)\n    }\n\n    // Prune cache',
  'metricsCollector.recordWalk(out.length, walkDurationMs)\n    }\n\n    // Record latency for adaptive concurrency\n    recordWalkLatency(out.length, walkDurationMs)\n\n    // Prune cache'
);

// 4. Update return object to include cleanup
result = result.replace(
  'return {\n    listFiles,\n    getInjection,\n    getChangedFilesCached,\n    detectGit,\n  }\n}',
  'return {\n    listFiles,\n    getInjection,\n    getChangedFilesCached,\n    detectGit,\n    cleanup: stopAdaptiveWalkAdjustment,\n  }\n}\n// Start adaptive walk concurrency adjustment\nstartAdaptiveWalkAdjustment()'
);

fs.writeFileSync('src/injection-engine.ts', result, 'utf8');
console.log('Done');
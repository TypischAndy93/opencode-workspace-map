# Troubleshooting

## Common Issues

### Plugin Not Loading

**Symptoms:** No `[workspace-map]` logs, tool not registered

**Solutions:**
1. Check OpenCode version (requires v2.x+)
2. Verify plugin path in configuration
3. Check plugin loads: `[workspace-map] SETUP START`
4. Check OpenCode logs for errors

### Plugin Loads But No Injection

**Symptoms:** Plugin loads but no workspace map in context

**Check:**
1. `inject` not set to `"off"`
2. `broadRoot` not true (home dir detection)
3. `injectStrategy` not blocking
4. Files exist in workspace

### Missing Files in Map

**Symptoms:** Some files missing from tree

**Check:**
1. `ignore`/`ignoreExtra` patterns
2. `include` patterns not overriding
3. `.gitignore` rules
4. `maxFiles` limit reached
5. `maxFileBytes` limit
6. `autoDetectGenerated` skipping files
7. File in ignored directory (`.git`, `node_modules`, etc.)

### Summaries Show "(indexing…)"

**Symptoms:** File notes show `(indexing…)` instead of summary

**Cause:** Summarization hasn't completed yet
**Solution:** Wait for background summarization, or force refresh with `refresh: true`

### Slow Performance

**Symptoms:** Slow injections, high CPU

**Solutions:**
1. Reduce `maxFiles`, `maxFileBytes`
2. Switch to `outline` summarizer
3. Reduce `maxSummaries`, `maxInjectedChars`
4. Enable `autoDetectGenerated`
4. Disable `includeReverseDeps`
5. Increase `treeTtlMs`

### Memory Issues

**Symptoms:** High memory usage, OOM

**Solutions:**
1. Reduce `maxFiles`
2. Reduce `maxFileBytes`
3. Lower `maxSummaries`
4. Disable `includeReverseDeps`
5. Reduce `summarizeConcurrency`

### Watch Mode Issues

| Issue | Solution |
|-------|----------|
| High CPU | Increase `debounceMs`, enable `batchChanges` |
| Missed changes | Decrease `debounceMs`, check `pattern` |
| Missed deletions | Polling handles this (5s interval) |
| Not starting | Check `watchEnabled: true` |

### Model Summarizer Issues

| Issue | Solution |
|-------|----------|
| No summary | Check model availability: `ctx.model.default()` |
| Timeout | Increase `lspTimeoutMs` |
| Wrong model | Check `summaryModel` config |
| High cost | Enable `costTracking`, monitor |

### LSP Summarizer Issues

| Issue | Solution |
|-------|----------|
| No LSP | Check `ctx.lsp` availability |
| Timeout | Increase `lspTimeoutMs` |
| No symbols | Check language support |
| Fallback not working | Check `lspFallbackOnTimeout/Error` |

### Cache Issues

**Symptoms:** Stale summaries, missing updates

**Solutions:**
1. `workspace-map:clear-cache --confirm=true`
2. `workspace-map:dump --refresh=true`
3. Check `treeTtlMs` not too high

### Config Not Applied

**Symptoms:** Settings ignored

**Solutions:**
1. Check JSON syntax
2. Restart OpenCode
3. Check sidecar `config.json` location
4. Validate against schema

### Generated Files Not Skipped

**Solutions:**
1. Check `autoDetectGenerated: true`
2. Add custom patterns to `generatedPatterns`
4. Use `include` to force-summarize

### Monorepo Not Detected

**Solutions:**
1. Check config file exists (`pnpm-workspace.yaml`, `turbo.json`, etc.)
2. Verify `autoTune: true`
3. Check package.json workspaces field

## Debug Logging

Enable debug mode:
```json
{
  "debug": true
}
```

Output:
```
[workspace-map] walk completed: 247 files in 45ms
[workspace-map] summarize: src/file.ts in 2ms (outline)
[workspace-map] injection: 12.3KB in 3ms
```

## Reset Everything

```bash
workspace-map:clear-cache --confirm=true
```

Then restart OpenCode.

## Getting Help

1. Check [GitHub Issues](https://github.com/TypischAndy93/opencode-workspace-map/issues)
2. Enable `debug: true` and share logs
3. Share relevant config (redact secrets)
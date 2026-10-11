#!/usr/bin/env node
/**
 * Benchmark Suite for workspace-map summarizers
 * Measures: time, token cost (estimated), summary quality (heuristic)
 */

import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.join(__dirname, 'fixtures');
const RESULTS_DIR = path.join(__dirname, 'results');

// Quality scoring heuristic
function calculateQualityScore(summary) {
  let score = 0;
  const text = (summary.summary || '').toLowerCase();

  // Has meaningful summary (not just "X file · Y lines")
  if (!text.match(/^\w+ file · \d+ lines$/)) score += 20;

  // Has purpose
  if (summary.sections?.purpose) score += 20;

  // Has exports/definitions
  if (summary.sections?.keyExports?.length || (summary.symbols && summary.symbols.length)) score += 20;

  // Has dependencies/imports
  if (summary.sections?.dependencies?.length || (summary.imports && summary.imports.length)) score += 15;

  // Has todos
  if (summary.sections?.todos?.length) score += 10;

  // Length appropriateness (not too short, not too long)
  const len = (summary.summary || '').length;
  if (len > 50 && len < 500) score += 15;

  return Math.min(100, score);
}

// Run a single benchmark
async function runBenchmark(summarizerName, language, file, content, opts, stats) {
  const start = performance.now();

  try {
    const result = await global.summarizers.outlineSummarize(file, content, opts, stats);
    const durationMs = performance.now() - start;

    const qualityScore = calculateQualityScore(result);

    return {
      language,
      file,
      summarizer: summarizerName,
      durationMs: Math.round(durationMs * 100) / 100,
      summaryLength: (result.summary || '').length,
      symbolsCount: (result.symbols || []).length,
      importsCount: (result.imports || []).length,
      hasPurpose: !!result.sections?.purpose,
      hasExports: !!result.sections?.keyExports?.length,
      hasDependencies: !!result.sections?.dependencies?.length,
      hasTodos: !!result.sections?.todos?.length,
      qualityScore,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      language,
      file,
      summarizer: summarizerName,
      durationMs: performance.now() - start,
      summaryLength: 0,
      symbolsCount: 0,
      importsCount: 0,
      hasPurpose: false,
      hasExports: false,
      hasDependencies: false,
      hasTodos: false,
      qualityScore: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

// Discover benchmark files
async function discoverBenchmarkFiles() {
  const results = [];

  try {
    const languages = await fs.readdir(BENCHMARK_DIR);

    for (const lang of languages) {
      const langDir = path.join(BENCHMARK_DIR, lang);
      const stat = await fs.stat(langDir);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(langDir);

      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.txt')) continue; // Skip docs
        const filePath = path.join(langDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        results.push({ language: lang, file, content });
      }
    }
  } catch (err) {
    console.error('Error discovering benchmarks:', err);
  }

  return results;
}

// Main benchmark runner
async function run() {
  console.log('🚀 Starting workspace-map benchmark suite...\n');

  // Ensure results directory exists
  await fs.mkdir(RESULTS_DIR, { recursive: true });

  // Load summarizers
  const mod = await import('../src/summarizers/index.ts');
  global.summarizers = {
    outlineSummarize: mod.outlineSummarize,
  };

  // Mock options and stats
  const opts = {
    summaryLength: 'medium',
    summarySections: {
      includePurpose: true,
      includeKeyExports: true,
      includeDependencies: true,
      includeTodos: true,
      maxPurposeLength: 120,
      maxExports: 12,
      maxDependencies: 15,
      maxTodos: 8,
    },
    summaryLengthByExt: {
      ts: 500, tsx: 500, js: 500, jsx: 500,
      py: 500, go: 600, rs: 600, java: 600, kt: 600, cs: 600,
    }
  };

  const stats = {
    summaries: 0, skippedByRule: 0, walks: 0, fullInjections: 0, digestInjections: 0,
    dirtyFlushes: 0, warmups: 0, sessions: 0, files: 0, outlineSummaries: 0,
    modelSummaries: 0, skippedSummaries: 0, lastWalkMs: 0, lastInjectionChars: 0, lastInjectionAt: 0,
  };

  // Discover files
  const files = await discoverBenchmarkFiles();

  if (files.length === 0) {
    console.log('⚠️  No benchmark files found. Create fixtures in benchmarks/fixtures/<language>/');
    return;
  }

  console.log(`📁 Found ${files.length} benchmark files across ${new Set(files.map(f => f.language)).size} languages\n`);

  // Run benchmarks
  const results = [];

  for (const { language, file, content } of files) {
    console.log(`  📄 ${language}/${file}...`);

    // Run outline summarizer (fast, deterministic)
    const result = await runBenchmark('outline', language, file, content, opts, stats);
    results.push(result);

    console.log(`    ⏱️  ${result.durationMs}ms | 📝 ${result.summaryLength} chars | 🏷️  ${result.symbolsCount} symbols | ✨ ${result.qualityScore}/100`);
  }

  // Summary statistics
  console.log('\n📊 Benchmark Summary:');
  console.log('====================');

  const byLanguage = results.reduce((acc, r) => {
    if (!acc[r.language]) acc[r.language] = [];
    acc[r.language].push(r);
    return acc;
  }, {});

  for (const [lang, langResults] of Object.entries(byLanguage)) {
    const avgTime = langResults.reduce((s, r) => s + r.durationMs, 0) / langResults.length;
    const avgQuality = langResults.reduce((s, r) => s + r.qualityScore, 0) / langResults.length;
    const avgSymbols = langResults.reduce((s, r) => s + r.symbolsCount, 0) / langResults.length;
    const avgLength = langResults.reduce((s, r) => s + r.summaryLength, 0) / langResults.length;

    console.log(`\n  ${lang}:`);
    console.log(`    Files: ${langResults.length}`);
    console.log(`    Avg Time: ${avgTime.toFixed(2)}ms`);
    console.log(`    Avg Quality: ${avgQuality.toFixed(1)}/100`);
    console.log(`    Avg Symbols: ${avgSymbols.toFixed(1)}`);
    console.log(`    Avg Length: ${avgLength.toFixed(0)} chars`);
  }

  // Overall
  const overallAvgTime = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
  const overallAvgQuality = results.reduce((s, r) => s + r.qualityScore, 0) / results.length;

  console.log('\n  Overall:');
  console.log(`    Avg Time: ${overallAvgTime.toFixed(2)}ms`);
  console.log(`    Avg Quality: ${overallAvgQuality.toFixed(1)}/100`);

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(RESULTS_DIR, `benchmark-${timestamp}.json`);
  await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputFile}`);

  // Regression check (if previous results exist)
  await checkRegression(results);
}

async function checkRegression(currentResults) {
  try {
    const resultFiles = await fs.readdir(RESULTS_DIR);
    const prevFile = resultFiles
      .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
      .sort()
      .slice(-2, -1)[0]; // Second to last

    if (!prevFile) {
      console.log('\n✅ First run - no regression baseline');
      return;
    }

    const prevPath = path.join(RESULTS_DIR, prevFile);
    const prevResults = JSON.parse(await fs.readFile(prevPath, 'utf-8'));

    console.log('\n🔍 Regression Check:');
    console.log('====================');

    const byFile = (results) =>
      Object.fromEntries(results.map(r => [`${r.language}/${r.file}`, r]));

    const currentMap = byFile(currentResults);
    const prevMap = byFile(prevResults);

    let regressions = 0;
    let improvements = 0;

    for (const [key, current] of Object.entries(currentMap)) {
      const prev = prevMap[key];
      if (!prev) continue;

      const timeDiff = ((current.durationMs - prev.durationMs) / prev.durationMs) * 100;
      const qualityDiff = current.qualityScore - prev.qualityScore;

      if (timeDiff > 20) {
        console.log(`  ⚠️  ${key}: Time +${timeDiff.toFixed(1)}% (${prev.durationMs}ms → ${current.durationMs}ms)`);
        regressions++;
      } else if (timeDiff < -10) {
        console.log(`  ✅ ${key}: Time ${timeDiff.toFixed(1)}% (${prev.durationMs}ms → ${current.durationMs}ms)`);
        improvements++;
      }

      if (qualityDiff < -10) {
        console.log(`  ⚠️  ${key}: Quality ${qualityDiff.toFixed(1)} (${prev.qualityScore} → ${current.qualityScore})`);
        regressions++;
      } else if (qualityDiff > 5) {
        console.log(`  ✅ ${key}: Quality +${qualityDiff.toFixed(1)} (${prev.qualityScore} → ${current.qualityScore})`);
        improvements++;
      }
    }

    if (regressions === 0 && improvements === 0) {
      console.log('  ✅ No significant regressions or improvements');
    } else {
      console.log(`\n  Summary: ${regressions} regressions, ${improvements} improvements`);
    }
  } catch (err) {
    console.log('\n⚠️  Could not check regression:', err.message);
  }
}

run().catch(console.error);
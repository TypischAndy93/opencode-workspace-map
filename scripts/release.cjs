#!/usr/bin/env node
/**
 * Release Automation Script for workspace-map
 * Handles version bumping, changelog generation, and release tagging
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) throw new Error(`Invalid version: ${version}`);
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}${v.prerelease ? `-${v.prerelease}` : ''}`;
}

function bumpVersion(current, type, prereleaseLabel) {
  const v = parseVersion(current);
  
  switch (type) {
    case 'major':
      return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
    case 'patch':
      return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
    case 'prerelease':
      if (v.prerelease) {
        const [label, num] = v.prerelease.split('.');
        if (label === (prereleaseLabel || 'beta')) {
          return formatVersion({ ...v, prerelease: `${label}.${parseInt(num, 10) + 1}` });
        }
      }
      return formatVersion({ ...v, prerelease: `${prereleaseLabel || 'beta'}.1` });
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

function getGitLog(sinceTag) {
  try {
    const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
    const log = execSync(`git log ${range} --pretty=format:"%s|%h|%an|%ad" --date=short`, { 
      cwd: ROOT_DIR, 
      encoding: 'utf-8' 
    });
    return log.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function parseCommits(logLines) {
  const categories = {
    Features: [],
    Fixes: [],
    Performance: [],
    Documentation: [],
    Refactor: [],
    Tests: [],
    Chores: [],
    Breaking: [],
  };

  for (const line of logLines) {
    const [subject, hash, author, date] = line.split('|');
    
    // Skip merge commits
    if (subject.startsWith('Merge ')) continue;
    
    const commit = `  - ${subject} (${hash.slice(0, 7)})`;
    
    // Categorize by conventional commit prefix
    if (subject.match(/^(feat|feature)(\(.+\))?:/i)) {
      categories.Features.push(commit);
    } else if (subject.match(/^fix(\(.+\))?:/i)) {
      categories.Fixes.push(commit);
    } else if (subject.match(/^perf(\(.+\))?:/i)) {
      categories.Performance.push(commit);
    } else if (subject.match(/^docs?(\(.+\))?:/i)) {
      categories.Documentation.push(commit);
    } else if (subject.match(/^refactor(\(.+\))?:/i)) {
      categories.Refactor.push(commit);
    } else if (subject.match(/^test(\(.+\))?:/i)) {
      categories.Tests.push(commit);
    } else if (subject.match(/^chore(\(.+\))?:/i)) {
      categories.Chores.push(commit);
    } else if (subject.match(/^BREAKING CHANGE:/i) || subject.includes('!:')) {
      categories.Breaking.push(commit);
    } else {
      categories.Chores.push(commit);
    }
  }

  return categories;
}

function generateChangelogEntry(version, categories) {
  const date = new Date().toISOString().split('T')[0];
  const lines = [`## [${version}] - ${date}`, ''];

  // Breaking changes first
  if (categories.Breaking.length > 0) {
    lines.push('### ⚠️ Breaking Changes');
    lines.push(...categories.Breaking);
    lines.push('');
  }

  // Features
  if (categories.Features.length > 0) {
    lines.push('### ✨ Features');
    lines.push(...categories.Features);
    lines.push('');
  }

  // Fixes
  if (categories.Fixes.length > 0) {
    lines.push('### 🐛 Fixes');
    lines.push(...categories.Fixes);
    lines.push('');
  }

  // Performance
  if (categories.Performance.length > 0) {
    lines.push('### ⚡ Performance');
    lines.push(...categories.Performance);
    lines.push('');
  }

  // Refactor
  if (categories.Refactor.length > 0) {
    lines.push('### ♻️ Refactoring');
    lines.push(...categories.Refactor);
    lines.push('');
  }

  // Documentation
  if (categories.Documentation.length > 0) {
    lines.push('### 📚 Documentation');
    lines.push(...categories.Documentation);
    lines.push('');
  }

  // Tests
  if (categories.Tests.length > 0) {
    lines.push('### ✅ Tests');
    lines.push(...categories.Tests);
    lines.push('');
  }

  // Chores
  if (categories.Chores.length > 0) {
    lines.push('### 🔧 Chores');
    lines.push(...categories.Chores);
    lines.push('');
  }

  return lines.join('\n');
}

function getLastTag() {
  try {
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null', { 
      cwd: ROOT_DIR, 
      encoding: 'utf-8' 
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

async function updatePackageJson(version) {
  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON, 'utf-8'));
  pkg.version = version;
  await fs.writeFile(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
}

async function updateChangelog(version, entry) {
  let changelog = '';
  try {
    changelog = await fs.readFile(CHANGELOG_PATH, 'utf-8');
  } catch {
    // Create new changelog
    changelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
  }

  // Insert after the header
  const lines = changelog.split('\n');
  let insertIndex = 0;
  
  // Find first non-header line (skip title and "All notable changes...")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) {
      insertIndex = i;
      break;
    }
  }
  
  if (insertIndex === 0) {
    // No existing versions, append after header
    insertIndex = lines.findIndex(l => l.trim() === '') + 1;
    if (insertIndex <= 0) insertIndex = lines.length;
  }

  const newLines = [
    ...lines.slice(0, insertIndex),
    entry,
    '',
    ...lines.slice(insertIndex),
  ];

  await fs.writeFile(CHANGELOG_PATH, newLines.join('\n'));
}

async function createGitTag(version) {
  try {
    execSync(`git tag -a v${version} -m "Release v${version}"`, { cwd: ROOT_DIR });
    console.log(`✅ Created git tag: v${version}`);
  } catch (err) {
    console.error('⚠️  Failed to create git tag:', err);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node release.mjs <command> [options]

Commands:
  bump <major|minor|patch|prerelease>  Bump version and generate changelog
  changelog [version]                  Generate changelog for version (or latest)
  tag [version]                        Create git tag for version (or latest)
  dry-run <major|minor|patch>          Show what would happen without making changes

Options:
  --prerelease-label <label>           Label for prerelease (default: beta)
  --message <msg>                      Custom release message
  --no-tag                             Skip git tag creation
  --no-changelog                       Skip changelog update
  --help, -h                           Show this help

Examples:
  node release.mjs bump patch
  node release.mjs bump minor --prerelease-label alpha
  node release.mjs bump prerelease --no-tag
  node release.mjs dry-run minor
`);
    process.exit(0);
  }

  const command = args[0];
  
  if (!command) {
    console.error('❌ No command specified. Use --help for usage.');
    process.exit(1);
  }

  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON, 'utf-8'));
  const currentVersion = pkg.version;
  console.log(`📦 Current version: ${currentVersion}`);

  if (command === 'dry-run') {
    const bumpType = args[1];
    if (!bumpType || !['major', 'minor', 'patch', 'prerelease'].includes(bumpType)) {
      console.error('❌ Invalid bump type. Use: major, minor, patch, or prerelease');
      process.exit(1);
    }
    
    const prereleaseLabel = args.includes('--prerelease-label') 
      ? args[args.indexOf('--prerelease-label') + 1] 
      : 'beta';
    
    const newVersion = bumpVersion(currentVersion, bumpType, prereleaseLabel);
    console.log(`🔍 Dry run: ${currentVersion} → ${newVersion} (${bumpType})`);
    
    const lastTag = await getLastTag();
    const commits = await getGitLog(lastTag || undefined);
    const categories = parseCommits(commits);
    const entry = generateChangelogEntry(newVersion, categories);
    
    console.log('\n📝 Changelog preview:');
    console.log('====================');
    console.log(entry);
    return;
  }

  if (command === 'bump') {
    const bumpType = args[1];
    if (!bumpType || !['major', 'minor', 'patch', 'prerelease'].includes(bumpType)) {
      console.error('❌ Invalid bump type. Use: major, minor, patch, or prerelease');
      process.exit(1);
    }

    const prereleaseLabel = args.includes('--prerelease-label') 
      ? args[args.indexOf('--prerelease-label') + 1] 
      : 'beta';
    const noTag = args.includes('--no-tag');
    const noChangelog = args.includes('--no-changelog');
    const customMessage = args.includes('--message') 
      ? args[args.indexOf('--message') + 1] 
      : null;

    const newVersion = bumpVersion(currentVersion, bumpType, prereleaseLabel);
    console.log(`🔖 Bumping version: ${currentVersion} → ${newVersion}`);

    // Get commits since last tag
    const lastTag = await getLastTag();
    const commits = await getGitLog(lastTag || undefined);
    const categories = parseCommits(commits);
    const entry = generateChangelogEntry(newVersion, categories);

    if (!noChangelog) {
      console.log('📝 Updating changelog...');
      await updateChangelog(newVersion, entry);
      console.log('✅ Changelog updated');
    }

    console.log('📦 Updating package.json...');
    await updatePackageJson(newVersion);
    console.log('✅ package.json updated');

    // Run tests to verify
    console.log('🧪 Running tests...');
    try {
      execSync('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✅ Tests passed');
    } catch {
      console.error('❌ Tests failed - aborting release');
      process.exit(1);
    }

    // Type check
    console.log('🔍 Type checking...');
    try {
      execSync('npm run typecheck', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✅ Type check passed');
    } catch {
      console.error('❌ Type check failed - aborting release');
      process.exit(1);
    }

    if (!noTag) {
      await createGitTag(newVersion);
    }

    console.log(`\n🎉 Release v${newVersion} ready!`);
    console.log('Next steps:');
    console.log('  git push origin main --tags');
    console.log('  npm publish (if public)');
    return;
  }

  if (command === 'changelog') {
    const version = args[1] || currentVersion;
    const lastTag = await getLastTag();
    const commits = await getGitLog(lastTag || undefined);
    const categories = parseCommits(commits);
    const entry = generateChangelogEntry(version, categories);
    console.log(entry);
    return;
  }

  if (command === 'tag') {
    const version = args[1] || currentVersion;
    await createGitTag(version);
    return;
  }

  console.error(`❌ Unknown command: ${command}`);
  process.exit(1);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
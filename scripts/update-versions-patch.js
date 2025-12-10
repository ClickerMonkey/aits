#!/usr/bin/env node

/**
 * Smart patch version updater for @aeye monorepo
 *
 * Only increments patch versions for packages that have changed since the last version tag,
 * and automatically updates all packages that depend on them (transitively).
 *
 * Usage:
 *   node scripts/update-versions-patch.js
 *   npm run update:versions:patch
 *
 * How it works:
 *   1. Finds the most recent version tag in git
 *   2. Detects which packages have changed since that tag
 *   3. Bumps patch version for changed packages
 *   4. Recursively bumps patch version for packages that depend on changed packages
 *   5. Updates @aeye/* dependency versions accordingly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Parse a semantic version string
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Bump patch version
 */
function bumpPatchVersion(currentVersion) {
  const version = parseVersion(currentVersion);
  return `${version.major}.${version.minor}.${version.patch + 1}`;
}

/**
 * Get all package directories and their package.json data
 */
function getPackages() {
  const packagesDir = path.join(__dirname, '..', 'packages');
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

  const packages = new Map();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageDir = path.join(packagesDir, entry.name);
    const packageJsonPath = path.join(packageDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packages.set(packageJson.name, {
      dir: packageDir,
      path: packageJsonPath,
      json: packageJson,
      relativeDir: `packages/${entry.name}`,
    });
  }

  return packages;
}

/**
 * Get the most recent version tag from git
 */
function getLatestVersionTag() {
  try {
    const tags = execSync('git tag --list "v*" --sort=-v:refname', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (tags.length === 0) {
      log('No version tags found in git history', colors.yellow);
      return null;
    }

    return tags[0];
  } catch (error) {
    log('Error getting git tags: ' + error.message, colors.yellow);
    return null;
  }
}

/**
 * Get files that changed since a given git reference
 */
function getChangedFiles(since) {
  try {
    const files = execSync(`git diff --name-only ${since}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    return files;
  } catch (error) {
    log('Error getting changed files: ' + error.message, colors.yellow);
    return [];
  }
}

/**
 * Determine which packages have changes
 */
function getChangedPackages(packages, changedFiles) {
  const changedPackages = new Set();

  for (const [name, pkg] of packages) {
    const hasChanges = changedFiles.some(file =>
      file.startsWith(pkg.relativeDir + '/')
    );

    if (hasChanges) {
      changedPackages.add(name);
    }
  }

  return changedPackages;
}

/**
 * Build dependency graph (who depends on whom)
 */
function buildDependencyGraph(packages) {
  const dependents = new Map(); // package -> [packages that depend on it]

  for (const [name, pkg] of packages) {
    const deps = new Set();

    // Collect all @aeye/* dependencies
    if (pkg.json.dependencies) {
      for (const dep of Object.keys(pkg.json.dependencies)) {
        if (dep.startsWith('@aeye/')) {
          deps.add(dep);
        }
      }
    }
    if (pkg.json.devDependencies) {
      for (const dep of Object.keys(pkg.json.devDependencies)) {
        if (dep.startsWith('@aeye/')) {
          deps.add(dep);
        }
      }
    }
    if (pkg.json.peerDependencies) {
      for (const dep of Object.keys(pkg.json.peerDependencies)) {
        if (dep.startsWith('@aeye/')) {
          deps.add(dep);
        }
      }
    }

    // Register this package as a dependent of each dependency
    for (const dep of deps) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep).push(name);
    }
  }

  return dependents;
}

/**
 * Get all packages that need updating (changed packages + their dependents, transitively)
 */
function getPackagesToUpdate(changedPackages, dependencyGraph) {
  const toUpdate = new Set(changedPackages);
  const queue = [...changedPackages];

  while (queue.length > 0) {
    const pkg = queue.shift();
    const dependents = dependencyGraph.get(pkg) || [];

    for (const dependent of dependents) {
      if (!toUpdate.has(dependent)) {
        toUpdate.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return toUpdate;
}

/**
 * Update a package's version and its dependencies
 */
function updatePackage(pkg, newVersion, newVersions) {
  const packageJson = pkg.json;
  const oldVersion = packageJson.version;
  packageJson.version = newVersion;

  const depsUpdated = [];

  // Update @aeye/* dependencies to their new versions
  const updateDeps = (depsObj) => {
    if (!depsObj) return;

    for (const [dep, version] of Object.entries(depsObj)) {
      if (dep.startsWith('@aeye/') && newVersions.has(dep)) {
        const oldDep = version;
        const rangeMatch = version.match(/^([\^~])?/);
        const range = rangeMatch ? rangeMatch[1] || '' : '';
        depsObj[dep] = `${range}${newVersions.get(dep)}`;
        depsUpdated.push({ dep, old: oldDep, new: depsObj[dep] });
      }
    }
  };

  updateDeps(packageJson.dependencies);
  updateDeps(packageJson.devDependencies);
  updateDeps(packageJson.peerDependencies);

  // Write back with pretty formatting
  fs.writeFileSync(
    pkg.path,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  );

  return { name: packageJson.name, oldVersion, newVersion, depsUpdated };
}

/**
 * Update root package.json if any packages were updated
 */
function updateRootPackageJson(packages) {
  const rootPackageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));

  const oldVersion = packageJson.version;

  // Find the highest version among all packages
  let maxVersion = oldVersion;
  for (const [, pkg] of packages) {
    if (compareVersions(pkg.json.version, maxVersion) > 0) {
      maxVersion = pkg.json.version;
    }
  }

  const newVersion = maxVersion;
  packageJson.version = newVersion;

  fs.writeFileSync(
    rootPackageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  );

  return { oldVersion, newVersion };
}

/**
 * Compare two semantic versions
 */
function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  return p1.patch - p2.patch;
}

/**
 * Main function
 */
function main() {
  log('\n' + colors.bright + colors.cyan + '='.repeat(60) + colors.reset);
  log(colors.bright + colors.cyan + 'Smart Patch Version Updater' + colors.reset);
  log(colors.bright + colors.cyan + '='.repeat(60) + colors.reset + '\n');

  // Get all packages
  const packages = getPackages();
  log(`Found ${packages.size} packages in monorepo`, colors.blue);

  // Get latest version tag
  const latestTag = getLatestVersionTag();
  if (!latestTag) {
    log('\nNo version tags found. You might want to use update:versions instead.', colors.yellow);
    log('Exiting without making changes.\n', colors.yellow);
    return;
  }

  log(`Latest version tag: ${latestTag}`, colors.blue);

  // Get changed files since last tag
  const changedFiles = getChangedFiles(latestTag);
  if (changedFiles.length === 0) {
    log('\n' + colors.green + 'No changes detected since last version. Nothing to update!' + colors.reset + '\n');
    return;
  }

  log(`Files changed since ${latestTag}: ${changedFiles.length}`, colors.blue);

  // Determine which packages changed
  const changedPackages = getChangedPackages(packages, changedFiles);
  if (changedPackages.size === 0) {
    log('\n' + colors.green + 'No package changes detected. Nothing to update!' + colors.reset + '\n');
    return;
  }

  log('\n' + colors.bright + 'Packages with changes:' + colors.reset);
  for (const pkg of changedPackages) {
    log(`  • ${pkg}`, colors.yellow);
  }

  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(packages);

  // Get all packages that need updating (including dependents)
  const packagesToUpdate = getPackagesToUpdate(changedPackages, dependencyGraph);

  const additionalPackages = new Set(
    [...packagesToUpdate].filter(pkg => !changedPackages.has(pkg))
  );

  if (additionalPackages.size > 0) {
    log('\n' + colors.bright + 'Packages to update due to dependencies:' + colors.reset);
    for (const pkg of additionalPackages) {
      log(`  • ${pkg}`, colors.magenta);
    }
  }

  // Calculate new versions
  const newVersions = new Map();
  for (const pkgName of packagesToUpdate) {
    const pkg = packages.get(pkgName);
    const currentVersion = pkg.json.version;
    const newVersion = bumpPatchVersion(currentVersion);
    newVersions.set(pkgName, newVersion);
  }

  // Update packages
  log('\n' + colors.bright + 'Updating packages...' + colors.reset);
  const updates = [];

  for (const pkgName of packagesToUpdate) {
    const pkg = packages.get(pkgName);
    const newVersion = newVersions.get(pkgName);
    const result = updatePackage(pkg, newVersion, newVersions);
    updates.push(result);

    log(`\n  ${colors.bright}${result.name}${colors.reset}`, colors.cyan);
    log(`    Version: ${result.oldVersion} → ${result.newVersion}`, colors.green);

    if (result.depsUpdated.length > 0) {
      log(`    Dependencies updated:`, colors.blue);
      for (const dep of result.depsUpdated) {
        log(`      - ${dep.dep}: ${dep.old} → ${dep.new}`, colors.blue);
      }
    }
  }

  // Update root package.json
  log('\n' + colors.bright + 'Updating root package.json...' + colors.reset);
  const rootUpdate = updateRootPackageJson(packages);
  log(`  Version: ${rootUpdate.oldVersion} → ${rootUpdate.newVersion}`, colors.green);

  // Summary
  log('\n' + colors.bright + '='.repeat(60) + colors.reset);
  log(colors.bright + 'Summary:' + colors.reset);
  log(`  ${colors.green}✓${colors.reset} Updated ${updates.length} package(s)`);
  log(`    ${colors.yellow}•${colors.reset} ${changedPackages.size} changed since ${latestTag}`);
  if (additionalPackages.size > 0) {
    log(`    ${colors.magenta}•${colors.reset} ${additionalPackages.size} updated due to dependencies`);
  }

  const totalDepsUpdated = updates.reduce((sum, u) => sum + u.depsUpdated.length, 0);
  if (totalDepsUpdated > 0) {
    log(`  ${colors.green}✓${colors.reset} Updated ${totalDepsUpdated} @aeye/* dependencies`);
  }

  log('\n' + colors.bright + colors.green + 'Done!' + colors.reset);
  log('\n' + colors.bright + 'Next steps:' + colors.reset);
  log(`  1. Review the changes: ${colors.yellow}git diff${colors.reset}`);
  log(`  2. Commit the changes: ${colors.yellow}git add . && git commit -m "chore: bump patch versions"${colors.reset}`);
  log(`  3. Create a git tag: ${colors.yellow}git tag v${rootUpdate.newVersion}${colors.reset}`);
  log(`  4. Push changes: ${colors.yellow}git push && git push --tags${colors.reset}`);
  log(`  5. Publish packages: ${colors.yellow}npm run release${colors.reset}\n`);
}

// Run the script
try {
  main();
} catch (error) {
  log(`\nError: ${error.message}`, colors.yellow);
  console.error(error.stack);
  process.exit(1);
}

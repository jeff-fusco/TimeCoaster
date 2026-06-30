import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const roots = ['src', 'tests', 'scripts'];
const rootFiles = ['playwright.config.mjs'];
const extensions = new Set(['.js', '.mjs']);
const ignoredDirs = new Set([
  '.git',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results',
]);

async function findJavaScriptFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...await findJavaScriptFiles(fullPath));
      }
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [
  ...rootFiles,
  ...(await Promise.all(roots.map(findJavaScriptFiles))).flat(),
]
  .filter((file, index, allFiles) => allFiles.indexOf(file) === index)
  .flat()
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.log('No JavaScript files found.');
  process.exit(0);
}

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failures.push(file);
  }
}

if (failures.length > 0) {
  console.error(`Syntax check failed for ${failures.length} file(s).`);
  process.exit(1);
}

console.log(`Syntax checked ${files.length} file(s).`);

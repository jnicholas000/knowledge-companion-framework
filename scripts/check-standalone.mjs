import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const childGuard = 'KCF_STANDALONE_CHILD';

if (process.env[childGuard] === '1') {
  console.log('Standalone copy already active; skipping nested filtered-copy proof.');
  process.exit(0);
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rootNodeModules = join(repositoryRoot, 'node_modules');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'knowledge-companion-standalone-'));
const filteredRoot = join(temporaryRoot, 'repository');
const excludedPaths = [
  '.git',
  'node_modules',
  'integrations/starfleet',
  '.github/agents',
  '.codex',
  'knowledge-companion-framework.code-workspace',
];

function normalizedRelativePath(sourcePath) {
  return relative(repositoryRoot, sourcePath).split(sep).join('/');
}

function isExcluded(sourcePath) {
  const repositoryPath = normalizedRelativePath(sourcePath);
  return excludedPaths.some(
    (excludedPath) =>
      repositoryPath === excludedPath || repositoryPath.startsWith(`${excludedPath}/`),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: filteredRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

try {
  if (!existsSync(rootNodeModules)) {
    throw new Error('node_modules is missing; install root dependencies before checking standalone use.');
  }

  cpSync(repositoryRoot, filteredRoot, {
    recursive: true,
    filter: (sourcePath) => !isExcluded(sourcePath),
  });
  for (const excludedPath of excludedPaths) {
    if (existsSync(join(filteredRoot, excludedPath))) {
      throw new Error(`Filtered copy unexpectedly contains ${excludedPath}.`);
    }
  }
  symlinkSync(rootNodeModules, join(filteredRoot, 'node_modules'), 'dir');

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'user.name=Standalone Check',
    '-c',
    'user.email=standalone-check@example.invalid',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'Standalone validation baseline',
  ]);

  const guardedEnvironment = { ...process.env, [childGuard]: '1' };
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const checks = [
    ['test'],
    ['run', 'validate:schemas'],
    ['run', 'validate'],
    ['run', 'check:syntax'],
    ['run', 'check:ci'],
  ];

  for (const args of checks) {
    run(npmCommand, args, { env: guardedEnvironment });
  }

  console.log('Standalone filtered-copy validation passed.');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

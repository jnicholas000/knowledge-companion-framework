import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  canonicalizeChangeSet,
  identifyChangeSet,
  normalizeChangeSet,
  normalizeGitChangeSet,
  normalizeSyntheticProviderChangeSet
} from '../src/change-set.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const providerFixturePath = path.join(
  repositoryRoot,
  'test/fixtures/milestone-3/provider-change-set.json'
);
const observedAt = '2026-08-07T16:00:00Z';
const repositoryId = 'fixture.portable-repository';

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
    ...options
  });
  return stdout.trim();
}

async function createLocalGitHistory() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-change-normalization-'));
  await git(root, ['init', '--initial-branch=main']);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/original.js'), 'export const stable = true;\n');
  await fs.writeFile(path.join(root, 'src/removed.js'), 'export const removed = true;\n');
  await fs.writeFile(path.join(root, 'src/updated.js'), 'export const version = 1;\n');
  await fs.writeFile(path.join(root, 'unchanged.txt'), 'unchanged\n');
  await git(root, ['add', '.']);
  const gitEnvironment = {
    ...process.env,
    GIT_AUTHOR_NAME: 'KCF Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'KCF Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid'
  };
  await git(root, ['commit', '-m', 'base'], {
    env: {
      ...gitEnvironment,
      GIT_AUTHOR_DATE: '2026-08-07T14:00:00Z',
      GIT_COMMITTER_DATE: '2026-08-07T14:00:00Z'
    }
  });
  const baseRevision = await git(root, ['rev-parse', 'HEAD']);

  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'docs/added.md'), '# Added\n');
  await fs.writeFile(path.join(root, 'src/updated.js'), 'export const version = 2;\n');
  await fs.rm(path.join(root, 'src/removed.js'));
  await fs.rename(path.join(root, 'src/original.js'), path.join(root, 'src/renamed.js'));
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', 'target'], {
    env: {
      ...gitEnvironment,
      GIT_AUTHOR_DATE: '2026-08-07T15:00:00Z',
      GIT_COMMITTER_DATE: '2026-08-07T15:00:00Z'
    }
  });
  const targetRevision = await git(root, ['rev-parse', 'HEAD']);
  const nameStatus = await execFileAsync(
    'git',
    ['diff', '--name-status', '-z', '--find-renames=100%', baseRevision, targetRevision],
    { cwd: root, encoding: 'utf8' }
  );
  return { root, baseRevision, targetRevision, nameStatus: nameStatus.stdout };
}

async function loadProviderFixture(baseRevision, targetRevision) {
  const template = await fs.readFile(providerFixturePath, 'utf8');
  return JSON.parse(
    template
      .replace('{{base_revision}}', baseRevision)
      .replace('{{target_revision}}', targetRevision)
  );
}

function expectCode(code) {
  return (error) => error?.code === code;
}

test('local Git and synthetic provider shapes normalize to one change set', async () => {
  const history = await createLocalGitHistory();
  try {
    const providerInput = await loadProviderFixture(history.baseRevision, history.targetRevision);
    const gitResult = normalizeGitChangeSet({
      repository_id: repositoryId,
      base_revision: history.baseRevision,
      target_revision: history.targetRevision,
      observed_at: observedAt,
      name_status_z: history.nameStatus
    });
    const providerResult = normalizeSyntheticProviderChangeSet(providerInput);

    assert.deepEqual(providerResult, gitResult);
    assert.equal(canonicalizeChangeSet(providerResult), canonicalizeChangeSet(gitResult));
    assert.equal(identifyChangeSet(providerResult), identifyChangeSet(gitResult));
    assert.deepEqual(gitResult.changes, [
      { path: 'docs/added.md', change_type: 'added' },
      { path: 'src/removed.js', change_type: 'deleted' },
      { path: 'src/renamed.js', change_type: 'renamed', old_path: 'src/original.js' },
      { path: 'src/updated.js', change_type: 'modified' }
    ]);
    assert.equal(JSON.stringify(gitResult).includes('review_request'), false);
    assert.equal(JSON.stringify(gitResult).includes('provider_similarity'), false);
    assert.equal(JSON.stringify(gitResult).includes('cursor'), false);
  } finally {
    await fs.rm(history.root, { recursive: true, force: true });
  }
});

test('no-op change sets remain explicit and deterministic', () => {
  const input = {
    repository_id: repositoryId,
    base_revision: 'same-revision',
    target_revision: 'same-revision',
    observed_at: observedAt,
    name_status_z: ''
  };
  const result = normalizeGitChangeSet(input);
  assert.deepEqual(result.changes, []);
  assert.equal(result.completeness, 'complete');
  assert.deepEqual(result.limitations, []);
  assert.equal(canonicalizeChangeSet(result), canonicalizeChangeSet(structuredClone(result)));
});

test('observed_at rejects impossible dates and canonicalizes supported timestamps', () => {
  const input = {
    repository_id: repositoryId,
    base_revision: 'base',
    target_revision: 'target',
    completeness: 'complete',
    changes: [],
    limitations: []
  };
  for (const invalid of [
    '2026-02-31T16:00:00Z',
    '2026-13-01T16:00:00Z',
    '2026-04-31T16:00:00Z'
  ]) {
    assert.throws(
      () => normalizeChangeSet({ ...input, observed_at: invalid }),
      expectCode('change_set.observed_at_invalid')
    );
  }

  assert.equal(
    normalizeChangeSet({ ...input, observed_at: '2024-02-29T16:00:00Z' }).observed_at,
    '2024-02-29T16:00:00.000Z'
  );
  assert.equal(
    normalizeChangeSet({ ...input, observed_at: '2026-08-07T16:00:00Z' }).observed_at,
    '2026-08-07T16:00:00.000Z'
  );
  assert.equal(
    normalizeChangeSet({ ...input, observed_at: '2026-08-07T18:30:45+02:30' }).observed_at,
    '2026-08-07T16:00:45.000Z'
  );
});

test('normalization order is independent of provider order', async () => {
  const input = await loadProviderFixture('base', 'target');
  const reversed = structuredClone(input);
  reversed.files.reverse();
  assert.deepEqual(
    normalizeSyntheticProviderChangeSet(input),
    normalizeSyntheticProviderChangeSet(reversed)
  );
});

test('partial change evidence requires explicit limitations', () => {
  assert.throws(
    () => normalizeChangeSet({
      repository_id: repositoryId,
      base_revision: 'base',
      target_revision: 'target',
      observed_at: observedAt,
      completeness: 'partial',
      changes: [],
      limitations: []
    }),
    expectCode('change_set.partial_without_limitation')
  );
  const partial = normalizeChangeSet({
    repository_id: repositoryId,
    base_revision: 'base',
    target_revision: 'target',
    observed_at: observedAt,
    completeness: 'partial',
    changes: [],
    limitations: ['changed-file pagination was truncated']
  });
  assert.equal(partial.completeness, 'partial');
  assert.deepEqual(partial.limitations, ['changed-file pagination was truncated']);
});

test('missing revision identity and malformed adapter input fail closed', async () => {
  const providerInput = await loadProviderFixture('base', 'target');
  delete providerInput.revisions.from;
  assert.throws(
    () => normalizeSyntheticProviderChangeSet(providerInput),
    expectCode('change_set.revision_missing')
  );
  assert.throws(
    () => normalizeGitChangeSet({
      repository_id: repositoryId,
      base_revision: 'base',
      target_revision: 'target',
      observed_at: observedAt,
      name_status_z: 'A\0unterminated.txt'
    }),
    expectCode('change_set.malformed')
  );
  providerInput.revisions.from = 'base';
  providerInput.files[0].action = 'provider-only-status';
  assert.throws(
    () => normalizeSyntheticProviderChangeSet(providerInput),
    expectCode('change.type_invalid')
  );
  providerInput.files[0].action = 'moved';
  providerInput.page.complete = 'yes';
  assert.throws(
    () => normalizeSyntheticProviderChangeSet(providerInput),
    expectCode('change_set.malformed')
  );
});

test('ambiguous renames, conflicting paths, and unsafe paths fail closed', () => {
  const base = {
    repository_id: repositoryId,
    base_revision: 'base',
    target_revision: 'target',
    observed_at: observedAt,
    completeness: 'complete',
    limitations: []
  };
  assert.throws(
    () => normalizeChangeSet({
      ...base,
      changes: [{ path: 'same.js', old_path: 'same.js', change_type: 'renamed' }]
    }),
    expectCode('change.rename_ambiguous')
  );
  assert.throws(
    () => normalizeChangeSet({
      ...base,
      changes: [
        { path: 'same.js', change_type: 'added' },
        { path: 'same.js', change_type: 'modified' }
      ]
    }),
    expectCode('change.path_conflict')
  );
  assert.throws(
    () => normalizeChangeSet({
      ...base,
      changes: [{ path: '../escape.js', change_type: 'added' }]
    }),
    expectCode('path.invalid')
  );
  assert.throws(
    () => normalizeChangeSet({
      ...base,
      changes: [{ path: 'C:/escape.js', change_type: 'added' }]
    }),
    expectCode('path.invalid')
  );
});

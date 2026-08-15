import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validatePack } from '../src/validator.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const examplesRoot = path.join(repositoryRoot, 'examples');
const atlasPack = path.join(examplesRoot, 'atlas-notes');
const lumenPack = path.join(examplesRoot, 'lumen-observatory');
const fixedNow = new Date('2026-08-06T18:00:00Z');

async function replaceIn(packRoot, relativePath, before, after) {
  const filePath = path.join(packRoot, relativePath);
  const source = await fs.readFile(filePath, 'utf8');
  assert.ok(source.includes(before), `${relativePath} should contain mutation target`);
  await fs.writeFile(filePath, source.replace(before, after));
}

async function withLumenMutation(mutate, verify) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-companion-lumen-test-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  await fs.cp(lumenPack, packRoot, { recursive: true });
  try {
    await mutate(packRoot);
    const result = await validatePack(packRoot, { now: fixedNow, strict: true });
    await verify(result);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function hasCode(result, code) {
  return result.errors.some((error) => error.code === code);
}

test('both unrelated application packs pass strict validation independently', async () => {
  const [atlas, lumen] = await Promise.all([
    validatePack(atlasPack, { now: fixedNow, strict: true }),
    validatePack(lumenPack, { now: fixedNow, strict: true })
  ]);

  assert.equal(atlas.valid, true, JSON.stringify(atlas.errors, null, 2));
  assert.equal(lumen.valid, true, JSON.stringify(lumen.errors, null, 2));
  assert.deepEqual([atlas.pack.id, lumen.pack.id], [
    'example.atlas-notes',
    'example.lumen-observatory'
  ]);
  assert.equal(atlas.files_checked, 13);
  assert.equal(lumen.files_checked, 10);
  assert.equal(atlas.errors.length + atlas.warnings.length, 0);
  assert.equal(lumen.errors.length + lumen.warnings.length, 0);
});

test('Lumen allows execution ending exactly at the exclusive observing-window boundary', async () => {
  const [acceptedKnowledge, domainSource, acceptanceMatrix] = await Promise.all([
    fs.readFile(path.join(lumenPack, 'knowledge/observation-lifecycle.md'), 'utf8'),
    fs.readFile(path.join(lumenPack, 'sources/domain-model.md'), 'utf8'),
    fs.readFile(path.join(lumenPack, 'sources/test-matrix.md'), 'utf8')
  ]);

  assert.match(domainSource, /half-open UTC interval: its start is included and its end is excluded/i);
  assert.match(acceptanceMatrix, /required duration reaches beyond the exclusive end.*remains ineligible/i);
  assert.match(acceptedKnowledge, /execution must begin at or after the included start and before the excluded\s+end/i);
  assert.match(acceptedKnowledge, /ending\s+exactly at the window end is valid/i);
  assert.match(acceptedKnowledge, /extending beyond the boundary is ineligible/i);
});

test('Lumen requires complete application metadata', async () => {
  await withLumenMutation(
    (root) => replaceIn(root, 'pack.yaml', 'name: Lumen Observatory Example Pack\n', ''),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );
});

test('Lumen rejects an invalid internal knowledge relationship', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'knowledge/observation-lifecycle.md',
      'target: example.lumen-observatory.constraint.safety-gates',
      'target: example.lumen-observatory.constraint.missing'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.knowledge_missing'), true);
    }
  );
});

test('Lumen rejects undeclared relationship vocabulary', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'knowledge/observation-execution-tour.md',
      'type: x-blocked-by',
      'type: x-paused-by'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'extension.relationship_undeclared'), true);
    }
  );
});

test('Lumen strict validation rejects stale knowledge', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'knowledge/application-profile.md',
      'review_after: "2027-02-01"',
      'review_after: "2026-01-01"'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'freshness.review_due'), true);
    }
  );
});

test('Lumen rejects evidence that names an undeclared source', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'knowledge/application-profile.md',
      'source_id: example.lumen-observatory.repository',
      'source_id: example.lumen-observatory.unknown-source'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.source_missing'), true);
    }
  );
});

test('Lumen rejects an incorrect local source locator', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'knowledge/application-profile.md',
      'locator: sources/application-profile.md',
      'locator: sources/missing-application-profile.md'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evidence.path_missing'), true);
    }
  );
});

test('Lumen evaluation snapshots cannot inherit the Atlas Notes identity', async () => {
  await withLumenMutation(
    (root) => replaceIn(
      root,
      'evals/debug-weather-hold.case.yaml',
      'pack_id: example.lumen-observatory',
      'pack_id: example.atlas-notes'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'snapshot.pack_mismatch'), true);
    }
  );
});

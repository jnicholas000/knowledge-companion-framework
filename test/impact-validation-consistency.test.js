import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyKnowledgeImpact } from '../src/knowledge-impact.js';
import { captureDirectoryManifestSnapshot } from '../src/snapshot-interchange.js';
import { validatePack } from '../src/validator.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplePack = path.join(repositoryRoot, 'examples/atlas-notes');
const fixedNow = new Date('2026-08-05T18:00:00Z');

async function withPack(mutate, verify) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-impact-path-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  await fs.cp(examplePack, packRoot, { recursive: true });
  try {
    await mutate(packRoot);
    await verify(packRoot);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function replaceIn(packRoot, relativePath, before, after) {
  const filePath = path.join(packRoot, relativePath);
  const source = await fs.readFile(filePath, 'utf8');
  assert.ok(source.includes(before), `${relativePath} should contain mutation target`);
  await fs.writeFile(filePath, source.replace(before, after));
}

async function renameManifest(packRoot, manifestName) {
  const yamlPath = path.join(packRoot, 'pack.yaml');
  const manifestPath = path.join(packRoot, manifestName);
  if (manifestName === 'pack.json') {
    const { parse } = await import('yaml');
    const manifest = parse(await fs.readFile(yamlPath, 'utf8'));
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.unlink(yamlPath);
    return;
  }
  await fs.rename(yamlPath, manifestPath);
}

function changeSet(changedPath, repositoryId = 'fixture.atlas-notes-repository') {
  return {
    representation_version: '1.0',
    repository_id: repositoryId,
    base_revision: 'base',
    target_revision: 'target',
    observed_at: '2026-08-05T18:00:00Z',
    completeness: 'complete',
    limitations: [],
    changes: [{ path: changedPath, change_type: 'modified' }]
  };
}

async function classify(packRoot, changedPath, repositoryId = 'fixture.atlas-notes-repository') {
  const snapshot = (await captureDirectoryManifestSnapshot(packRoot)).export;
  return classifyKnowledgeImpact({
    change_set: changeSet(changedPath, repositoryId),
    snapshot_export: snapshot,
    expected_pack_id: snapshot.manifest.pack_id,
    expected_snapshot_id: snapshot.manifest.snapshot_id
  });
}

test('strict validation and impact classification both reject a trailing-slash path', async () => {
  await withPack(
    (packRoot) => replaceIn(
      packRoot,
      'knowledge/repository-port-decision.md',
      '  - sources/decisions/001-repository-port.md',
      '  - sources/decisions/'
    ),
    async (packRoot) => {
      const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
      assert.equal(validation.valid, false);
      const pathDiagnostic = validation.errors.find((item) => item.code === 'path.invalid');
      assert.deepEqual(pathDiagnostic, {
        severity: 'error',
        code: 'path.invalid',
        path: 'knowledge/repository-port-decision.md',
        instance_path: '/applies_to/0',
        message: 'applies_to path must be a portable relative path',
        guidance: 'Use an NFC-normalized forward-slash relative path or glob with no empty, dot, parent, or trailing-slash segment; use directory/** to match directory contents.'
      });
      await assert.rejects(
        () => classify(packRoot, 'sources/decisions/001-repository-port.md'),
        (error) => error?.code === 'impact.locator_invalid'
          && /applies_to.*portable relative path/.test(error.message)
      );
    }
  );
});

test('manifest trailing-slash paths produce actionable diagnostics alongside schema errors', async () => {
  await withPack(
    (packRoot) => replaceIn(
      packRoot,
      'pack.yaml',
      '    - knowledge/**/*.md',
      '    - knowledge/'
    ),
    async (packRoot) => {
      const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some((item) =>
        item.code === 'schema.invalid'
        && item.path === 'pack.yaml'
        && item.instance_path === '/content/knowledge/0'
      ));
      assert.ok(validation.errors.some((item) =>
        item.code === 'path.invalid'
        && item.path === 'pack.yaml'
        && item.instance_path === '/content/knowledge/0'
      ));
    }
  );
});

test('alternate manifests report non-NFC paths against their actual filenames', async () => {
  for (const manifestName of ['pack.yml', 'pack.json']) {
    await withPack(
      async (packRoot) => {
        await replaceIn(
          packRoot,
          'pack.yaml',
          '    - knowledge/**/*.md',
          '    - knowledge/e\u0301/**/*.md'
        );
        await renameManifest(packRoot, manifestName);
      },
      async (packRoot) => {
        const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((item) =>
          item.code === 'path.invalid'
          && item.path === manifestName
          && item.instance_path === '/content/knowledge/0'
          && /NFC normalization/.test(item.message)
        ));
        assert.ok(validation.errors.every((item) => item.path !== 'pack.yaml'));
      }
    );
  }
});

test('every classifier-visible path surface rejects trailing-slash syntax before classification', async () => {
  const mutations = [
    {
      before: '    locator: sources/decisions/001-repository-port.md',
      after: '    locator: sources/decisions/',
      instancePath: '/evidence/0/locator'
    },
    {
      before: '      value: sources/decisions/001-repository-port.md',
      after: '      value: sources/decisions/',
      instancePath: '/freshness/invalidation_triggers/0/value'
    },
    {
      before: '    target_kind: knowledge\n    target: example.atlas-notes.architecture.boundaries',
      after: '    target_kind: code\n    target: src/persistence/',
      instancePath: '/relationships/0/target'
    }
  ];

  for (const mutation of mutations) {
    await withPack(
      (packRoot) => replaceIn(
        packRoot,
        'knowledge/repository-port-decision.md',
        mutation.before,
        mutation.after
      ),
      async (packRoot) => {
        const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
        assert.equal(validation.valid, false);
        assert.ok(validation.errors.some((item) =>
          item.code === 'path.invalid' && item.instance_path === mutation.instancePath
        ));
        await assert.rejects(
          () => classify(packRoot, 'sources/decisions/001-repository-port.md'),
          (error) => error?.code === 'impact.locator_invalid'
        );
      }
    );
  }
});

test('a canonical directory glob passes strict validation and impact classification', async () => {
  await withPack(
    (packRoot) => replaceIn(
      packRoot,
      'knowledge/repository-port-decision.md',
      '  - sources/decisions/001-repository-port.md',
      '  - sources/decisions/**'
    ),
    async (packRoot) => {
      const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
      assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
      const assessment = await classify(packRoot, 'sources/decisions/new-decision.md');
      const decision = assessment.affected.find((item) =>
        item.knowledge_id === 'example.atlas-notes.decision.repository-port'
      );
      assert.equal(assessment.outcome, 'knowledge_update_required');
      assert.ok(decision.basis.some((item) =>
        item.type === 'applies_to'
        && item.locator === 'sources/decisions/**'
        && item.match === 'glob'
      ));
    }
  );
});

test('repository-bound mode uses declared sources to separate colliding local and external paths', async () => {
  const collisionPath = 'sources/decisions/001-repository-port.md';
  await withPack(
    async (packRoot) => {
      await replaceIn(
        packRoot,
        'pack.yaml',
        'content:\n',
        '  - id: fixture.bound-repository\n    kind: git\n    uri: https://example.invalid/bound-repository.git\n    description: Fictional external repository used for source-binding regression coverage.\ncontent:\n'
      );
      await replaceIn(
        packRoot,
        'knowledge/repository-port-decision.md',
        `      value: ${collisionPath}\n      description:`,
        `      value: ${collisionPath}\n      repository_id: fixture.bound-repository\n      description:`
      );
    },
    async (packRoot) => {
      const validation = await validatePack(packRoot, { now: fixedNow, strict: true });
      assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));

      const wrongRepository = await classify(packRoot, collisionPath, 'fixture.unrelated-repository');
      assert.equal(wrongRepository.outcome, 'no_knowledge_change');
      assert.deepEqual(wrongRepository.affected, []);
      assert.match(wrongRepository.rationale, /repository-bound source matching is active/i);

      const intendedRepository = await classify(packRoot, collisionPath, 'fixture.bound-repository');
      assert.equal(intendedRepository.outcome, 'knowledge_update_required');
      assert.ok(intendedRepository.affected.some((item) =>
        item.knowledge_id === 'example.atlas-notes.decision.repository-port'
        && item.basis.some((basis) =>
          basis.type === 'freshness_path'
          && basis.repository_id === 'fixture.bound-repository'
        )
      ));

      const localRepository = await classify(
        packRoot,
        collisionPath,
        'example.atlas-notes.repository'
      );
      assert.equal(localRepository.outcome, 'knowledge_update_required');
      assert.ok(localRepository.affected.some((item) =>
        item.knowledge_id === 'example.atlas-notes.decision.repository-port'
        && item.basis.some((basis) =>
          basis.type === 'applies_to' || basis.type === 'evidence_locator'
        )
      ));
    }
  );
});

test('ordinary unbound local packs retain local path matching when repository-bound mode is absent', async () => {
  const collisionPath = 'sources/decisions/001-repository-port.md';
  await withPack(
    async () => {},
    async (packRoot) => {
      const assessment = await classify(packRoot, collisionPath);
      assert.equal(assessment.outcome, 'knowledge_update_required');
      assert.ok(assessment.affected.some((item) =>
        item.knowledge_id === 'example.atlas-notes.decision.repository-port'
      ));
      assert.doesNotMatch(assessment.rationale, /repository-bound source matching is active/i);
    }
  );
});

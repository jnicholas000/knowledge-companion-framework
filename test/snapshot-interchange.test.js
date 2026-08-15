import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { discoverContentGroups, loadKnowledgeFile, loadStructuredFile } from '../src/formats.js';
import { sha256 } from '../src/interchange.js';
import {
  captureDirectoryManifestSnapshot,
  captureGitTreeSnapshot,
  createSnapshotExport,
  importSnapshotExport,
  importSnapshotToDirectory,
  readImportedRecord,
  verifySnapshotExport
} from '../src/snapshot-interchange.js';
import { validatePack } from '../src/validator.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const packs = [
  {
    relative: 'examples/atlas-notes',
    id: 'example.atlas-notes',
    revision: '0.1.0',
    recordCount: 12,
    snapshotId: 'sha256:5437dc39ad899bba76890926df6cf7ca36b98961ea5337f30dbb8e6bd1793a82'
  },
  {
    relative: 'examples/lumen-observatory',
    id: 'example.lumen-observatory',
    revision: '0.1.0',
    recordCount: 9,
    snapshotId: 'sha256:2e6e8676ae6ce5e417e401011bb482b92f141d85516d9b800db08d5fbb5735fd'
  }
];

function expectCode(code) {
  return (error) => error?.code === code;
}

async function currentRevision() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });
  return stdout.trim();
}

async function captureBoth(pack, revision) {
  return Promise.all([
    captureGitTreeSnapshot(repositoryRoot, pack.relative, revision),
    captureDirectoryManifestSnapshot(path.join(repositoryRoot, pack.relative), {
      repository_revision: revision
    })
  ]);
}

function importOptions(pack, overrides = {}) {
  return {
    expected_pack_id: pack.id,
    expected_target_revision: pack.revision,
    actual_target_revision: pack.revision,
    known_snapshot_ids: new Set(),
    ...overrides
  };
}

test('Git-tree and content-addressed manifest experiments converge for both packs', async () => {
  const revision = await currentRevision();
  for (const pack of packs) {
    const [gitCapture, directoryCapture] = await captureBoth(pack, revision);
    assert.equal(gitCapture.experiment.approach, 'git_tree_revision');
    assert.equal(directoryCapture.experiment.approach, 'content_addressed_manifest');
    assert.notEqual(gitCapture.experiment.source_identity, directoryCapture.experiment.source_identity);
    assert.deepEqual(gitCapture.export.manifest, directoryCapture.export.manifest);
    assert.deepEqual(gitCapture.export.objects, directoryCapture.export.objects);
    assert.equal(gitCapture.export.manifest.pack_id, pack.id);
    assert.equal(gitCapture.export.manifest.pack_revision, pack.revision);
    assert.equal(gitCapture.export.manifest.repository_revision, revision);
    assert.notEqual(gitCapture.export.manifest.snapshot_id, revision);
    assert.notEqual(gitCapture.export.manifest.snapshot_id, pack.revision);
    assert.equal(gitCapture.export.manifest.snapshot_id, pack.snapshotId);
    assert.equal(
      gitCapture.export.manifest.files.filter((file) => file.record_id).length,
      pack.recordCount
    );
  }
});

test('CRLF knowledge records use canonical parsing while revisions preserve exact bytes', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-snapshot-crlf-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  try {
    await fs.cp(path.join(repositoryRoot, packs[0].relative), packRoot, { recursive: true });
    const recordPath = path.join(packRoot, 'knowledge/architecture.md');
    const lfSource = await fs.readFile(recordPath, 'utf8');
    const exactBytes = Buffer.from(lfSource.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
    await fs.writeFile(recordPath, exactBytes);

    const validation = await validatePack(packRoot, { strict: true, now: new Date('2026-08-07T00:00:00Z') });
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    const canonicalRecord = await loadKnowledgeFile(recordPath);
    const capture = await captureDirectoryManifestSnapshot(packRoot);
    const entry = capture.export.manifest.files.find((file) => file.path === 'knowledge/architecture.md');
    assert.equal(entry.record_id, canonicalRecord.data.id);
    assert.equal(entry.record_revision, `sha256:${sha256(exactBytes)}`);
    assert.equal(entry.byte_size, exactBytes.length);

    const imported = importSnapshotExport(capture.export, importOptions(packs[0]));
    const read = readImportedRecord(imported, canonicalRecord.data.id);
    assert.equal(read.record_revision, `sha256:${sha256(exactBytes)}`);
    assert.deepEqual(read.bytes, exactBytes);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('only manifest-declared content groups receive record metadata', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-snapshot-content-groups-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  try {
    await fs.cp(path.join(repositoryRoot, packs[0].relative), packRoot, { recursive: true });
    const supportPath = path.join(packRoot, 'support/identity.yaml');
    const supportBytes = Buffer.from(
      'id: example.atlas-notes.architecture.boundaries\nrole: support-only\n'
    );
    await fs.mkdir(path.dirname(supportPath), { recursive: true });
    await fs.writeFile(supportPath, supportBytes);

    const validation = await validatePack(packRoot, { strict: true, now: new Date('2026-08-07T00:00:00Z') });
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    const capture = await captureDirectoryManifestSnapshot(packRoot);
    const supportEntry = capture.export.manifest.files.find((file) => file.path === 'support/identity.yaml');
    assert.ok(supportEntry);
    assert.equal(supportEntry.record_id, undefined);
    assert.equal(supportEntry.record_revision, undefined);
    assert.equal(supportEntry.content.digest, sha256(supportBytes));

    const manifest = await loadStructuredFile(path.join(packRoot, 'pack.yaml'));
    const snapshotPaths = capture.export.manifest.files.map((file) => file.path);
    const { discovered } = discoverContentGroups(manifest, snapshotPaths);
    const declaredRecordPaths = [...new Set([...discovered.values()].flat())].sort();
    const snapshotRecordPaths = capture.export.manifest.files
      .filter((file) => file.record_id)
      .map((file) => file.path)
      .sort();
    assert.deepEqual(snapshotRecordPaths, declaredRecordPaths);

    const imported = importSnapshotExport(capture.export, importOptions(packs[0]));
    assert.deepEqual(imported.files.get('support/identity.yaml'), supportBytes);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('snapshot export, import, and verification preserve identities and exact bytes', async () => {
  const revision = await currentRevision();
  for (const pack of packs) {
    const [gitCapture, directoryCapture] = await captureBoth(pack, revision);
    const importedFromGit = importSnapshotExport(gitCapture.export, importOptions(pack));
    const importedFromDirectory = importSnapshotExport(directoryCapture.export, importOptions(pack));
    assert.deepEqual(importedFromGit.manifest, importedFromDirectory.manifest);
    assert.equal(importedFromGit.files.size, gitCapture.export.manifest.files.length);
    for (const file of gitCapture.export.manifest.files) {
      assert.deepEqual(importedFromGit.files.get(file.path), importedFromDirectory.files.get(file.path));
    }
    assert.ok(
      gitCapture.export.manifest.files.some((file) => file.record_id && file.record_revision),
      `${pack.id} must preserve record identity and exact-byte revision`
    );
    const recordEntry = gitCapture.export.manifest.files.find((file) => file.record_id);
    const importedRecord = readImportedRecord(importedFromGit, recordEntry.record_id);
    assert.equal(importedRecord.record_revision, recordEntry.record_revision);
    assert.deepEqual(importedRecord.bytes, importedFromGit.files.get(recordEntry.path));
    assert.throws(
      () => readImportedRecord(importedFromGit, 'unknown.record'),
      expectCode('snapshot.record_missing')
    );
  }
});

test('exports cross from Git capture to directory capture and back to Git capture', async () => {
  const revision = await currentRevision();
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-snapshot-cross-import-'));
  try {
    for (const pack of packs) {
      const [gitCapture, directoryCapture] = await captureBoth(pack, revision);

      const directoryTarget = path.join(temporaryRoot, `${pack.id}-directory`);
      await importSnapshotToDirectory(gitCapture.export, directoryTarget, importOptions(pack));
      const recapturedDirectory = await captureDirectoryManifestSnapshot(directoryTarget, {
        repository_revision: revision
      });
      assert.equal(
        recapturedDirectory.export.manifest.snapshot_id,
        gitCapture.export.manifest.snapshot_id
      );
      assert.deepEqual(recapturedDirectory.export.objects, gitCapture.export.objects);

      const gitTarget = path.join(temporaryRoot, `${pack.id}-git`);
      await fs.mkdir(gitTarget);
      await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: gitTarget });
      const packTarget = path.join(gitTarget, 'pack');
      await importSnapshotToDirectory(directoryCapture.export, packTarget, importOptions(pack));
      await execFileAsync('git', ['add', '.'], { cwd: gitTarget });
      await execFileAsync(
        'git',
        [
          '-c',
          'user.name=KCF Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '--quiet',
          '--no-gpg-sign',
          '-m',
          'import snapshot'
        ],
        { cwd: gitTarget }
      );
      const recapturedGit = await captureGitTreeSnapshot(gitTarget, 'pack', 'HEAD');
      assert.equal(recapturedGit.export.manifest.snapshot_id, directoryCapture.export.manifest.snapshot_id);
      assert.deepEqual(recapturedGit.export.objects, directoryCapture.export.objects);
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('directory import recapture preserves complete snapshot limitations and identity', async () => {
  const revision = await currentRevision();
  const limitations = [
    'supporting media is intentionally excluded',
    'external source availability is not represented'
  ];
  const canonicalLimitations = [
    'external source availability is not represented',
    'supporting media is intentionally excluded'
  ];
  const capture = await captureDirectoryManifestSnapshot(
    path.join(repositoryRoot, packs[0].relative),
    {
      repository_revision: revision,
      completeness: 'complete',
      limitations
    }
  );
  const verified = verifySnapshotExport(capture.export);
  assert.equal(verified.manifest.completeness, 'complete');
  assert.deepEqual(verified.manifest.limitations, canonicalLimitations);

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-snapshot-limitations-'));
  try {
    const targetRoot = path.join(temporaryRoot, 'imported-pack');
    const imported = await importSnapshotToDirectory(
      capture.export,
      targetRoot,
      importOptions(packs[0])
    );
    const recaptured = await captureDirectoryManifestSnapshot(targetRoot, {
      repository_revision: imported.manifest.repository_revision ?? undefined,
      completeness: imported.manifest.completeness,
      limitations: imported.manifest.limitations
    });

    assert.equal(recaptured.export.manifest.snapshot_id, capture.export.manifest.snapshot_id);
    assert.deepEqual(recaptured.export.manifest.limitations, verified.manifest.limitations);
    assert.deepEqual(recaptured.export.manifest.limitations, canonicalLimitations);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('identical content and filesystem ordering produce a stable snapshot identity', async () => {
  const revision = await currentRevision();
  const capture = await captureDirectoryManifestSnapshot(
    path.join(repositoryRoot, packs[0].relative),
    { repository_revision: revision }
  );
  const verified = verifySnapshotExport(capture.export);
  const forward = [...verified.files].map(([filePath, bytes]) => ({ path: filePath, bytes }));
  const reverse = [...forward].reverse();
  const recreated = createSnapshotExport({ files: reverse, repositoryRevision: revision });
  assert.equal(recreated.manifest.snapshot_id, capture.export.manifest.snapshot_id);
  assert.deepEqual(recreated.manifest.files, capture.export.manifest.files);
});

test('accepted content mutation changes snapshot and record identity', async () => {
  const revision = await currentRevision();
  const capture = await captureDirectoryManifestSnapshot(
    path.join(repositoryRoot, packs[0].relative),
    { repository_revision: revision }
  );
  const verified = verifySnapshotExport(capture.export);
  const files = [...verified.files].map(([filePath, bytes]) => ({ path: filePath, bytes }));
  const record = capture.export.manifest.files.find((file) => file.record_id);
  const target = files.find((file) => file.path === record.path);
  target.bytes = Buffer.concat([target.bytes, Buffer.from('\n')]);
  const mutated = createSnapshotExport({ files, repositoryRevision: revision });
  assert.notEqual(mutated.manifest.snapshot_id, capture.export.manifest.snapshot_id);
  assert.notEqual(
    mutated.manifest.files.find((file) => file.path === record.path).record_revision,
    record.record_revision
  );
});

test('missing and mutated content fail verification', async () => {
  const capture = await captureDirectoryManifestSnapshot(path.join(repositoryRoot, packs[0].relative));
  const missing = structuredClone(capture.export);
  missing.objects.shift();
  assert.throws(() => verifySnapshotExport(missing), expectCode('snapshot.content_missing'));

  const mutated = structuredClone(capture.export);
  mutated.objects[0].bytes_base64 = Buffer.from('mutated content').toString('base64');
  assert.throws(
    () => verifySnapshotExport(mutated),
    expectCode('snapshot.content_digest_mismatch')
  );
});

test('partial imports, stale targets, duplicate identities, and cross-pack imports fail closed', async () => {
  const capture = await captureDirectoryManifestSnapshot(path.join(repositoryRoot, packs[0].relative));
  const partial = structuredClone(capture.export);
  partial.manifest.completeness = 'partial';
  partial.manifest.limitations = ['one content surface was unavailable'];
  assert.throws(() => verifySnapshotExport(partial), expectCode('snapshot.partial'));
  await assert.rejects(
    importSnapshotToDirectory(
      partial,
      path.join(os.tmpdir(), 'kcf-partial-snapshot-must-not-import'),
      importOptions(packs[0])
    ),
    expectCode('snapshot.partial')
  );

  assert.throws(
    () => importSnapshotExport(capture.export, importOptions(packs[0], {
      actual_target_revision: '0.2.0'
    })),
    expectCode('snapshot.stale_target_revision')
  );
  assert.throws(
    () => importSnapshotExport(capture.export, importOptions(packs[0], {
      known_snapshot_ids: new Set([capture.export.manifest.snapshot_id])
    })),
    expectCode('snapshot.duplicate_identity')
  );
  assert.throws(
    () => importSnapshotExport(capture.export, importOptions(packs[1])),
    expectCode('snapshot.pack_mismatch')
  );
});

test('manifest mutation, path reordering, and pack substitution fail closed', async () => {
  const [atlas, lumen] = await Promise.all([
    captureDirectoryManifestSnapshot(path.join(repositoryRoot, packs[0].relative)),
    captureDirectoryManifestSnapshot(path.join(repositoryRoot, packs[1].relative))
  ]);
  const identityMutation = structuredClone(atlas.export);
  identityMutation.manifest.pack_revision = '0.2.0';
  assert.throws(
    () => verifySnapshotExport(identityMutation),
    expectCode('snapshot.identity_mismatch')
  );

  const providerLeak = structuredClone(atlas.export);
  providerLeak.manifest.hosted_object_url = 'https://provider.invalid/object';
  assert.throws(
    () => verifySnapshotExport(providerLeak),
    expectCode('snapshot.manifest_invalid')
  );

  const recordSubstitution = structuredClone(atlas.export);
  const recordFiles = recordSubstitution.manifest.files.filter((file) => file.record_id);
  recordFiles[0].record_id = recordFiles[1].record_id;
  assert.throws(
    () => verifySnapshotExport(recordSubstitution),
    expectCode('snapshot.record_identity_mismatch')
  );

  const reordered = structuredClone(atlas.export);
  [reordered.manifest.files[0], reordered.manifest.files[1]] = [
    reordered.manifest.files[1],
    reordered.manifest.files[0]
  ];
  assert.throws(() => verifySnapshotExport(reordered), expectCode('snapshot.order_invalid'));

  const substitution = structuredClone(atlas.export);
  const atlasPackFile = substitution.manifest.files.find((file) => file.path === 'pack.yaml');
  const lumenPackFile = lumen.export.manifest.files.find((file) => file.path === 'pack.yaml');
  atlasPackFile.content = structuredClone(lumenPackFile.content);
  atlasPackFile.byte_size = lumenPackFile.byte_size;
  substitution.objects.push(
    structuredClone(lumen.export.objects.find(
      (object) => object.content.digest === lumenPackFile.content.digest
    ))
  );
  assert.throws(
    () => verifySnapshotExport(substitution),
    (error) => ['snapshot.content_unreferenced', 'snapshot.identity_mismatch'].includes(error?.code)
  );
});

test('duplicate records and unsafe export paths fail closed', async () => {
  const capture = await captureDirectoryManifestSnapshot(path.join(repositoryRoot, packs[0].relative));
  const verified = verifySnapshotExport(capture.export);
  const files = [...verified.files].map(([filePath, bytes]) => ({ path: filePath, bytes }));
  const records = capture.export.manifest.files.filter((file) => file.record_id);
  const duplicateFiles = [
    ...files,
    {
      path: 'knowledge/duplicate-record.md',
      bytes: Buffer.from(verified.files.get(records[0].path))
    }
  ];
  assert.throws(
    () => createSnapshotExport({ files: duplicateFiles }),
    expectCode('snapshot.record_duplicate')
  );
  assert.throws(
    () => createSnapshotExport({
      files: [
        { path: 'pack.yaml', bytes: verified.files.get('pack.yaml') },
        { path: '../escape.md', bytes: Buffer.from('unsafe') }
      ]
    }),
    expectCode('path.invalid')
  );
  assert.throws(
    () => createSnapshotExport({
      files: [
        { path: 'pack.yaml', bytes: verified.files.get('pack.yaml') },
        { path: 'C:/escape.md', bytes: Buffer.from('unsafe') }
      ]
    }),
    expectCode('path.invalid')
  );
});

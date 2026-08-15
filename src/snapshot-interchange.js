import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  contentGroups,
  discoverContentGroups,
  parseKnowledgeSource,
  parseStructuredSource
} from './formats.js';
import {
  InterchangeError,
  canonicalJson,
  compareUtf8,
  requireNonEmptyString,
  sha256,
  validatePortablePath
} from './interchange.js';

const execFileAsync = promisify(execFile);
const digestAlgorithm = 'sha256';
const digestPattern = /^[a-f0-9]{64}$/;

function assertExactKeys(value, allowedKeys, code, label) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new InterchangeError(code, `${label} has unsupported field ${unexpected.sort(compareUtf8)[0]}`);
  }
}

function parsePackManifest(bytes) {
  let manifest;
  try {
    manifest = parseStructuredSource(bytes.toString('utf8'), 'pack.yaml');
  } catch (error) {
    throw new InterchangeError('snapshot.manifest_invalid', `pack.yaml is invalid: ${error.message}`);
  }
  if (
    manifest.content === null
    || typeof manifest.content !== 'object'
    || Array.isArray(manifest.content)
    || contentGroups.some((group) => !Array.isArray(manifest.content[group]))
  ) {
    throw new InterchangeError('snapshot.manifest_invalid', 'pack.yaml content groups are invalid');
  }
  return manifest;
}

function parsePackIdentity(manifest) {
  return {
    pack_id: requireNonEmptyString(manifest.id, 'snapshot.pack_identity_invalid', 'pack id'),
    pack_revision: requireNonEmptyString(
      manifest.version,
      'snapshot.pack_identity_invalid',
      'pack revision'
    )
  };
}

function discoverRecordIds(packManifest, filesByPath) {
  const { discovered, overlaps } = discoverContentGroups(packManifest, [...filesByPath.keys()]);
  if (overlaps.length > 0) {
    const overlap = overlaps[0];
    throw new InterchangeError(
      'snapshot.record_identity_invalid',
      `${overlap.path} belongs to both ${overlap.priorOwner} and ${overlap.group}`
    );
  }

  const recordIds = new Map();
  for (const group of contentGroups) {
    for (const relativePath of discovered.get(group)) {
      const bytes = filesByPath.get(relativePath);
      try {
        const source = bytes.toString('utf8');
        const data = group === 'knowledge'
          ? parseKnowledgeSource(source, relativePath).data
          : parseStructuredSource(source, relativePath);
        recordIds.set(
          relativePath,
          requireNonEmptyString(data.id, 'snapshot.record_identity_invalid', `${relativePath} record id`)
        );
      } catch (error) {
        if (error instanceof InterchangeError) throw error;
        throw new InterchangeError(
          'snapshot.record_identity_invalid',
          `cannot parse declared ${group} record ${relativePath}: ${error.message}`
        );
      }
    }
  }
  return recordIds;
}

function identityProjection(manifest) {
  return {
    interchange_version: manifest.interchange_version,
    pack_id: manifest.pack_id,
    pack_revision: manifest.pack_revision,
    completeness: manifest.completeness,
    limitations: manifest.limitations,
    files: manifest.files
  };
}

function computeSnapshotId(manifest) {
  return `${digestAlgorithm}:${sha256(canonicalJson(identityProjection(manifest)))}`;
}

function normalizeLimitations(limitations) {
  if (!Array.isArray(limitations)) {
    throw new InterchangeError('snapshot.manifest_invalid', 'snapshot limitations must be an array');
  }
  const normalized = limitations.map((limitation) =>
    requireNonEmptyString(limitation, 'snapshot.manifest_invalid', 'snapshot limitation')
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new InterchangeError('snapshot.manifest_invalid', 'snapshot limitations must be unique');
  }
  return normalized.sort(compareUtf8);
}

export function createSnapshotExport({
  files,
  repositoryRevision,
  completeness = 'complete',
  limitations = []
}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new InterchangeError('snapshot.empty', 'snapshot must contain at least pack.yaml');
  }
  if (!['complete', 'partial'].includes(completeness)) {
    throw new InterchangeError('snapshot.manifest_invalid', 'snapshot completeness is invalid');
  }
  const normalizedLimitations = normalizeLimitations(limitations);
  if (completeness === 'partial' && normalizedLimitations.length === 0) {
    throw new InterchangeError('snapshot.partial_without_limitation', 'partial snapshots need a limitation');
  }

  const seenPaths = new Set();
  let normalizedFiles = files.map((file) => {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      throw new InterchangeError('snapshot.file_invalid', 'snapshot file entries must be objects');
    }
    const relativePath = validatePortablePath(file.path, 'snapshot file path');
    if (seenPaths.has(relativePath)) {
      throw new InterchangeError('snapshot.path_duplicate', `snapshot path ${relativePath} is duplicated`);
    }
    seenPaths.add(relativePath);
    if (!Buffer.isBuffer(file.bytes) && !(file.bytes instanceof Uint8Array) && typeof file.bytes !== 'string') {
      throw new InterchangeError('snapshot.file_invalid', `snapshot file ${relativePath} has no byte content`);
    }
    const bytes = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
    const digest = sha256(bytes);
    return {
      path: relativePath,
      byte_size: bytes.length,
      content: { algorithm: digestAlgorithm, digest },
      supplied_record_id: file.record_id,
      bytes
    };
  }).sort((left, right) => compareUtf8(left.path, right.path));

  const packEntry = normalizedFiles.find((file) => file.path === 'pack.yaml');
  if (!packEntry) {
    throw new InterchangeError('snapshot.pack_manifest_missing', 'snapshot must include pack.yaml');
  }
  const packManifest = parsePackManifest(packEntry.bytes);
  const recordIdsByPath = discoverRecordIds(
    packManifest,
    new Map(normalizedFiles.map((file) => [file.path, file.bytes]))
  );
  const seenRecordIds = new Set();
  normalizedFiles = normalizedFiles.map((file) => {
    const recordId = recordIdsByPath.get(file.path);
    if (file.supplied_record_id !== undefined && file.supplied_record_id !== recordId) {
      throw new InterchangeError(
        'snapshot.record_identity_mismatch',
        `record identity differs from canonical pack discovery for ${file.path}`
      );
    }
    if (recordId !== undefined) {
      if (seenRecordIds.has(recordId)) {
        throw new InterchangeError('snapshot.record_duplicate', `snapshot record ID ${recordId} is duplicated`);
      }
      seenRecordIds.add(recordId);
    }
    return {
      path: file.path,
      byte_size: file.byte_size,
      content: file.content,
      ...(recordId === undefined
        ? {}
        : {
          record_id: recordId,
          record_revision: `${digestAlgorithm}:${file.content.digest}`
        }),
      bytes: file.bytes
    };
  });
  const packIdentity = parsePackIdentity(packManifest);
  const manifest = {
    interchange_version: '1.0',
    snapshot_id: '',
    ...packIdentity,
    repository_revision: repositoryRevision === undefined
      ? null
      : requireNonEmptyString(
        repositoryRevision,
        'snapshot.repository_revision_invalid',
        'repository revision'
      ),
    completeness,
    limitations: normalizedLimitations,
    files: normalizedFiles.map(({ bytes, ...file }) => file)
  };
  manifest.snapshot_id = computeSnapshotId(manifest);

  const uniqueObjects = new Map();
  for (const file of normalizedFiles) uniqueObjects.set(file.content.digest, file.bytes);
  const objects = [...uniqueObjects.entries()]
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([digest, bytes]) => ({
      content: { algorithm: digestAlgorithm, digest },
      bytes_base64: bytes.toString('base64')
    }));

  return { manifest, objects };
}

async function walkDirectory(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new InterchangeError('snapshot.symlink_unsupported', 'snapshot experiments reject symbolic links');
    }
    if (entry.isDirectory()) files.push(...await walkDirectory(root, absolutePath));
    else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      files.push({ path: relativePath, bytes: await fs.readFile(absolutePath) });
    }
  }
  return files;
}

export async function captureDirectoryManifestSnapshot(packRoot, options = {}) {
  const absoluteRoot = await fs.realpath(packRoot);
  const files = await walkDirectory(absoluteRoot);
  const exported = createSnapshotExport({
    files,
    repositoryRevision: options.repository_revision,
    completeness: options.completeness,
    limitations: options.limitations
  });
  return {
    experiment: {
      approach: 'content_addressed_manifest',
      source_identity: exported.manifest.snapshot_id
    },
    export: exported
  };
}

function validateGitRevision(value) {
  requireNonEmptyString(value, 'snapshot.repository_revision_invalid', 'Git revision');
  if (value.startsWith('-') || !/^[A-Za-z0-9._/-]+$/.test(value)) {
    throw new InterchangeError('snapshot.repository_revision_invalid', 'Git revision is not safe to resolve');
  }
  return value;
}

export async function captureGitTreeSnapshot(repositoryRoot, relativePackPath, revision) {
  const portablePackPath = validatePortablePath(relativePackPath, 'relative pack path');
  const safeRevision = validateGitRevision(revision);
  let repositoryRevision;
  let treeIdentity;
  let output;
  try {
    ({ stdout: repositoryRevision } = await execFileAsync(
      'git',
      ['rev-parse', '--verify', `${safeRevision}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8' }
    ));
    ({ stdout: treeIdentity } = await execFileAsync(
      'git',
      ['rev-parse', '--verify', `${safeRevision}:${portablePackPath}`],
      { cwd: repositoryRoot, encoding: 'utf8' }
    ));
    ({ stdout: output } = await execFileAsync(
      'git',
      ['ls-tree', '-rz', '--full-tree', safeRevision, '--', portablePackPath],
      { cwd: repositoryRoot, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }
    ));
  } catch (error) {
    throw new InterchangeError('snapshot.git_capture_failed', `local Git capture failed: ${error.message}`);
  }

  const raw = Buffer.from(output).toString('utf8');
  const entries = raw === '' ? [] : raw.slice(0, -1).split('\0');
  const files = [];
  for (const entry of entries) {
    const separator = entry.indexOf('\t');
    const metadata = entry.slice(0, separator).split(' ');
    const repositoryPath = entry.slice(separator + 1);
    if (separator < 0 || metadata.length !== 3 || metadata[1] !== 'blob') {
      throw new InterchangeError('snapshot.git_entry_invalid', 'Git tree contains an unsupported entry');
    }
    const mode = metadata[0];
    if (mode === '120000') {
      throw new InterchangeError('snapshot.symlink_unsupported', 'snapshot experiments reject symbolic links');
    }
    const relativePath = repositoryPath.slice(`${portablePackPath}/`.length);
    let bytes;
    try {
      ({ stdout: bytes } = await execFileAsync(
        'git',
        ['cat-file', 'blob', metadata[2]],
        { cwd: repositoryRoot, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }
      ));
    } catch (error) {
      throw new InterchangeError('snapshot.git_capture_failed', `Git blob read failed: ${error.message}`);
    }
    files.push({ path: relativePath, bytes: Buffer.from(bytes) });
  }

  const exported = createSnapshotExport({
    files,
    repositoryRevision: repositoryRevision.trim()
  });
  return {
    experiment: {
      approach: 'git_tree_revision',
      source_identity: treeIdentity.trim()
    },
    export: exported
  };
}

function validateManifestShape(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new InterchangeError('snapshot.manifest_invalid', 'snapshot manifest must be an object');
  }
  if (manifest.interchange_version !== '1.0') {
    throw new InterchangeError('snapshot.version_unsupported', 'snapshot interchange version is unsupported');
  }
  assertExactKeys(
    manifest,
    [
      'interchange_version',
      'snapshot_id',
      'pack_id',
      'pack_revision',
      'repository_revision',
      'completeness',
      'limitations',
      'files'
    ],
    'snapshot.manifest_invalid',
    'snapshot manifest'
  );
  requireNonEmptyString(manifest.snapshot_id, 'snapshot.identity_invalid', 'snapshot id');
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.snapshot_id)) {
    throw new InterchangeError('snapshot.identity_invalid', 'snapshot id must be a SHA-256 identity');
  }
  requireNonEmptyString(manifest.pack_id, 'snapshot.pack_identity_invalid', 'pack id');
  requireNonEmptyString(manifest.pack_revision, 'snapshot.pack_identity_invalid', 'pack revision');
  if (manifest.repository_revision !== null) {
    requireNonEmptyString(
      manifest.repository_revision,
      'snapshot.repository_revision_invalid',
      'repository revision'
    );
  }
  if (!['complete', 'partial'].includes(manifest.completeness)) {
    throw new InterchangeError('snapshot.manifest_invalid', 'snapshot completeness is invalid');
  }
  const normalizedLimitations = normalizeLimitations(manifest.limitations);
  if (canonicalJson(normalizedLimitations) !== canonicalJson(manifest.limitations)) {
    throw new InterchangeError('snapshot.order_invalid', 'snapshot limitations must use canonical order');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new InterchangeError('snapshot.empty', 'snapshot manifest has no files');
  }
}

export function verifySnapshotExport(exported) {
  if (exported === null || typeof exported !== 'object' || Array.isArray(exported)) {
    throw new InterchangeError('snapshot.export_invalid', 'snapshot export must be an object');
  }
  const { manifest } = exported;
  validateManifestShape(manifest);
  if (manifest.completeness !== 'complete') {
    throw new InterchangeError('snapshot.partial', 'partial snapshots cannot be imported as verified');
  }
  if (!Array.isArray(exported.objects)) {
    throw new InterchangeError('snapshot.export_invalid', 'snapshot content objects must be an array');
  }

  const objects = new Map();
  for (const object of exported.objects) {
    if (
      object === null
      || typeof object !== 'object'
      || Array.isArray(object)
      || object.content?.algorithm !== digestAlgorithm
      || typeof object.content?.digest !== 'string'
      || typeof object.bytes_base64 !== 'string'
    ) {
      throw new InterchangeError('snapshot.content_invalid', 'snapshot content object is malformed');
    }
    assertExactKeys(object, ['content', 'bytes_base64'], 'snapshot.content_invalid', 'content object');
    assertExactKeys(
      object.content,
      ['algorithm', 'digest'],
      'snapshot.content_invalid',
      'content identity'
    );
    if (!digestPattern.test(object.content.digest)) {
      throw new InterchangeError('snapshot.content_invalid', 'snapshot content digest is invalid');
    }
    if (objects.has(object.content.digest)) {
      throw new InterchangeError('snapshot.content_duplicate', `content ${object.content.digest} is duplicated`);
    }
    const bytes = Buffer.from(object.bytes_base64, 'base64');
    if (bytes.toString('base64') !== object.bytes_base64) {
      throw new InterchangeError('snapshot.content_invalid', 'snapshot content is not canonical base64');
    }
    if (sha256(bytes) !== object.content.digest) {
      throw new InterchangeError('snapshot.content_digest_mismatch', `content ${object.content.digest} was mutated`);
    }
    objects.set(object.content.digest, bytes);
  }

  const paths = new Set();
  const recordIds = new Set();
  const referencedDigests = new Set();
  let priorPath;
  for (const file of manifest.files) {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      throw new InterchangeError('snapshot.file_invalid', 'snapshot file entry is malformed');
    }
    assertExactKeys(
      file,
      ['path', 'byte_size', 'content', 'record_id', 'record_revision'],
      'snapshot.file_invalid',
      'snapshot file entry'
    );
    if (file.content === null || typeof file.content !== 'object' || Array.isArray(file.content)) {
      throw new InterchangeError('snapshot.file_invalid', `snapshot file ${file.path} has invalid content identity`);
    }
    assertExactKeys(
      file.content,
      ['algorithm', 'digest'],
      'snapshot.file_invalid',
      'snapshot file content identity'
    );
    validatePortablePath(file.path, 'snapshot file path');
    if (paths.has(file.path)) {
      throw new InterchangeError('snapshot.path_duplicate', `snapshot path ${file.path} is duplicated`);
    }
    if (priorPath !== undefined && compareUtf8(priorPath, file.path) >= 0) {
      throw new InterchangeError('snapshot.order_invalid', 'snapshot files must use canonical path order');
    }
    priorPath = file.path;
    paths.add(file.path);
    if (
      !Number.isSafeInteger(file.byte_size)
      || file.byte_size < 0
      || file.content?.algorithm !== digestAlgorithm
      || typeof file.content?.digest !== 'string'
      || !digestPattern.test(file.content.digest)
    ) {
      throw new InterchangeError('snapshot.file_invalid', `snapshot file ${file.path} is malformed`);
    }
    const bytes = objects.get(file.content.digest);
    if (!bytes) {
      throw new InterchangeError('snapshot.content_missing', `snapshot content for ${file.path} is missing`);
    }
    if (bytes.length !== file.byte_size) {
      throw new InterchangeError('snapshot.content_size_mismatch', `snapshot content size differs for ${file.path}`);
    }
    referencedDigests.add(file.content.digest);
  }

  for (const digest of objects.keys()) {
    if (!referencedDigests.has(digest)) {
      throw new InterchangeError('snapshot.content_unreferenced', `snapshot content ${digest} is not referenced`);
    }
  }
  const packDigest = manifest.files.find((file) => file.path === 'pack.yaml')?.content.digest;
  if (!packDigest) {
    throw new InterchangeError('snapshot.pack_manifest_missing', 'snapshot must include pack.yaml');
  }
  const packManifest = parsePackManifest(objects.get(packDigest));
  const recordIdsByPath = discoverRecordIds(
    packManifest,
    new Map(manifest.files.map((file) => [file.path, objects.get(file.content.digest)]))
  );
  for (const file of manifest.files) {
    const contentRecordId = recordIdsByPath.get(file.path);
    if (file.record_id !== undefined) {
      requireNonEmptyString(file.record_id, 'snapshot.record_identity_invalid', 'record id');
      if (recordIds.has(file.record_id)) {
        throw new InterchangeError('snapshot.record_duplicate', `snapshot record ID ${file.record_id} is duplicated`);
      }
      recordIds.add(file.record_id);
      if (file.record_revision !== `${digestAlgorithm}:${file.content.digest}`) {
        throw new InterchangeError(
          'snapshot.record_revision_mismatch',
          `record revision differs from exact content for ${file.record_id}`
        );
      }
      if (contentRecordId !== file.record_id) {
        throw new InterchangeError(
          'snapshot.record_identity_mismatch',
          `record identity differs from canonical pack discovery for ${file.path}`
        );
      }
    } else if (file.record_revision !== undefined) {
      throw new InterchangeError('snapshot.record_identity_invalid', 'record revision requires a record ID');
    } else if (contentRecordId !== undefined) {
      throw new InterchangeError(
        'snapshot.record_identity_mismatch',
        `manifest omits record identity for declared record ${file.path}`
      );
    }
  }
  const expectedSnapshotId = computeSnapshotId(manifest);
  if (manifest.snapshot_id !== expectedSnapshotId) {
    throw new InterchangeError('snapshot.identity_mismatch', 'snapshot identity does not match its manifest');
  }
  const packIdentity = parsePackIdentity(packManifest);
  if (packIdentity.pack_id !== manifest.pack_id || packIdentity.pack_revision !== manifest.pack_revision) {
    throw new InterchangeError('snapshot.pack_identity_mismatch', 'pack.yaml identity differs from the manifest');
  }

  return {
    manifest: structuredClone(manifest),
    files: new Map(manifest.files.map((file) => [file.path, Buffer.from(objects.get(file.content.digest))]))
  };
}

export function importSnapshotExport(exported, options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new InterchangeError('snapshot.import_target_invalid', 'snapshot import target is required');
  }
  const expectedPackId = requireNonEmptyString(
    options.expected_pack_id,
    'snapshot.import_target_invalid',
    'expected pack id'
  );
  const expectedTargetRevision = requireNonEmptyString(
    options.expected_target_revision,
    'snapshot.import_target_invalid',
    'expected target revision'
  );
  const actualTargetRevision = requireNonEmptyString(
    options.actual_target_revision,
    'snapshot.import_target_invalid',
    'actual target revision'
  );
  if (expectedTargetRevision !== actualTargetRevision) {
    throw new InterchangeError(
      'snapshot.stale_target_revision',
      `target revision is ${actualTargetRevision}; expected ${expectedTargetRevision}`
    );
  }
  const verified = verifySnapshotExport(exported);
  if (verified.manifest.pack_id !== expectedPackId) {
    throw new InterchangeError(
      'snapshot.pack_mismatch',
      `snapshot pack is ${verified.manifest.pack_id}; expected ${expectedPackId}`
    );
  }
  const knownSnapshotIds = options.known_snapshot_ids ?? new Set();
  if (!(knownSnapshotIds instanceof Set)) {
    throw new InterchangeError('snapshot.import_target_invalid', 'known snapshot IDs must be a Set');
  }
  if (knownSnapshotIds.has(verified.manifest.snapshot_id)) {
    throw new InterchangeError('snapshot.duplicate_identity', 'snapshot identity already exists at the target');
  }
  return verified;
}

export async function importSnapshotToDirectory(exported, targetRoot, options) {
  const verified = importSnapshotExport(exported, options);
  const absoluteTarget = path.resolve(targetRoot);
  const parent = await fs.realpath(path.dirname(absoluteTarget));
  try {
    await fs.lstat(absoluteTarget);
    throw new InterchangeError('snapshot.import_target_exists', 'snapshot import target already exists');
  } catch (error) {
    if (error instanceof InterchangeError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }

  let stagingRoot = await fs.mkdtemp(path.join(parent, '.kcf-snapshot-import-'));
  try {
    for (const [relativePath, bytes] of verified.files) {
      const destination = path.join(stagingRoot, ...relativePath.split('/'));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes, { flag: 'wx' });
    }
    const recaptured = await captureDirectoryManifestSnapshot(stagingRoot, {
      repository_revision: verified.manifest.repository_revision ?? undefined,
      completeness: verified.manifest.completeness,
      limitations: verified.manifest.limitations
    });
    if (recaptured.export.manifest.snapshot_id !== verified.manifest.snapshot_id) {
      throw new InterchangeError('snapshot.import_verification_failed', 'materialized snapshot identity changed');
    }
    await fs.rename(stagingRoot, absoluteTarget);
    stagingRoot = null;
    return { ...verified, materialized_path: absoluteTarget };
  } catch (error) {
    if (stagingRoot !== null) await fs.rm(stagingRoot, { recursive: true, force: true });
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
      throw new InterchangeError('snapshot.import_target_exists', 'snapshot import target already exists');
    }
    throw error;
  }
}

export function readImportedRecord(imported, recordId) {
  requireNonEmptyString(recordId, 'snapshot.record_identity_invalid', 'record id');
  if (
    imported === null
    || typeof imported !== 'object'
    || !Array.isArray(imported.manifest?.files)
    || !(imported.files instanceof Map)
  ) {
    throw new InterchangeError('snapshot.import_invalid', 'verified imported snapshot is required');
  }
  const entry = imported.manifest.files.find((file) => file.record_id === recordId);
  if (!entry) {
    throw new InterchangeError('snapshot.record_missing', `snapshot does not contain record ${recordId}`);
  }
  const bytes = imported.files.get(entry.path);
  if (!bytes) {
    throw new InterchangeError('snapshot.content_missing', `imported content for ${recordId} is missing`);
  }
  return {
    record_id: entry.record_id,
    record_revision: entry.record_revision,
    path: entry.path,
    bytes: Buffer.from(bytes)
  };
}

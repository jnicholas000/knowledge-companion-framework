import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyKnowledgeImpact,
  verifyKnowledgeImpactAssessment
} from '../src/knowledge-impact.js';
import {
  captureDirectoryManifestSnapshot,
  createSnapshotExport,
  verifySnapshotExport
} from '../src/snapshot-interchange.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'test/fixtures/milestone-4/classification-cases.json'),
  'utf8'
));
const packRoots = new Map([
  ['example.atlas-notes', path.join(repositoryRoot, 'examples/atlas-notes')],
  ['example.lumen-observatory', path.join(repositoryRoot, 'examples/lumen-observatory')]
]);
const snapshots = new Map();
for (const [packId, packRoot] of packRoots) {
  snapshots.set(packId, (await captureDirectoryManifestSnapshot(packRoot)).export);
}

function classify(caseFixture, overrides = {}) {
  const snapshot = overrides.snapshot_export ?? snapshots.get(caseFixture.pack_id);
  return classifyKnowledgeImpact({
    change_set: overrides.change_set ?? caseFixture.change_set,
    snapshot_export: snapshot,
    expected_pack_id: overrides.expected_pack_id ?? caseFixture.pack_id,
    expected_snapshot_id: overrides.expected_snapshot_id ?? snapshot.manifest.snapshot_id
  });
}

function selectCase(id) {
  return fixture.cases.find((caseFixture) => caseFixture.id === id);
}

function expectedCore(caseFixture) {
  return (caseFixture.expected.affected ?? []).map((item) => ({
    knowledge_id: item.knowledge_id,
    review_requirement: item.review_requirement,
    triggering_paths: item.triggering_paths
  }));
}

function actualCore(result) {
  return result.affected.map((item) => ({
    knowledge_id: item.knowledge_id,
    review_requirement: item.review_requirement,
    triggering_paths: item.triggering_paths
  }));
}

function expectCode(code) {
  return (error) => error?.code === code;
}

function assertImpactOnly(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'candidate_id',
    'candidate_ids',
    'proposed_changes',
    'approval',
    'writeback',
    'mutation'
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `must omit ${forbidden}`);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function snapshotWithMutation(packId, relativePath, transform) {
  const original = snapshots.get(packId);
  const verified = verifySnapshotExport(original);
  const files = [...verified.files].map(([filePath, bytes]) => ({
    path: filePath,
    bytes: filePath === relativePath ? transform(bytes.toString('utf8')) : bytes
  }));
  return createSnapshotExport({
    files,
    repositoryRevision: original.manifest.repository_revision ?? undefined
  });
}

test('reviewed Atlas and Lumen fixture matrix matches every expected classification', () => {
  assert.equal(fixture.review_state, 'independently_reviewed');
  assert.deepEqual(
    [...snapshots].map(([packId, snapshot]) => [packId, snapshot.manifest.snapshot_id]),
    Object.entries(fixture.packs).map(([packId, pack]) => [packId, pack.snapshot_id])
  );

  const observedClasses = new Set();
  for (const caseFixture of fixture.cases) {
    const result = classify(caseFixture);
    assert.equal(result.outcome, caseFixture.expected.outcome, caseFixture.id);
    assert.deepEqual(actualCore(result), expectedCore(caseFixture), caseFixture.id);
    assert.deepEqual(result.limitations, caseFixture.expected.limitations ?? [], caseFixture.id);
    for (const excluded of caseFixture.expected.excluded ?? []) {
      assert.equal(
        result.affected.some((item) => item.knowledge_id === excluded.knowledge_id),
        false,
        `${caseFixture.id} must exclude ${excluded.knowledge_id}`
      );
    }
    for (const affected of result.affected) {
      observedClasses.add(affected.review_requirement);
      assert.ok(affected.explanation.length > 20);
      assert.ok(affected.basis.length > 0);
      assert.ok(['strong', 'bounded', 'limited'].includes(affected.evidence_strength));
    }
    assertImpactOnly(result);
  }
  assert.deepEqual(
    [...observedClasses].sort(),
    ['interpretive', 'mechanical', 'sme_required']
  );
});

test('direct modification and deletion retain mechanical evidence without implying auto-update', () => {
  for (const id of ['atlas.direct-source-modified', 'lumen.direct-source-deleted']) {
    const result = classify(selectCase(id));
    assert.equal(result.outcome, 'knowledge_update_required');
    assert.ok(result.affected.some((item) => item.review_requirement === 'mechanical'));
    assertImpactOnly(result);
  }
});

test('mixed exact and glob-only paths retain interpretive review', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const mixed = structuredClone(caseFixture.change_set);
  mixed.changes.push({
    path: 'sources/decisions/new.md',
    change_type: 'added'
  });

  const result = classify(caseFixture, { change_set: mixed });
  const architecture = result.affected.find((item) =>
    item.knowledge_id === 'example.atlas-notes.architecture.boundaries'
  );
  assert.equal(architecture.review_requirement, 'interpretive');
  assert.deepEqual(
    architecture.triggering_paths,
    ['sources/decisions/new.md', 'sources/system-overview.md']
  );
  assert.ok(architecture.basis.some((signal) => signal.match === 'exact'));
  assert.ok(architecture.basis.some((signal) => signal.match === 'glob'));
  assert.match(architecture.explanation, /engineering judgment/i);
});

test('rename evidence preserves stable old and new paths', () => {
  const result = classify(selectCase('atlas.renamed-source-path'));
  for (const affected of result.affected) {
    assert.deepEqual(
      affected.triggering_paths,
      ['sources/system-architecture.md', 'sources/system-overview.md']
    );
  }
});

test('architecture relationships are interpretive and evidence-linked domain ambiguity requires SME review', () => {
  const architecture = classify(selectCase('atlas.related-architecture-path'));
  assert.equal(
    architecture.affected.find((item) =>
      item.knowledge_id === 'example.atlas-notes.architecture.boundaries'
    ).review_requirement,
    'interpretive'
  );
  const domain = classify(selectCase('lumen.business-domain-ambiguity'));
  assert.equal(
    domain.affected.find((item) =>
      item.knowledge_id === 'example.lumen-observatory.constraint.safety-gates'
    ).review_requirement,
    'sme_required'
  );
});

test('one change can affect multiple records and multiple files can affect one record', () => {
  assert.equal(classify(selectCase('atlas.direct-source-modified')).affected.length, 4);
  const result = classify(selectCase('lumen.multiple-files-one-record'));
  assert.deepEqual(
    result.affected.find((item) =>
      item.knowledge_id === 'example.lumen-observatory.architecture.event-execution'
    ).triggering_paths,
    ['sources/architecture.md', 'sources/test-matrix.md']
  );
});

test('complete no-op and supported unrelated changes produce qualified no-change', () => {
  for (const id of ['lumen.complete-no-op', 'atlas.unrelated-file-added']) {
    const result = classify(selectCase(id));
    assert.equal(result.outcome, 'no_knowledge_change');
    assert.deepEqual(result.affected, []);
    assert.match(result.rationale, /complete/i);
  }
});

test('partial unmatched evidence remains indeterminate with its limitation', () => {
  const result = classify(selectCase('atlas.partial-unmatched'));
  assert.equal(result.outcome, 'indeterminate');
  assert.deepEqual(result.affected, []);
  assert.deepEqual(result.limitations, ['changed-file pagination was truncated']);
  assert.match(result.rationale, /partial/i);
});

test('partial matched evidence retains supported impact and inherited uncertainty', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const partial = structuredClone(caseFixture.change_set);
  partial.completeness = 'partial';
  partial.limitations = ['one provider page was unavailable'];
  const result = classify(caseFixture, { change_set: partial });
  assert.equal(result.outcome, 'knowledge_update_required');
  assert.deepEqual(result.limitations, ['one provider page was unavailable']);
  assert.deepEqual(actualCore(result), expectedCore(caseFixture));
  for (const affected of result.affected) {
    assert.ok(affected.limitations.includes('one provider page was unavailable'));
  }
});

test('equivalent change ordering yields byte-for-byte equivalent output', () => {
  const caseFixture = selectCase('lumen.multiple-files-one-record');
  const reversed = structuredClone(caseFixture.change_set);
  reversed.changes.reverse();
  assert.deepEqual(classify(caseFixture, { change_set: reversed }), classify(caseFixture));
});

test('records and evidence are returned in stable UTF-8 ordering', () => {
  const result = classify(selectCase('lumen.multiple-files-one-record'));
  const ids = result.affected.map((item) => item.knowledge_id);
  assert.deepEqual(ids, [...ids].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
  for (const affected of result.affected) {
    assert.deepEqual(
      affected.triggering_paths,
      [...affected.triggering_paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    );
  }
});

test('classifier does not mutate accepted knowledge, the snapshot export, or change input', () => {
  const caseFixture = structuredClone(selectCase('atlas.direct-source-modified'));
  const snapshot = structuredClone(snapshots.get(caseFixture.pack_id));
  const beforeChange = JSON.stringify(caseFixture.change_set);
  const beforeSnapshot = JSON.stringify(snapshot);
  deepFreeze(caseFixture.change_set);
  deepFreeze(snapshot);
  classify(caseFixture, { snapshot_export: snapshot });
  assert.equal(JSON.stringify(caseFixture.change_set), beforeChange);
  assert.equal(JSON.stringify(snapshot), beforeSnapshot);
  assert.equal(
    snapshots.get(caseFixture.pack_id).manifest.snapshot_id,
    fixture.packs[caseFixture.pack_id].snapshot_id
  );
});

test('similarly named and parent-child paths do not create broad-match false positives', () => {
  for (const id of ['atlas.near-neighbor-similar-path', 'lumen.near-neighbor-parent-child']) {
    const result = classify(selectCase(id));
    assert.equal(result.outcome, 'no_knowledge_change');
    assert.deepEqual(result.affected, []);
  }
});

test('weak and inbound-only knowledge relationships do not propagate impact', () => {
  for (const id of ['lumen.weak-related-to-not-propagated', 'lumen.sme-policy-decision']) {
    const caseFixture = selectCase(id);
    const result = classify(caseFixture);
    for (const excluded of caseFixture.expected.excluded) {
      assert.equal(result.affected.some((item) => item.knowledge_id === excluded.knowledge_id), false);
    }
  }
});

test('snapshot identity and pack mismatches fail closed', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  assert.throws(
    () => classify(caseFixture, { expected_snapshot_id: fixture.packs['example.lumen-observatory'].snapshot_id }),
    expectCode('impact.snapshot_mismatch')
  );
  assert.throws(
    () => classify(caseFixture, { expected_pack_id: 'example.lumen-observatory' }),
    expectCode('impact.pack_mismatch')
  );
});

test('malformed changed paths and non-normalized representations fail closed', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const malformed = structuredClone(caseFixture.change_set);
  malformed.changes[0].path = '../sources/system-overview.md';
  assert.throws(() => classify(caseFixture, { change_set: malformed }), expectCode('path.invalid'));
  const wrongVersion = structuredClone(caseFixture.change_set);
  wrongVersion.representation_version = '2.0';
  assert.throws(
    () => classify(caseFixture, { change_set: wrongVersion }),
    expectCode('impact.change_set_version_mismatch')
  );
});

test('cross-pack record IDs and relationship targets fail closed', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const crossPackRecord = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace(
      'id: example.atlas-notes.architecture.boundaries',
      'id: example.lumen-observatory.architecture.boundaries'
    )
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: crossPackRecord }),
    expectCode('impact.knowledge_cross_pack')
  );

  const crossPackRelationship = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace(
      'target: example.atlas-notes.decision.repository-port',
      'target: example.lumen-observatory.decision.repository-port'
    )
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: crossPackRelationship }),
    expectCode('impact.relationship_cross_pack')
  );
});

test('unknown relationship targets and conflicting signals fail closed', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const unknownTarget = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace(
      'target: example.atlas-notes.decision.repository-port',
      'target: example.atlas-notes.decision.missing'
    )
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: unknownTarget }),
    expectCode('impact.knowledge_missing')
  );

  const conflict = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace(
      'relationships:\n',
      'relationships:\n  - type: contradicts\n    target_kind: knowledge\n    target: example.atlas-notes.trace.add-note\n    rationale: The records are deliberately irreconcilable for this adversarial fixture.\n'
    )
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: conflict }),
    expectCode('impact.relationship_conflict')
  );
});

test('custom relationship semantics are accepted only when the fixed pack declares them', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const undeclared = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace('type: implemented_by', 'type: x-blocked-by')
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: undeclared }),
    expectCode('impact.relationship_type_undeclared')
  );

  const lumenResult = classify(selectCase('lumen.business-domain-ambiguity'));
  assert.ok(lumenResult.affected.some((affected) =>
    affected.basis.some((basis) => basis.relationship_type === 'x-blocked-by')
  ));
});

test('malformed locators and knowledge records with no usable applies_to metadata fail closed', () => {
  const caseFixture = selectCase('lumen.business-domain-ambiguity');
  const malformedLocator = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/observation-lifecycle.md',
    (source) => source.replace('sources/domain-model.md', '../sources/domain-model.md')
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: malformedLocator }),
    expectCode('impact.locator_invalid')
  );

  const missingAppliesTo = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/observation-lifecycle.md',
    (source) => source.replace('applies_to:', 'unusable_applies_to:')
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: missingAppliesTo }),
    expectCode('impact.knowledge_invalid')
  );
});

test('unknown evidence sources fail closed instead of becoming missing impact evidence', () => {
  const caseFixture = selectCase('lumen.business-domain-ambiguity');
  const unknownSource = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/observation-lifecycle.md',
    (source) => source.replace(
      'source_id: example.lumen-observatory.repository',
      'source_id: example.lumen-observatory.unknown-source'
    )
  );
  assert.throws(
    () => classify(caseFixture, { snapshot_export: unknownSource }),
    expectCode('impact.evidence_source_missing')
  );
});

test('missing or malformed result evidence fails closed under the experimental verifier', () => {
  const result = classify(selectCase('atlas.direct-source-modified'));
  const missing = structuredClone(result);
  missing.affected[0].basis = [];
  assert.throws(
    () => verifyKnowledgeImpactAssessment(missing),
    expectCode('impact.result_evidence_invalid')
  );

  const malformed = structuredClone(result);
  delete malformed.affected[0].basis[0].locator;
  assert.throws(
    () => verifyKnowledgeImpactAssessment(malformed),
    expectCode('impact.result_evidence_invalid')
  );

  const missingLimitation = classify(selectCase('atlas.direct-source-modified'), {
    change_set: {
      ...structuredClone(selectCase('atlas.direct-source-modified').change_set),
      completeness: 'partial',
      limitations: ['one result page was unavailable']
    }
  });
  missingLimitation.affected[0].limitations = [];
  assert.throws(
    () => verifyKnowledgeImpactAssessment(missingLimitation),
    expectCode('impact.result_invalid')
  );
});

test('duplicated equivalent evidence locators do not change the affected declaration', () => {
  const caseFixture = selectCase('atlas.direct-source-modified');
  const duplicated = snapshotWithMutation(
    caseFixture.pack_id,
    'knowledge/architecture.md',
    (source) => source.replace(
      'claims:\n',
      '  - id: example.atlas-notes.evidence.architecture-overview-duplicate\n    source_id: example.atlas-notes.repository\n    kind: source_file\n    locator: sources/system-overview.md\n    observed_at: "2026-08-05T14:00:00Z"\n    revision: example-pack-0.1.0\n    description: Duplicate locator used only to prove deterministic evidence deduplication.\nclaims:\n'
    )
  );
  assert.deepEqual(
    classify(caseFixture, { snapshot_export: duplicated }).affected,
    classify(caseFixture).affected
  );
});

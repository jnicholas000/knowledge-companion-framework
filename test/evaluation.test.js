import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeSyntheticProviderChangeSet } from '../src/change-set.js';
import {
  canonicalizeEvaluationResult,
  createEvaluatedContext,
  createReviewedFixtureRegistry,
  evaluateComponentCase,
  evaluateStaticReasoning,
  verifyStaticEvaluationResult
} from '../src/evaluation.js';
import { classifyKnowledgeImpact } from '../src/knowledge-impact.js';
import { captureDirectoryManifestSnapshot } from '../src/snapshot-interchange.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'test/fixtures/milestone-5/cases.json'),
  'utf8'
));
const reviewedManifest = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'test/fixtures/milestone-5/reviewed-registry.json'),
  'utf8'
));
const reviewedRegistry = createReviewedFixtureRegistry(fixture, reviewedManifest);
const impactFixture = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'test/fixtures/milestone-4/classification-cases.json'),
  'utf8'
));
const providerTemplate = await fs.readFile(
  path.join(repositoryRoot, 'test/fixtures/milestone-3/provider-change-set.json'),
  'utf8'
);
const packRoots = new Map([
  ['example.atlas-notes', path.join(repositoryRoot, 'examples/atlas-notes')],
  ['example.lumen-observatory', path.join(repositoryRoot, 'examples/lumen-observatory')]
]);
const snapshots = new Map();
for (const [packId, packRoot] of packRoots) {
  snapshots.set(packId, (await captureDirectoryManifestSnapshot(packRoot)).export);
}
const cases = new Map(fixture.cases.map((caseFixture) => [caseFixture.id, caseFixture]));

function selectCase(id) {
  const caseFixture = cases.get(id);
  assert.ok(caseFixture, `fixture case ${id} should exist`);
  return caseFixture;
}

function selectControl(kind) {
  const control = fixture.controls.find((candidate) => candidate.kind === kind);
  assert.ok(control, `fixture control ${kind} should exist`);
  return control;
}

function createContext(caseFixture) {
  return createEvaluatedContext(caseFixture, snapshots.get(caseFixture.pack.id), reviewedRegistry);
}

function evaluateControl(control) {
  const caseFixture = selectCase(control.output.case_id);
  return evaluateStaticReasoning(
    caseFixture,
    control.output,
    createContext(caseFixture),
    reviewedRegistry
  );
}

function expectCode(code) {
  return (error) => error?.code === code;
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

test('reviewed fixture matrix covers all six modes across both verified pack snapshots', () => {
  assert.equal(fixture.fixture_set_version, '1.0.0');
  assert.equal(fixture.review_state, 'independently_reviewed');
  assert.deepEqual(
    fixture.cases.map((caseFixture) => caseFixture.input.mode).sort(),
    ['compare', 'debug', 'estimate', 'explain', 'plan', 'trace']
  );
  assert.deepEqual(
    [...new Set(fixture.cases.map((caseFixture) => caseFixture.pack.id))].sort(),
    ['example.atlas-notes', 'example.lumen-observatory']
  );
  for (const caseFixture of fixture.cases) {
    assert.equal(
      snapshots.get(caseFixture.pack.id).manifest.snapshot_id,
      caseFixture.pack.snapshot_id,
      caseFixture.id
    );
    assert.notEqual(
      caseFixture.accountability.output_producer,
      caseFixture.accountability.truth_reviewer,
      caseFixture.id
    );
    assert.equal(caseFixture.accountability.review_state, 'independently_reviewed');
    assert.ok(caseFixture.truth.expected_facts.length > 0);
    assert.ok(caseFixture.truth.acceptable_uncertainty.length > 0);
    assert.ok(caseFixture.truth.prohibited_facts.length > 0);
  }
});

test('corrected RFC 3339 review provenance validates against the reviewed registry', () => {
  for (const caseFixture of fixture.cases) {
    assert.equal(caseFixture.accountability.reviewed_at, '2026-08-08T05:50:15Z');
  }
  assert.doesNotThrow(() => createReviewedFixtureRegistry(fixture, reviewedManifest));
});

test('reviewed registry manifest names both component IDs and versions', () => {
  assert.deepEqual(
    reviewedManifest.components.map(({ id, version }) => ({ id, version })),
    [
      { id: 'm5.component.change-normalization', version: '1.0.0' },
      { id: 'm5.component.impact-classification', version: '1.0.0' }
    ]
  );
});

test('malformed review timestamps are rejected', () => {
  for (const reviewedAt of [
    'not-a-timestamp',
    '2026-08-08',
    '2026-08-08T05:50:15',
    '2026-02-30T05:50:15Z'
  ]) {
    const changedFixture = structuredClone(fixture);
    changedFixture.cases[0].accountability.reviewed_at = reviewedAt;
    assert.throws(
      () => createReviewedFixtureRegistry(changedFixture, reviewedManifest),
      expectCode('evaluation.review_timestamp_invalid'),
      reviewedAt
    );
  }
});

test('accountability timestamp drift requires a matching reviewed case digest', () => {
  const changedFixture = structuredClone(fixture);
  changedFixture.cases[0].accountability.reviewed_at = '2026-08-08T05:50:14Z';
  assert.throws(
    () => createReviewedFixtureRegistry(changedFixture, reviewedManifest),
    expectCode('evaluation.registry_case_mismatch')
  );
});

test('grounded explain, compare, estimate, trace, debug, and plan controls pass', () => {
  const grounded = fixture.controls.filter((control) => control.kind === 'grounded');
  assert.equal(grounded.length, 6);
  for (const control of grounded) {
    const caseFixture = selectCase(control.output.case_id);
    const context = createContext(caseFixture);
    const result = evaluateStaticReasoning(caseFixture, control.output, context, reviewedRegistry);
    assert.equal(result.outcome, control.expected_outcome, control.output.id);
    assert.equal(result.overall_score, 1, control.output.id);
    assert.deepEqual(result.findings, [], control.output.id);
    assert.equal(
      verifyStaticEvaluationResult(caseFixture, control.output, context, result, reviewedRegistry),
      result
    );
  }
});

test('known-bad unsupported, missing-evidence, and uncertainty-suppression controls fail', () => {
  for (const kind of ['unsupported_claim', 'missing_evidence', 'uncertainty_suppression']) {
    const control = selectControl(kind);
    const result = evaluateControl(control);
    assert.equal(result.outcome, 'fail', kind);
    assert.ok(result.findings.length > 0, kind);
    assert.ok(
      result.dimensions.some((dimension) => dimension.critical && dimension.score === 0),
      kind
    );
  }
});

test('cross-snapshot and cross-pack controls are rejected before scoring', () => {
  for (const kind of ['cross_snapshot_contamination', 'cross_pack_contamination']) {
    const control = selectControl(kind);
    const caseFixture = selectCase(control.output.case_id);
    assert.throws(
      () => evaluateStaticReasoning(
        caseFixture,
        control.output,
        createContext(caseFixture),
        reviewedRegistry
      ),
      expectCode(control.expected_error)
    );
  }
});

test('reviewed answer text rejects five unsupported-prose fail-open attacks', () => {
  const attacks = [
    {
      caseId: 'm5.atlas.explain-boundaries',
      answer: 'A polished explanation says a vector database and embeddings power semantic search.'
    },
    {
      caseId: 'm5.lumen.trace-execution',
      answer: 'A later snapshot says the Scheduler reads sensors and controls telescope hardware.'
    },
    {
      caseId: 'm5.lumen.debug-weather-hold',
      answer: 'Atlas repository-port behavior explains this Lumen weather hold.'
    },
    {
      caseId: 'm5.atlas.estimate-export',
      answer: 'The work will take exactly 3.00 person-days at 99.9 percent confidence.'
    },
    {
      caseId: 'm5.lumen.plan-instrument-mode',
      answer: 'Production deployment and a telescope firmware migration are required dependencies.'
    }
  ];
  for (const attack of attacks) {
    const grounded = fixture.controls.find((control) =>
      control.kind === 'grounded' && control.output.case_id === attack.caseId
    );
    const caseFixture = selectCase(attack.caseId);
    const changed = structuredClone(grounded.output);
    changed.answer = attack.answer;
    assert.throws(
      () => evaluateStaticReasoning(
        caseFixture,
        changed,
        createContext(caseFixture),
        reviewedRegistry
      ),
      expectCode('evaluation.output_registry_mismatch'),
      attack.caseId
    );
  }
});

test('evaluation rejects injected answer keys and nested context fields', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.atlas.explain-boundaries'
  );
  const caseFixture = selectCase(control.output.case_id);
  const injected = createContext(caseFixture);
  injected.answer_key = {
    truth: caseFixture.truth,
    rubric: caseFixture.rubric,
    sentinel: 'WORF_HIDDEN_ANSWER_KEY_SENTINEL'
  };
  assert.throws(
    () => evaluateStaticReasoning(
      caseFixture,
      control.output,
      injected,
      reviewedRegistry
    ),
    expectCode('evaluation.context_invalid')
  );

  const nested = createContext(caseFixture);
  nested.records[0].truth = 'WORF_NESTED_TRUTH_SENTINEL';
  assert.throws(
    () => evaluateStaticReasoning(caseFixture, control.output, nested, reviewedRegistry),
    expectCode('evaluation.context_invalid')
  );
});

test('reviewed registry rejects unversioned truth, rubric, and context changes', () => {
  const mutations = [
    (changedFixture, changedCase) => {
      const changedControl = changedFixture.controls.find((candidate) =>
        candidate.kind === 'grounded' && candidate.output.case_id === changedCase.id
      );
      changedCase.truth.expected_facts[0].statement += ' Coordinated unversioned rewrite.';
      changedControl.output.claims[0].statement = changedCase.truth.expected_facts[0].statement;
    },
    (_changedFixture, changedCase) => {
      changedCase.rubric.dimensions[0].criteria += ' Unversioned rubric rewrite.';
    },
    (_changedFixture, changedCase) => {
      changedCase.context_record_ids.push('example.atlas-notes.trace.add-note');
    }
  ];
  for (const mutate of mutations) {
    const changedFixture = structuredClone(fixture);
    const changedCase = changedFixture.cases.find((candidate) =>
      candidate.id === 'm5.atlas.explain-boundaries'
    );
    mutate(changedFixture, changedCase);
    assert.throws(
      () => createReviewedFixtureRegistry(changedFixture, reviewedManifest),
      expectCode('evaluation.registry_case_mismatch')
    );
  }
});

test('evaluated output producer must match the declared producer and cannot be the reviewer', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.lumen.debug-weather-hold'
  );
  const caseFixture = selectCase(control.output.case_id);
  const changed = structuredClone(control.output);
  changed.producer = caseFixture.accountability.truth_reviewer;
  assert.throws(
    () => evaluateStaticReasoning(
      caseFixture,
      changed,
      createContext(caseFixture),
      reviewedRegistry
    ),
    expectCode('evaluation.producer_mismatch')
  );
});

test('evaluated context exposes only query metadata and exact allowlisted snapshot records', () => {
  const forbiddenKeys = new Set([
    'truth',
    'expected_facts',
    'acceptable_uncertainty',
    'prohibited_facts',
    'rubric',
    'accountability',
    'truth_reviewer',
    'review_state',
    'controls',
    'answer',
    'claims'
  ]);
  const answerSentinels = fixture.controls.map((control) => control.output.answer.split(':')[0]);
  for (const caseFixture of fixture.cases) {
    const context = createContext(caseFixture);
    assert.deepEqual(
      context.records.map((record) => record.record_id),
      caseFixture.context_record_ids,
      caseFixture.id
    );
    for (const key of collectKeys(context)) assert.equal(forbiddenKeys.has(key), false, `${caseFixture.id}:${key}`);
    const serialized = JSON.stringify(context);
    for (const sentinel of answerSentinels) {
      assert.equal(serialized.includes(sentinel), false, `${caseFixture.id}:${sentinel}`);
    }
    const snapshot = snapshots.get(caseFixture.pack.id);
    const pathById = new Map(snapshot.manifest.files.map((file) => [file.record_id, file.path]));
    for (const record of context.records) {
      const object = snapshot.manifest.files.find((file) => file.path === pathById.get(record.record_id));
      const bytes = snapshot.objects.find((candidate) => candidate.content.digest === object.content.digest);
      assert.equal(record.content, Buffer.from(bytes.bytes_base64, 'base64').toString('utf8'));
    }
  }
});

test('result verification rejects stale versions, changed truth, and pack or snapshot mismatch', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.atlas.explain-boundaries'
  );
  const caseFixture = selectCase(control.output.case_id);
  const context = createContext(caseFixture);
  const result = evaluateStaticReasoning(caseFixture, control.output, context, reviewedRegistry);

  const staleResult = structuredClone(result);
  staleResult.result_version = '0.9.0';
  assert.throws(
    () => verifyStaticEvaluationResult(
      caseFixture,
      control.output,
      context,
      staleResult,
      reviewedRegistry
    ),
    expectCode('evaluation.result_version_mismatch')
  );
  const staleCase = structuredClone(control.output);
  staleCase.case_version = '0.9.0';
  assert.throws(
    () => evaluateStaticReasoning(caseFixture, staleCase, context, reviewedRegistry),
    expectCode('evaluation.case_version_mismatch')
  );
  const staleFixture = structuredClone(control.output);
  staleFixture.artifact_version = '0.9.0';
  assert.throws(
    () => evaluateStaticReasoning(caseFixture, staleFixture, context, reviewedRegistry),
    expectCode('evaluation.fixture_version_mismatch')
  );
  const changedTruth = structuredClone(caseFixture);
  changedTruth.truth.expected_facts[0].statement += ' Changed without a version increment.';
  assert.throws(
    () => verifyStaticEvaluationResult(
      changedTruth,
      control.output,
      context,
      result,
      reviewedRegistry
    ),
    expectCode('evaluation.case_registry_mismatch')
  );
  for (const [field, code] of [
    ['pack_id', 'evaluation.pack_mismatch'],
    ['snapshot_id', 'evaluation.snapshot_mismatch']
  ]) {
    const mutated = structuredClone(result);
    mutated[field] = 'foreign.identity';
    assert.throws(
      () => verifyStaticEvaluationResult(
        caseFixture,
        control.output,
        context,
        mutated,
        reviewedRegistry
      ),
      expectCode(code)
    );
  }
});

test('result dimensions reject duplicate, missing, unexpected, and reordered coverage', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.lumen.trace-execution'
  );
  const caseFixture = selectCase(control.output.case_id);
  const context = createContext(caseFixture);
  const result = evaluateStaticReasoning(caseFixture, control.output, context, reviewedRegistry);
  const mutations = [
    {
      code: 'evaluation.dimension_duplicate',
      mutate(value) { value.dimensions.push(structuredClone(value.dimensions[0])); }
    },
    {
      code: 'evaluation.dimension_missing',
      mutate(value) { value.dimensions.pop(); }
    },
    {
      code: 'evaluation.dimension_unexpected',
      mutate(value) { value.dimensions[0].name = 'freshness'; }
    },
    {
      code: 'evaluation.dimension_order',
      mutate(value) { value.dimensions.reverse(); }
    }
  ];
  for (const mutation of mutations) {
    const changed = structuredClone(result);
    mutation.mutate(changed);
    assert.throws(
      () => verifyStaticEvaluationResult(
        caseFixture,
        control.output,
        context,
        changed,
        reviewedRegistry
      ),
      expectCode(mutation.code)
    );
  }
});

test('complete output registry rejects fabricated and valid-but-irrelevant evidence mutations', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.atlas.compare-service-adapter'
  );
  const caseFixture = selectCase(control.output.case_id);
  const context = createContext(caseFixture);

  const fabricated = structuredClone(control.output);
  fabricated.claims[0].evidence_ids = ['example.fabricated.evidence'];
  assert.throws(
    () => evaluateStaticReasoning(caseFixture, fabricated, context, reviewedRegistry),
    expectCode('evaluation.output_registry_mismatch')
  );

  const irrelevant = structuredClone(control.output);
  irrelevant.claims[2].evidence_ids = ['example.atlas-notes.evidence.system-overview'];
  assert.throws(
    () => evaluateStaticReasoning(caseFixture, irrelevant, context, reviewedRegistry),
    expectCode('evaluation.output_registry_mismatch')
  );
});

test('complete output registry rejects grounded-envelope laundering of known-bad prose', () => {
  const unsupported = selectControl('unsupported_claim');
  const grounded = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === unsupported.output.case_id
  );
  const caseFixture = selectCase(unsupported.output.case_id);
  const context = createContext(caseFixture);
  const attacks = [
    (output) => { output.claims = structuredClone(grounded.output.claims); },
    (output) => { output.claims = output.claims.filter((claim) => !claim.fact_id.includes('unsupported')); },
    (output) => { output.claims[0].evidence_ids = []; },
    (output) => { output.uncertainty_ids = []; }
  ];
  for (const mutate of attacks) {
    const changed = structuredClone(unsupported.output);
    mutate(changed);
    assert.equal(changed.answer, unsupported.output.answer);
    assert.throws(
      () => evaluateStaticReasoning(caseFixture, changed, context, reviewedRegistry),
      expectCode('evaluation.output_registry_mismatch')
    );
  }
});

test('cosmetic prose cannot rescue unsupported reasoning or prohibited estimate and plan claims', () => {
  const unsupported = selectControl('unsupported_claim');
  const cosmetic = structuredClone(unsupported.output);
  cosmetic.answer = 'A polished rewrite retains the same unsupported semantic-index assertion.';
  const unsupportedCase = selectCase(cosmetic.case_id);
  assert.throws(
    () => evaluateStaticReasoning(
      unsupportedCase,
      cosmetic,
      createContext(unsupportedCase),
      reviewedRegistry
    ),
    expectCode('evaluation.output_registry_mismatch')
  );

  for (const [caseId, factId] of [
    ['m5.atlas.estimate-export', 'atlas.estimate.single-point'],
    ['m5.lumen.plan-instrument-mode', 'lumen.plan.fabricated-dependency']
  ]) {
    const grounded = fixture.controls.find((candidate) =>
      candidate.kind === 'grounded' && candidate.output.case_id === caseId
    );
    const caseFixture = selectCase(caseId);
    const prohibited = caseFixture.truth.prohibited_facts.find((fact) => fact.id === factId);
    const changed = structuredClone(grounded.output);
    changed.claims.push({ fact_id: prohibited.id, statement: prohibited.statement, evidence_ids: [] });
    assert.throws(
      () => evaluateStaticReasoning(
        caseFixture,
        changed,
        createContext(caseFixture),
        reviewedRegistry
      ),
      expectCode('evaluation.output_registry_mismatch')
    );
  }
});

test('critical reasoning failure overrides an otherwise passing aggregate score', () => {
  const control = selectControl('uncertainty_suppression');
  const caseFixture = selectCase(control.output.case_id);
  const result = evaluateControl(control);
  assert.equal(result.overall_score, 0.95);
  assert.equal(result.outcome, 'fail');
  assert.equal(result.dimensions.find((dimension) => dimension.name === 'reasoning_quality').score, 0);
});

test('result ordering and canonical serialization are deterministic', () => {
  const control = fixture.controls.find((candidate) =>
    candidate.kind === 'grounded' && candidate.output.case_id === 'm5.lumen.plan-instrument-mode'
  );
  const caseFixture = selectCase(control.output.case_id);
  const context = createContext(caseFixture);
  const first = evaluateStaticReasoning(caseFixture, control.output, context, reviewedRegistry);
  const second = evaluateStaticReasoning(
    caseFixture,
    structuredClone(control.output),
    structuredClone(context),
    reviewedRegistry
  );
  assert.deepEqual(first, second);
  assert.equal(canonicalizeEvaluationResult(first), canonicalizeEvaluationResult(second));
  assert.deepEqual(
    first.dimensions.map((dimension) => dimension.name),
    caseFixture.rubric.dimensions.map((dimension) => dimension.name)
  );
});

test('change normalization component evaluation detects changed output', () => {
  const providerInput = JSON.parse(
    providerTemplate.replace('{{base_revision}}', 'base').replace('{{target_revision}}', 'target')
  );
  const actual = normalizeSyntheticProviderChangeSet(providerInput);
  const componentCase = fixture.component_cases.find((candidate) =>
    candidate.id === 'm5.component.change-normalization'
  );
  assert.equal(evaluateComponentCase(componentCase, actual, reviewedRegistry).outcome, 'pass');
  const changedActual = structuredClone(actual);
  changedActual.changes[0].change_type = 'modified';
  assert.equal(evaluateComponentCase(componentCase, changedActual, reviewedRegistry).outcome, 'fail');
});

test('impact-classification component evaluation detects changed output', () => {
  const reviewed = impactFixture.cases.find((candidate) => candidate.id === 'lumen.direct-source-deleted');
  const snapshot = snapshots.get(reviewed.pack_id);
  const actualAssessment = classifyKnowledgeImpact({
    change_set: reviewed.change_set,
    snapshot_export: snapshot,
    expected_pack_id: reviewed.pack_id,
    expected_snapshot_id: snapshot.manifest.snapshot_id
  });
  const project = (assessment) => ({
    outcome: assessment.outcome,
    affected: assessment.affected.map((item) => ({
      knowledge_id: item.knowledge_id,
      review_requirement: item.review_requirement,
      triggering_paths: item.triggering_paths
    })),
    limitations: assessment.limitations
  });
  const componentCase = fixture.component_cases.find((candidate) =>
    candidate.id === 'm5.component.impact-classification'
  );
  const actual = project(actualAssessment);
  assert.equal(evaluateComponentCase(componentCase, actual, reviewedRegistry).outcome, 'pass');
  const changedActual = structuredClone(actual);
  changedActual.affected[0].review_requirement = 'interpretive';
  assert.equal(evaluateComponentCase(componentCase, changedActual, reviewedRegistry).outcome, 'fail');
});

test('component registry rejects normalization expected-only mutation', () => {
  const componentCase = structuredClone(fixture.component_cases.find((candidate) =>
    candidate.id === 'm5.component.change-normalization'
  ));
  componentCase.expected.changes[0].change_type = 'modified';
  assert.throws(
    () => evaluateComponentCase(
      componentCase,
      fixture.component_cases[0].expected,
      reviewedRegistry
    ),
    expectCode('evaluation.component_registry_mismatch')
  );
});

test('component registry rejects impact expected-only mutation', () => {
  const componentCase = structuredClone(fixture.component_cases.find((candidate) =>
    candidate.id === 'm5.component.impact-classification'
  ));
  componentCase.expected.affected[0].review_requirement = 'interpretive';
  assert.throws(
    () => evaluateComponentCase(
      componentCase,
      fixture.component_cases[1].expected,
      reviewedRegistry
    ),
    expectCode('evaluation.component_registry_mismatch')
  );
});

test('component registry rejects component metadata mutation', () => {
  const changedDescription = structuredClone(fixture.component_cases[1]);
  changedDescription.description = 'Cosmetic metadata mutation under an unchanged reviewed identity.';
  assert.throws(
    () => evaluateComponentCase(changedDescription, changedDescription.expected, reviewedRegistry),
    expectCode('evaluation.component_registry_mismatch')
  );
});

test('component registry rejects version-only drift as unreviewed', () => {
  const componentCase = structuredClone(fixture.component_cases[0]);
  componentCase.version = '1.0.1';
  assert.throws(
    () => evaluateComponentCase(componentCase, componentCase.expected, reviewedRegistry),
    expectCode('evaluation.component_unreviewed')
  );
});

test('component registry rejects an otherwise-valid unregistered component case', () => {
  const componentCase = structuredClone(fixture.component_cases[0]);
  componentCase.id = 'm5.component.unregistered-change-normalization';
  assert.throws(
    () => evaluateComponentCase(componentCase, componentCase.expected, reviewedRegistry),
    expectCode('evaluation.component_unreviewed')
  );
});

test('component registry rejects coordinated expected and actual laundering', () => {
  const changedFixture = structuredClone(fixture);
  const componentCase = changedFixture.component_cases.find((candidate) =>
    candidate.id === 'm5.component.change-normalization'
  );
  componentCase.expected.changes[0].change_type = 'modified';
  assert.throws(
    () => createReviewedFixtureRegistry(changedFixture, reviewedManifest),
    expectCode('evaluation.registry_component_mismatch')
  );
  assert.throws(
    () => evaluateComponentCase(componentCase, componentCase.expected, reviewedRegistry),
    expectCode('evaluation.component_registry_mismatch')
  );
});

test('focused evaluation leaves accepted pack bytes unchanged and adds no live capability', async () => {
  for (const [packId, packRoot] of packRoots) {
    const recaptured = (await captureDirectoryManifestSnapshot(packRoot)).export;
    assert.equal(recaptured.manifest.snapshot_id, snapshots.get(packId).manifest.snapshot_id, packId);
    assert.deepEqual(recaptured.objects, snapshots.get(packId).objects, packId);
  }
  const source = await fs.readFile(path.join(repositoryRoot, 'src/evaluation.js'), 'utf8');
  for (const forbidden of [
    'node:http',
    'node:https',
    'fetch(',
    'openai',
    'embedding',
    'vector search',
    'writeFile(',
    'candidate_ids',
    'writeback'
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, forbidden);
  }
});

import {
  canonicalJson,
  compareUtf8,
  sha256
} from './interchange.js';
import { parseKnowledgeSource, parseStructuredSource } from './formats.js';
import { verifySnapshotExport } from './snapshot-interchange.js';

const evaluatorVersion = '1.0.0';
const registryStates = new WeakMap();
const reasoningChecks = new Set([
  'expected_fact_coverage',
  'supported_claims',
  'required_evidence',
  'uncertainty_preserved',
  'prohibited_behavior_absent'
]);

export class EvaluationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new EvaluationError(code, message);
}

function requireObject(value, code, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
  return value;
}

function requireString(value, code, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(code, `${label} must be a non-empty string`);
  }
  return value;
}

function requireRfc3339Timestamp(value, code, label) {
  requireString(value, code, label);
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/
  );
  if (!match) fail(code, `${label} must be an RFC 3339 timestamp`);

  const [
    , yearText, monthText, dayText, hourText, minuteText, secondText,
    zone, offsetHourText, offsetMinuteText
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = zone.toUpperCase() === 'Z' ? 0 : Number(offsetHourText);
  const offsetMinute = zone.toUpperCase() === 'Z' ? 0 : Number(offsetMinuteText);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth[month - 1]
    || hour > 23
    || minute > 59
    || second > 60
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    fail(code, `${label} must contain a real RFC 3339 calendar timestamp`);
  }
  return value;
}

function requireArray(value, code, label) {
  if (!Array.isArray(value)) fail(code, `${label} must be an array`);
  return value;
}

function assertExactKeys(value, allowedKeys, code, label) {
  const unexpected = Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .sort(compareUtf8);
  if (unexpected.length > 0) fail(code, `${label} has unsupported field ${unexpected[0]}`);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareUtf8);
}

function requireUniqueStrings(values, code, label) {
  const normalized = requireArray(values, code, label).map((value, index) =>
    requireString(value, code, `${label}[${index}]`)
  );
  const duplicates = findDuplicates(normalized);
  if (duplicates.length > 0) fail(code, `${label} duplicates ${duplicates[0]}`);
  return normalized;
}

function validateIdentity(actual, expected, code, label) {
  if (actual !== expected) fail(code, `${label} is ${actual}; expected ${expected}`);
}

function createCaseDigest(caseFixture) {
  return `sha256:${sha256(canonicalJson(caseFixture))}`;
}

function createValueDigest(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

function getRegistryState(registry) {
  const state = registryStates.get(registry);
  if (state === undefined) {
    fail('evaluation.registry_invalid', 'a reviewed fixture registry is required');
  }
  return state;
}

function validateCase(caseFixture) {
  requireObject(caseFixture, 'evaluation.case_invalid', 'evaluation case');
  assertExactKeys(
    caseFixture,
    [
      'fixture_version',
      'result_version',
      'id',
      'version',
      'title',
      'input',
      'pack',
      'context_record_ids',
      'truth',
      'rubric',
      'accountability'
    ],
    'evaluation.case_invalid',
    'evaluation case'
  );
  for (const field of ['fixture_version', 'result_version', 'id', 'version', 'title']) {
    requireString(caseFixture[field], 'evaluation.case_invalid', `case ${field}`);
  }
  requireObject(caseFixture.input, 'evaluation.case_invalid', 'case input');
  assertExactKeys(
    caseFixture.input,
    ['query', 'mode', 'audience', 'constraints'],
    'evaluation.case_invalid',
    'case input'
  );
  for (const field of ['query', 'mode', 'audience']) {
    requireString(caseFixture.input[field], 'evaluation.case_invalid', `case input ${field}`);
  }
  requireUniqueStrings(caseFixture.input.constraints, 'evaluation.case_invalid', 'case constraints');

  const pack = requireObject(caseFixture.pack, 'evaluation.case_invalid', 'case pack');
  assertExactKeys(pack, ['id', 'version', 'snapshot_id'], 'evaluation.case_invalid', 'case pack');
  for (const field of ['id', 'version', 'snapshot_id']) {
    requireString(pack[field], 'evaluation.case_invalid', `case pack ${field}`);
  }
  requireUniqueStrings(
    caseFixture.context_record_ids,
    'evaluation.case_invalid',
    'context record IDs'
  );

  const truth = requireObject(caseFixture.truth, 'evaluation.case_invalid', 'case truth');
  assertExactKeys(
    truth,
    ['expected_facts', 'acceptable_uncertainty', 'prohibited_facts'],
    'evaluation.case_invalid',
    'case truth'
  );
  const truthGroups = [
    ['expected_facts', true],
    ['acceptable_uncertainty', false],
    ['prohibited_facts', false]
  ];
  const truthIds = [];
  for (const [group, hasEvidence] of truthGroups) {
    const entries = requireArray(truth[group], 'evaluation.case_invalid', `truth ${group}`);
    if (entries.length === 0) fail('evaluation.case_invalid', `truth ${group} must not be empty`);
    for (const [index, entry] of entries.entries()) {
      requireObject(entry, 'evaluation.case_invalid', `truth ${group}[${index}]`);
      assertExactKeys(
        entry,
        hasEvidence ? ['id', 'statement', 'evidence_ids'] : ['id', 'statement'],
        'evaluation.case_invalid',
        `truth ${group}[${index}]`
      );
      truthIds.push(requireString(entry.id, 'evaluation.case_invalid', `truth ${group} id`));
      requireString(entry.statement, 'evaluation.case_invalid', `truth ${group} statement`);
      if (hasEvidence) {
        const evidenceIds = requireUniqueStrings(
          entry.evidence_ids,
          'evaluation.case_invalid',
          `truth ${group} evidence IDs`
        );
        if (evidenceIds.length === 0) {
          fail('evaluation.case_invalid', `truth ${group} evidence IDs must not be empty`);
        }
      }
    }
  }
  const duplicateTruthIds = findDuplicates(truthIds);
  if (duplicateTruthIds.length > 0) {
    fail('evaluation.case_invalid', `truth ID ${duplicateTruthIds[0]} is duplicated`);
  }

  const rubric = requireObject(caseFixture.rubric, 'evaluation.case_invalid', 'case rubric');
  assertExactKeys(rubric, ['dimensions', 'pass_threshold'], 'evaluation.case_invalid', 'case rubric');
  if (!Number.isFinite(rubric.pass_threshold) || rubric.pass_threshold < 0 || rubric.pass_threshold > 1) {
    fail('evaluation.case_invalid', 'rubric pass_threshold must be between zero and one');
  }
  const dimensions = requireArray(rubric.dimensions, 'evaluation.case_invalid', 'rubric dimensions');
  if (dimensions.length === 0) fail('evaluation.case_invalid', 'rubric dimensions must not be empty');
  let totalWeight = 0;
  const dimensionNames = [];
  const criticalNames = new Set();
  for (const [index, dimension] of dimensions.entries()) {
    requireObject(dimension, 'evaluation.case_invalid', `rubric dimension ${index}`);
    assertExactKeys(
      dimension,
      ['name', 'weight', 'critical', 'criteria', 'checks'],
      'evaluation.case_invalid',
      `rubric dimension ${index}`
    );
    const name = requireString(dimension.name, 'evaluation.case_invalid', 'rubric dimension name');
    dimensionNames.push(name);
    if (!Number.isFinite(dimension.weight) || dimension.weight <= 0 || dimension.weight > 1) {
      fail('evaluation.case_invalid', `rubric dimension ${name} has invalid weight`);
    }
    totalWeight += dimension.weight;
    if (typeof dimension.critical !== 'boolean') {
      fail('evaluation.case_invalid', `rubric dimension ${name} critical must be boolean`);
    }
    if (dimension.critical) criticalNames.add(name);
    requireString(dimension.criteria, 'evaluation.case_invalid', `rubric dimension ${name} criteria`);
    const checks = requireUniqueStrings(
      dimension.checks,
      'evaluation.case_invalid',
      `rubric dimension ${name} checks`
    );
    if (checks.length === 0) fail('evaluation.case_invalid', `rubric dimension ${name} needs checks`);
    for (const check of checks) {
      if (!reasoningChecks.has(check)) {
        fail('evaluation.case_invalid', `rubric dimension ${name} has unsupported check ${check}`);
      }
    }
  }
  const duplicateDimensions = findDuplicates(dimensionNames);
  if (duplicateDimensions.length > 0) {
    fail('evaluation.dimension_duplicate', `rubric dimension ${duplicateDimensions[0]} is duplicated`);
  }
  if (Math.abs(totalWeight - 1) > 1e-9) {
    fail('evaluation.weights', `rubric weights total ${totalWeight}; expected 1`);
  }
  for (const requiredCritical of ['reasoning_quality', 'evidence']) {
    if (!criticalNames.has(requiredCritical)) {
      fail('evaluation.case_invalid', `${requiredCritical} must be a critical rubric dimension`);
    }
  }

  const accountability = requireObject(
    caseFixture.accountability,
    'evaluation.case_invalid',
    'case accountability'
  );
  assertExactKeys(
    accountability,
    ['output_producer', 'truth_reviewer', 'review_state', 'reviewed_at'],
    'evaluation.case_invalid',
    'case accountability'
  );
  const outputProducer = requireString(
    accountability.output_producer,
    'evaluation.case_invalid',
    'output producer'
  );
  const truthReviewer = requireString(
    accountability.truth_reviewer,
    'evaluation.case_invalid',
    'truth reviewer'
  );
  if (outputProducer === truthReviewer) {
    fail('evaluation.reviewer_not_independent', 'truth reviewer must differ from output producer');
  }
  if (accountability.review_state !== 'independently_reviewed') {
    fail('evaluation.review_incomplete', 'case truth must be independently reviewed');
  }
  requireRfc3339Timestamp(
    accountability.reviewed_at,
    'evaluation.review_timestamp_invalid',
    'reviewed_at'
  );
  return caseFixture;
}

function validateComponentCase(componentCase) {
  requireObject(componentCase, 'evaluation.component_invalid', 'component case');
  assertExactKeys(
    componentCase,
    ['fixture_version', 'id', 'version', 'component', 'description', 'expected'],
    'evaluation.component_invalid',
    'component case'
  );
  for (const field of ['fixture_version', 'id', 'version', 'component', 'description']) {
    requireString(componentCase[field], 'evaluation.component_invalid', `component case ${field}`);
  }
  if (!['change_normalization', 'impact_classification'].includes(componentCase.component)) {
    fail('evaluation.component_invalid', `unsupported component ${componentCase.component}`);
  }
  return componentCase;
}

export function createReviewedFixtureRegistry(fixtureSet, reviewedManifest) {
  requireObject(fixtureSet, 'evaluation.registry_invalid', 'fixture set');
  requireObject(reviewedManifest, 'evaluation.registry_invalid', 'reviewed registry manifest');
  assertExactKeys(
    reviewedManifest,
    ['manifest_version', 'fixture_set_version', 'cases', 'components', 'outputs'],
    'evaluation.registry_invalid',
    'reviewed registry manifest'
  );
  requireString(
    reviewedManifest.manifest_version,
    'evaluation.registry_invalid',
    'reviewed registry manifest version'
  );
  const fixtureSetVersion = requireString(
    fixtureSet.fixture_set_version,
    'evaluation.registry_invalid',
    'fixture set version'
  );
  if (fixtureSet.review_state !== 'independently_reviewed') {
    fail('evaluation.registry_invalid', 'fixture set must be independently reviewed');
  }
  validateIdentity(
    reviewedManifest.fixture_set_version,
    fixtureSetVersion,
    'evaluation.registry_version_mismatch',
    'reviewed registry fixture_set_version'
  );
  const caseDigests = new Map();
  for (const caseFixture of requireArray(
    fixtureSet.cases,
    'evaluation.registry_invalid',
    'fixture cases'
  )) {
    validateCase(caseFixture);
    const key = `${caseFixture.id}@${caseFixture.version}`;
    if (caseDigests.has(key)) fail('evaluation.registry_invalid', `duplicate reviewed case ${key}`);
    caseDigests.set(key, createCaseDigest(caseFixture));
  }
  const outputs = new Map();
  for (const control of requireArray(
    fixtureSet.controls,
    'evaluation.registry_invalid',
    'fixture controls'
  )) {
    requireObject(control, 'evaluation.registry_invalid', 'fixture control');
    const output = requireObject(control.output, 'evaluation.registry_invalid', 'fixture control output');
    const outputId = requireString(output.id, 'evaluation.registry_invalid', 'fixture output id');
    if (outputs.has(outputId)) fail('evaluation.registry_invalid', `duplicate reviewed output ${outputId}`);
    outputs.set(outputId, {
      case_id: requireString(output.case_id, 'evaluation.registry_invalid', 'fixture output case_id'),
      output_digest: createValueDigest(output)
    });
  }
  const manifestCaseDigests = new Map();
  for (const entry of requireArray(
    reviewedManifest.cases,
    'evaluation.registry_invalid',
    'reviewed registry cases'
  )) {
    requireObject(entry, 'evaluation.registry_invalid', 'reviewed registry case');
    assertExactKeys(
      entry,
      ['id', 'version', 'digest'],
      'evaluation.registry_invalid',
      'reviewed registry case'
    );
    const key = `${requireString(entry.id, 'evaluation.registry_invalid', 'registry case id')}@${requireString(entry.version, 'evaluation.registry_invalid', 'registry case version')}`;
    if (manifestCaseDigests.has(key)) fail('evaluation.registry_invalid', `duplicate registry case ${key}`);
    manifestCaseDigests.set(
      key,
      requireString(entry.digest, 'evaluation.registry_invalid', 'registry case digest')
    );
  }
  if (canonicalJson([...manifestCaseDigests]) !== canonicalJson([...caseDigests])) {
    fail(
      'evaluation.registry_case_mismatch',
      'fixture cases differ from the independently reviewed registry manifest'
    );
  }
  const componentDigests = new Map();
  for (const componentCase of requireArray(
    fixtureSet.component_cases,
    'evaluation.registry_invalid',
    'fixture component cases'
  )) {
    validateComponentCase(componentCase);
    const key = `${componentCase.id}@${componentCase.version}`;
    if (componentDigests.has(key)) {
      fail('evaluation.registry_invalid', `duplicate reviewed component case ${key}`);
    }
    componentDigests.set(key, createValueDigest(componentCase));
  }
  const manifestComponentDigests = new Map();
  for (const entry of requireArray(
    reviewedManifest.components,
    'evaluation.registry_invalid',
    'reviewed registry components'
  )) {
    requireObject(entry, 'evaluation.registry_invalid', 'reviewed registry component');
    assertExactKeys(
      entry,
      ['id', 'version', 'digest'],
      'evaluation.registry_invalid',
      'reviewed registry component'
    );
    const key = `${requireString(entry.id, 'evaluation.registry_invalid', 'registry component id')}@${requireString(entry.version, 'evaluation.registry_invalid', 'registry component version')}`;
    if (manifestComponentDigests.has(key)) {
      fail('evaluation.registry_invalid', `duplicate registry component ${key}`);
    }
    manifestComponentDigests.set(
      key,
      requireString(entry.digest, 'evaluation.registry_invalid', 'registry component digest')
    );
  }
  if (canonicalJson([...manifestComponentDigests]) !== canonicalJson([...componentDigests])) {
    fail(
      'evaluation.registry_component_mismatch',
      'fixture component cases differ from the independently reviewed registry manifest'
    );
  }
  const manifestOutputs = new Map();
  for (const entry of requireArray(
    reviewedManifest.outputs,
    'evaluation.registry_invalid',
    'reviewed registry outputs'
  )) {
    requireObject(entry, 'evaluation.registry_invalid', 'reviewed registry output');
    assertExactKeys(
      entry,
      ['id', 'case_id', 'output_digest'],
      'evaluation.registry_invalid',
      'reviewed registry output'
    );
    const id = requireString(entry.id, 'evaluation.registry_invalid', 'registry output id');
    if (manifestOutputs.has(id)) fail('evaluation.registry_invalid', `duplicate registry output ${id}`);
    manifestOutputs.set(id, {
      case_id: requireString(entry.case_id, 'evaluation.registry_invalid', 'registry output case_id'),
      output_digest: requireString(
        entry.output_digest,
        'evaluation.registry_invalid',
        'registry output digest'
      )
    });
  }
  if (canonicalJson([...manifestOutputs]) !== canonicalJson([...outputs])) {
    fail(
      'evaluation.registry_output_mismatch',
      'fixture outputs differ from the independently reviewed registry manifest'
    );
  }
  const registry = Object.freeze({
    fixture_set_version: fixtureSetVersion,
    registry_digest: createValueDigest(reviewedManifest)
  });
  registryStates.set(registry, {
    caseDigests,
    componentDigests,
    outputs,
    contextDigests: new Map()
  });
  return registry;
}

function validateReviewedCase(caseFixture, registry) {
  const state = getRegistryState(registry);
  validateCase(caseFixture);
  const key = `${caseFixture.id}@${caseFixture.version}`;
  const expectedDigest = state.caseDigests.get(key);
  if (expectedDigest === undefined) {
    fail('evaluation.case_unreviewed', `case ${key} is not in the reviewed fixture registry`);
  }
  if (createCaseDigest(caseFixture) !== expectedDigest) {
    fail(
      'evaluation.case_registry_mismatch',
      `case ${key} differs from its reviewed fixture registry identity`
    );
  }
}

function validateOutput(caseFixture, output, registry) {
  requireObject(output, 'evaluation.output_invalid', 'reasoning output');
  assertExactKeys(
    output,
    [
      'artifact_version',
      'id',
      'case_id',
      'case_version',
      'pack_id',
      'pack_version',
      'snapshot_id',
      'producer',
      'answer',
      'claims',
      'uncertainty_ids'
    ],
    'evaluation.output_invalid',
    'reasoning output'
  );
  for (const field of [
    'artifact_version',
    'id',
    'case_id',
    'case_version',
    'pack_id',
    'pack_version',
    'snapshot_id',
    'producer',
    'answer'
  ]) {
    requireString(output[field], 'evaluation.output_invalid', `output ${field}`);
  }
  validateIdentity(
    output.artifact_version,
    caseFixture.fixture_version,
    'evaluation.fixture_version_mismatch',
    'output artifact_version'
  );
  validateIdentity(output.case_id, caseFixture.id, 'evaluation.case_mismatch', 'output case_id');
  validateIdentity(
    output.case_version,
    caseFixture.version,
    'evaluation.case_version_mismatch',
    'output case_version'
  );
  validateIdentity(output.pack_id, caseFixture.pack.id, 'evaluation.pack_mismatch', 'output pack_id');
  validateIdentity(
    output.pack_version,
    caseFixture.pack.version,
    'evaluation.pack_version_mismatch',
    'output pack_version'
  );
  validateIdentity(
    output.snapshot_id,
    caseFixture.pack.snapshot_id,
    'evaluation.snapshot_mismatch',
    'output snapshot_id'
  );
  validateIdentity(
    output.producer,
    caseFixture.accountability.output_producer,
    'evaluation.producer_mismatch',
    'output producer'
  );
  if (output.producer === caseFixture.accountability.truth_reviewer) {
    fail('evaluation.reviewer_not_independent', 'truth reviewer cannot produce the evaluated output');
  }
  const reviewedOutput = getRegistryState(registry).outputs.get(output.id);
  if (reviewedOutput === undefined) {
    fail('evaluation.output_unreviewed', `output ${output.id} is not in the reviewed fixture registry`);
  }
  validateIdentity(
    reviewedOutput.case_id,
    caseFixture.id,
    'evaluation.output_case_mismatch',
    'reviewed output case_id'
  );
  if (createValueDigest(output) !== reviewedOutput.output_digest) {
    fail(
      'evaluation.output_registry_mismatch',
      `output ${output.id} differs from its complete reviewed static artifact`
    );
  }
  const claims = requireArray(output.claims, 'evaluation.output_invalid', 'output claims');
  const factIds = [];
  for (const [index, claim] of claims.entries()) {
    requireObject(claim, 'evaluation.output_invalid', `output claim ${index}`);
    assertExactKeys(
      claim,
      ['fact_id', 'statement', 'evidence_ids'],
      'evaluation.output_invalid',
      `output claim ${index}`
    );
    factIds.push(requireString(claim.fact_id, 'evaluation.output_invalid', 'claim fact_id'));
    requireString(claim.statement, 'evaluation.output_invalid', 'claim statement');
    requireUniqueStrings(claim.evidence_ids, 'evaluation.output_invalid', 'claim evidence IDs');
  }
  const duplicateFacts = findDuplicates(factIds);
  if (duplicateFacts.length > 0) {
    fail('evaluation.claim_duplicate', `output claim fact ${duplicateFacts[0]} is duplicated`);
  }
  requireUniqueStrings(
    output.uncertainty_ids,
    'evaluation.output_invalid',
    'output uncertainty IDs'
  );
  return output;
}

function collectAvailableEvidence(context) {
  const evidenceIds = new Set();
  for (const record of context.records) {
    let data;
    try {
      data = record.content.startsWith('---')
        ? parseKnowledgeSource(record.content, record.record_id).data
        : parseStructuredSource(record.content, record.record_id);
    } catch (error) {
      fail('evaluation.context_record_invalid', `${record.record_id} cannot be parsed: ${error.message}`);
    }
    for (const evidence of data.evidence ?? []) {
      evidenceIds.add(requireString(
        evidence?.id,
        'evaluation.context_record_invalid',
        `${record.record_id} evidence id`
      ));
    }
  }
  return evidenceIds;
}

export function createEvaluatedContext(caseFixture, snapshotExport, registry) {
  validateReviewedCase(caseFixture, registry);
  const verified = verifySnapshotExport(snapshotExport, {
    expected_pack_id: caseFixture.pack.id,
    expected_snapshot_id: caseFixture.pack.snapshot_id,
    expected_target_revision: caseFixture.pack.version,
    actual_target_revision: caseFixture.pack.version,
    known_snapshot_ids: new Set()
  });
  const filesByRecordId = new Map(
    verified.manifest.files
      .filter((file) => file.record_id !== undefined)
      .map((file) => [file.record_id, file.path])
  );
  const records = caseFixture.context_record_ids.map((recordId) => {
    const recordPath = filesByRecordId.get(recordId);
    if (recordPath === undefined) {
      fail('evaluation.context_record_missing', `snapshot omits allowlisted record ${recordId}`);
    }
    return {
      record_id: recordId,
      content: verified.files.get(recordPath).toString('utf8')
    };
  });
  const context = {
    query: {
      query: caseFixture.input.query,
      mode: caseFixture.input.mode,
      audience: caseFixture.input.audience,
      constraints: structuredClone(caseFixture.input.constraints)
    },
    knowledge_snapshot: {
      pack_id: verified.manifest.pack_id,
      pack_version: verified.manifest.pack_revision,
      snapshot_id: verified.manifest.snapshot_id
    },
    records
  };
  getRegistryState(registry).contextDigests.set(
    `${caseFixture.id}@${caseFixture.version}`,
    createValueDigest(context)
  );
  return context;
}

function validateContext(caseFixture, context, registry) {
  requireObject(context, 'evaluation.context_invalid', 'evaluated context');
  assertExactKeys(
    context,
    ['query', 'knowledge_snapshot', 'records'],
    'evaluation.context_invalid',
    'evaluated context'
  );
  requireObject(context.query, 'evaluation.context_invalid', 'context query');
  assertExactKeys(
    context.query,
    ['query', 'mode', 'audience', 'constraints'],
    'evaluation.context_invalid',
    'context query'
  );
  if (canonicalJson(context.query) !== canonicalJson(caseFixture.input)) {
    fail('evaluation.context_query_mismatch', 'context query differs from the reviewed case input');
  }
  requireObject(context.knowledge_snapshot, 'evaluation.context_invalid', 'context snapshot');
  assertExactKeys(
    context.knowledge_snapshot,
    ['pack_id', 'pack_version', 'snapshot_id'],
    'evaluation.context_invalid',
    'context snapshot'
  );
  validateIdentity(
    context.knowledge_snapshot.pack_id,
    caseFixture.pack.id,
    'evaluation.pack_mismatch',
    'context pack_id'
  );
  validateIdentity(
    context.knowledge_snapshot.pack_version,
    caseFixture.pack.version,
    'evaluation.pack_version_mismatch',
    'context pack_version'
  );
  validateIdentity(
    context.knowledge_snapshot.snapshot_id,
    caseFixture.pack.snapshot_id,
    'evaluation.snapshot_mismatch',
    'context snapshot_id'
  );
  const contextRecords = requireArray(context.records, 'evaluation.context_invalid', 'context records');
  for (const [index, record] of contextRecords.entries()) {
    requireObject(record, 'evaluation.context_invalid', `context record ${index}`);
    assertExactKeys(
      record,
      ['record_id', 'content'],
      'evaluation.context_invalid',
      `context record ${index}`
    );
    requireString(record.record_id, 'evaluation.context_invalid', `context record ${index} id`);
    requireString(record.content, 'evaluation.context_invalid', `context record ${index} content`);
  }
  const contextRecordIds = contextRecords.map((record) => record.record_id);
  if (canonicalJson(contextRecordIds) !== canonicalJson(caseFixture.context_record_ids)) {
    fail('evaluation.context_record_mismatch', 'context records differ from the ordered case allowlist');
  }
  const key = `${caseFixture.id}@${caseFixture.version}`;
  const expectedDigest = getRegistryState(registry).contextDigests.get(key);
  if (expectedDigest === undefined) {
    fail('evaluation.context_unregistered', `context for ${key} was not constructed from a verified snapshot`);
  }
  if (createValueDigest(context) !== expectedDigest) {
    fail('evaluation.context_digest_mismatch', `context for ${key} differs from verified constructed content`);
  }
}

function inspectOutput(caseFixture, output, context) {
  const expectedById = new Map(caseFixture.truth.expected_facts.map((fact) => [fact.id, fact]));
  const prohibitedById = new Map(caseFixture.truth.prohibited_facts.map((fact) => [fact.id, fact]));
  const expectedIds = new Set(expectedById.keys());
  const actualIds = new Set(output.claims.map((claim) => claim.fact_id));
  const requiredUncertaintyIds = new Set(
    caseFixture.truth.acceptable_uncertainty.map((uncertainty) => uncertainty.id)
  );
  const actualUncertaintyIds = new Set(output.uncertainty_ids);
  const availableEvidence = collectAvailableEvidence(context);
  const findings = [];

  const missingFacts = [...expectedIds].filter((id) => !actualIds.has(id)).sort(compareUtf8);
  const prohibitedFacts = output.claims
    .filter((claim) => prohibitedById.has(claim.fact_id))
    .map((claim) => claim.fact_id)
    .sort(compareUtf8);
  const unsupportedFacts = output.claims
    .filter((claim) => !expectedById.has(claim.fact_id) && !prohibitedById.has(claim.fact_id))
    .map((claim) => claim.fact_id)
    .sort(compareUtf8);
  const mismatchedStatements = output.claims
    .filter((claim) => {
      const truth = expectedById.get(claim.fact_id) ?? prohibitedById.get(claim.fact_id);
      return truth !== undefined && claim.statement !== truth.statement;
    })
    .map((claim) => claim.fact_id)
    .sort(compareUtf8);
  const missingUncertainty = [...requiredUncertaintyIds]
    .filter((id) => !actualUncertaintyIds.has(id))
    .sort(compareUtf8);
  const unexpectedUncertainty = [...actualUncertaintyIds]
    .filter((id) => !requiredUncertaintyIds.has(id))
    .sort(compareUtf8);
  const missingEvidence = [];
  const fabricatedEvidence = [];
  for (const claim of output.claims) {
    const expected = expectedById.get(claim.fact_id);
    for (const evidenceId of claim.evidence_ids) {
      if (!availableEvidence.has(evidenceId)) fabricatedEvidence.push(`${claim.fact_id}:${evidenceId}`);
    }
    if (expected !== undefined) {
      for (const evidenceId of expected.evidence_ids) {
        if (!claim.evidence_ids.includes(evidenceId)) missingEvidence.push(`${claim.fact_id}:${evidenceId}`);
      }
    }
  }

  const groups = [
    ['fact_missing', missingFacts],
    ['prohibited_fact', prohibitedFacts],
    ['unsupported_fact', unsupportedFacts],
    ['statement_mismatch', mismatchedStatements],
    ['uncertainty_missing', missingUncertainty],
    ['uncertainty_unexpected', unexpectedUncertainty],
    ['evidence_missing', missingEvidence.sort(compareUtf8)],
    ['evidence_fabricated', fabricatedEvidence.sort(compareUtf8)]
  ];
  for (const [code, values] of groups) {
    for (const value of values) findings.push(`${code}:${value}`);
  }

  return {
    checks: {
      expected_fact_coverage: missingFacts.length === 0,
      supported_claims: unsupportedFacts.length === 0
        && mismatchedStatements.length === 0
        && fabricatedEvidence.length === 0,
      required_evidence: missingEvidence.length === 0 && fabricatedEvidence.length === 0,
      uncertainty_preserved: missingUncertainty.length === 0 && unexpectedUncertainty.length === 0,
      prohibited_behavior_absent: prohibitedFacts.length === 0
    },
    findings
  };
}

function createResult(caseFixture, output, inspection) {
  const dimensions = caseFixture.rubric.dimensions.map((dimension) => {
    const failedChecks = dimension.checks.filter((check) => !inspection.checks[check]);
    return {
      name: dimension.name,
      score: failedChecks.length === 0 ? 1 : 0,
      critical: dimension.critical,
      observations: failedChecks.length === 0
        ? [`All declared ${dimension.name} checks were satisfied.`]
        : failedChecks.map((check) => `Required check ${check} was not satisfied.`)
    };
  });
  const overallScore = dimensions.reduce((sum, dimension, index) =>
    sum + dimension.score * caseFixture.rubric.dimensions[index].weight, 0
  );
  const hasCriticalFailure = dimensions.some((dimension) => dimension.critical && dimension.score < 1);
  return {
    evaluator_version: evaluatorVersion,
    result_version: caseFixture.result_version,
    case_id: caseFixture.id,
    case_version: caseFixture.version,
    case_digest: createCaseDigest(caseFixture),
    output_id: output.id,
    pack_id: caseFixture.pack.id,
    pack_version: caseFixture.pack.version,
    snapshot_id: caseFixture.pack.snapshot_id,
    dimensions,
    overall_score: Number(overallScore.toFixed(12)),
    outcome: !hasCriticalFailure && overallScore >= caseFixture.rubric.pass_threshold ? 'pass' : 'fail',
    findings: inspection.findings
  };
}

export function evaluateStaticReasoning(caseFixture, output, context, registry) {
  validateReviewedCase(caseFixture, registry);
  validateOutput(caseFixture, output, registry);
  validateContext(caseFixture, context, registry);
  return createResult(caseFixture, output, inspectOutput(caseFixture, output, context));
}

function validateResultShape(result) {
  requireObject(result, 'evaluation.result_invalid', 'evaluation result');
  assertExactKeys(
    result,
    [
      'evaluator_version',
      'result_version',
      'case_id',
      'case_version',
      'case_digest',
      'output_id',
      'pack_id',
      'pack_version',
      'snapshot_id',
      'dimensions',
      'overall_score',
      'outcome',
      'findings'
    ],
    'evaluation.result_invalid',
    'evaluation result'
  );
}

export function verifyStaticEvaluationResult(caseFixture, output, context, result, registry) {
  validateReviewedCase(caseFixture, registry);
  validateResultShape(result);
  validateIdentity(
    result.result_version,
    caseFixture.result_version,
    'evaluation.result_version_mismatch',
    'result_version'
  );
  validateIdentity(result.case_id, caseFixture.id, 'evaluation.case_mismatch', 'result case_id');
  validateIdentity(
    result.case_version,
    caseFixture.version,
    'evaluation.case_version_mismatch',
    'result case_version'
  );
  validateIdentity(
    result.case_digest,
    createCaseDigest(caseFixture),
    'evaluation.case_digest_mismatch',
    'result case_digest'
  );
  validateIdentity(result.pack_id, caseFixture.pack.id, 'evaluation.pack_mismatch', 'result pack_id');
  validateIdentity(
    result.pack_version,
    caseFixture.pack.version,
    'evaluation.pack_version_mismatch',
    'result pack_version'
  );
  validateIdentity(
    result.snapshot_id,
    caseFixture.pack.snapshot_id,
    'evaluation.snapshot_mismatch',
    'result snapshot_id'
  );

  const dimensions = requireArray(result.dimensions, 'evaluation.result_invalid', 'result dimensions');
  const actualNames = dimensions.map((dimension) => dimension.name);
  const expectedNames = caseFixture.rubric.dimensions.map((dimension) => dimension.name);
  const duplicates = findDuplicates(actualNames);
  if (duplicates.length > 0) {
    fail('evaluation.dimension_duplicate', `result dimension ${duplicates[0]} is duplicated`);
  }
  const actualSet = new Set(actualNames);
  const expectedSet = new Set(expectedNames);
  const unexpected = actualNames.filter((name) => !expectedSet.has(name));
  if (unexpected.length > 0) {
    fail('evaluation.dimension_unexpected', `result dimension ${unexpected[0]} is unexpected`);
  }
  const missing = expectedNames.filter((name) => !actualSet.has(name));
  if (missing.length > 0) {
    fail('evaluation.dimension_missing', `result dimension ${missing[0]} is missing`);
  }
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
    fail('evaluation.dimension_order', 'result dimensions do not match rubric order');
  }

  const expected = evaluateStaticReasoning(caseFixture, output, context, registry);
  if (canonicalJson(result) !== canonicalJson(expected)) {
    fail('evaluation.result_mismatch', 'result differs from deterministic evaluation output');
  }
  return result;
}

export function canonicalizeEvaluationResult(result) {
  validateResultShape(result);
  return canonicalJson(result);
}

export function evaluateComponentCase(componentCase, actualOutput, registry) {
  validateComponentCase(componentCase);
  const state = getRegistryState(registry);
  const key = `${componentCase.id}@${componentCase.version}`;
  const expectedDigest = state.componentDigests.get(key);
  if (expectedDigest === undefined) {
    fail('evaluation.component_unreviewed', `component case ${key} is not reviewed`);
  }
  if (createValueDigest(componentCase) !== expectedDigest) {
    fail(
      'evaluation.component_registry_mismatch',
      `component case ${key} differs from its reviewed fixture registry identity`
    );
  }
  const isMatch = canonicalJson(actualOutput) === canonicalJson(componentCase.expected);
  return {
    evaluator_version: evaluatorVersion,
    fixture_version: componentCase.fixture_version,
    case_id: componentCase.id,
    case_version: componentCase.version,
    component: componentCase.component,
    expected_digest: `sha256:${sha256(canonicalJson(componentCase.expected))}`,
    actual_digest: `sha256:${sha256(canonicalJson(actualOutput))}`,
    outcome: isMatch ? 'pass' : 'fail',
    findings: isMatch ? [] : ['component_output_mismatch']
  };
}

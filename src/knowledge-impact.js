import micromatch from 'micromatch';

import { identifyChangeSet, normalizeChangeSet } from './change-set.js';
import { discoverContentGroups, parseKnowledgeSource, parseStructuredSource } from './formats.js';
import {
  InterchangeError,
  canonicalJson,
  compareUtf8,
  requireNonEmptyString,
  validatePortablePath
} from './interchange.js';
import { verifySnapshotExport } from './snapshot-interchange.js';

const structuralRelationships = new Set([
  'constrains',
  'depends_on',
  'implemented_by',
  'implements',
  'x-blocked-by'
]);
const coreRelationshipTypes = new Set([
  'constrains',
  'contradicts',
  'depends_on',
  'implemented_by',
  'implements',
  'related_to',
  'superseded_by',
  'supersedes',
  'traces_to',
  'validated_by'
]);
const pathEvidenceKinds = new Set(['decision_record', 'generated_artifact', 'source_file', 'test']);
const ambiguousStatuses = new Set(['historical_knowledge', 'uncertainty']);
const policyAreas = new Set(['business', 'domain_model', 'historical', 'operational']);
const matchOptions = Object.freeze({ dot: false, nobrace: true, noext: true, nonegate: true });

function fail(code, message) {
  throw new InterchangeError(code, message);
}

function assertExactKeys(value, allowed, code, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key)).sort(compareUtf8);
  if (unexpected.length > 0) fail(code, `${label} has unsupported field ${unexpected[0]}`);
}

function requireArray(value, field, knowledgeId) {
  if (!Array.isArray(value)) {
    fail('impact.knowledge_invalid', `${knowledgeId} ${field} must be an array`);
  }
  return value;
}

function hasGlob(pattern) {
  return /[*?[\]]/.test(pattern);
}

function validatePattern(value, field) {
  let pattern;
  try {
    pattern = validatePortablePath(value, field);
    micromatch.makeRe(pattern, matchOptions);
  } catch (error) {
    fail('impact.locator_invalid', `${field} is not a valid path pattern: ${error.message}`);
  }
  return pattern;
}

function matches(pattern, candidate) {
  return hasGlob(pattern)
    ? micromatch.isMatch(candidate, pattern, matchOptions)
    : candidate === pattern;
}

function sortUnique(values) {
  return [...new Set(values)].sort(compareUtf8);
}

function sortSignals(signals) {
  const unique = new Map(signals.map((signal) => [canonicalJson(signal), signal]));
  return [...unique.entries()]
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([, signal]) => signal);
}

function changedEndpoints(change) {
  return change.change_type === 'renamed'
    ? sortUnique([change.path, change.old_path])
    : [change.path];
}

function matchingChanges(pattern, changes) {
  return changes.filter((change) =>
    matches(pattern, change.path) || (change.old_path !== undefined && matches(pattern, change.old_path))
  );
}

function pathSignal({ kind, pattern, changes, repositoryId }) {
  const matching = matchingChanges(pattern, changes);
  if (matching.length === 0) return null;
  const signal = {
    type: kind,
    locator: pattern,
    match: hasGlob(pattern) ? 'glob' : 'exact',
    change_types: sortUnique(matching.map((change) => change.change_type)),
    paths: sortUnique(matching.flatMap(changedEndpoints))
  };
  if (repositoryId !== undefined) signal.repository_id = repositoryId;
  return {
    signal,
    paths: matching.flatMap(changedEndpoints)
  };
}

function parsePack(verified) {
  const manifestBytes = verified.files.get('pack.yaml');
  let manifest;
  try {
    manifest = parseStructuredSource(manifestBytes.toString('utf8'), 'pack.yaml');
  } catch (error) {
    fail('impact.pack_invalid', `pack.yaml cannot be parsed: ${error.message}`);
  }
  const { discovered, overlaps } = discoverContentGroups(manifest, [...verified.files.keys()]);
  if (overlaps.length > 0) {
    fail('impact.pack_invalid', `${overlaps[0].path} belongs to multiple content groups`);
  }
  return { manifest, knowledgePaths: discovered.get('knowledge') };
}

function parseRecords(verified, packManifest, knowledgePaths) {
  const sources = requireArray(packManifest.sources, 'sources', verified.manifest.pack_id);
  if (sources.length === 0) fail('impact.pack_invalid', 'pack must declare at least one evidence source');
  const sourceIds = new Set();
  const localSourceIds = new Set();
  for (const source of sources) {
    const sourceId = requireNonEmptyString(
      source?.id,
      'impact.pack_invalid',
      `${verified.manifest.pack_id} source ID`
    );
    if (sourceIds.has(sourceId)) fail('impact.pack_invalid', `source ID ${sourceId} is duplicated`);
    if (!['artifact', 'git', 'local', 'web'].includes(source.kind)) {
      fail('impact.pack_invalid', `source ${sourceId} has unsupported kind ${source.kind}`);
    }
    sourceIds.add(sourceId);
    if (source.kind === 'local') localSourceIds.add(sourceId);
  }
  const records = new Map();
  const declaredRelationshipTypes = new Set(coreRelationshipTypes);
  for (const declaration of packManifest.extensions?.relationship_types ?? []) {
    const name = requireNonEmptyString(
      declaration?.name,
      'impact.pack_invalid',
      `${verified.manifest.pack_id} relationship extension name`
    );
    declaredRelationshipTypes.add(name);
  }

  for (const recordPath of knowledgePaths) {
    let data;
    try {
      data = parseKnowledgeSource(verified.files.get(recordPath).toString('utf8'), recordPath).data;
    } catch (error) {
      fail('impact.knowledge_invalid', `${recordPath} cannot be parsed: ${error.message}`);
    }
    const id = requireNonEmptyString(data.id, 'impact.knowledge_invalid', `${recordPath} knowledge ID`);
    if (!id.startsWith(`${verified.manifest.pack_id}.`)) {
      fail('impact.knowledge_cross_pack', `${id} is outside pack ${verified.manifest.pack_id}`);
    }
    if (records.has(id)) fail('impact.knowledge_duplicate', `knowledge ID ${id} is duplicated`);

    const evidenceIds = new Set();
    const pathEvidence = [];
    for (const evidence of requireArray(data.evidence, 'evidence', id)) {
      const evidenceId = requireNonEmptyString(
        evidence?.id,
        'impact.knowledge_invalid',
        `${id} evidence ID`
      );
      if (evidenceIds.has(evidenceId)) {
        fail('impact.evidence_duplicate', `${id} duplicates evidence ID ${evidenceId}`);
      }
      evidenceIds.add(evidenceId);
      const sourceId = requireNonEmptyString(
        evidence.source_id,
        'impact.knowledge_invalid',
        `${id} evidence source ID`
      );
      if (!sourceIds.has(sourceId)) {
        fail('impact.evidence_source_missing', `${id} evidence names unknown source ${sourceId}`);
      }
      const evidenceKind = requireNonEmptyString(
        evidence.kind,
        'impact.knowledge_invalid',
        `${id} evidence kind`
      );
      requireNonEmptyString(
        evidence.locator,
        'impact.knowledge_invalid',
        `${id} evidence locator`
      );
      if (localSourceIds.has(sourceId) && pathEvidenceKinds.has(evidenceKind)) {
        pathEvidence.push({
          id: evidenceId,
          source_id: sourceId,
          locator: validatePattern(evidence.locator, `${id} evidence locator`)
        });
      }
    }

    const rawClaims = requireArray(data.claims, 'claims', id);
    if (rawClaims.length === 0) fail('impact.knowledge_invalid', `${id} must declare at least one claim`);
    const claims = rawClaims.map((claim) => {
      const evidenceRefs = requireArray(claim?.evidence_refs, 'claim evidence_refs', id);
      for (const evidenceRef of evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) {
          fail('impact.evidence_missing', `${id} claim references unknown evidence ${evidenceRef}`);
        }
      }
      const epistemicStatus = requireNonEmptyString(
          claim.epistemic_status,
          'impact.knowledge_invalid',
          `${id} claim epistemic status`
        );
      if (![
        'historical_knowledge',
        'inference',
        'supported_conclusion',
        'uncertainty',
        'verified_fact'
      ].includes(epistemicStatus)) {
        fail('impact.knowledge_invalid', `${id} has unsupported epistemic status ${epistemicStatus}`);
      }
      return {
        epistemic_status: epistemicStatus,
        evidence_refs: evidenceRefs
      };
    });

    const relationships = requireArray(data.relationships, 'relationships', id).map((relationship) => {
      const relationshipType = requireNonEmptyString(
        relationship?.type,
        'impact.relationship_invalid',
        `${id} relationship type`
      );
      if (!declaredRelationshipTypes.has(relationshipType)) {
        fail(
          'impact.relationship_type_undeclared',
          `${id} uses undeclared relationship type ${relationshipType}`
        );
      }
      const targetKind = requireNonEmptyString(
        relationship?.target_kind,
        'impact.relationship_invalid',
        `${id} relationship target kind`
      );
      if (!['code', 'external', 'knowledge'].includes(targetKind)) {
        fail('impact.relationship_invalid', `${id} has unsupported relationship target kind ${targetKind}`);
      }
      return {
        type: relationshipType,
        target_kind: targetKind,
        target: requireNonEmptyString(
          relationship?.target,
          'impact.relationship_invalid',
          `${id} relationship target`
        ),
        rationale: relationship.rationale
      };
    });

    const appliesTo = requireArray(data.applies_to, 'applies_to', id)
      .map((pattern) => validatePattern(pattern, `${id} applies_to`));
    if (appliesTo.length === 0) fail('impact.knowledge_invalid', `${id} must declare applies_to`);
    const triggers = requireArray(data.freshness?.invalidation_triggers, 'freshness triggers', id)
      .filter((trigger) => trigger?.type === 'path_changed')
      .map((trigger) => {
        const repositoryId = trigger.repository_id === undefined
          ? undefined
          : requireNonEmptyString(
            trigger.repository_id,
            'impact.knowledge_invalid',
            `${id} freshness repository ID`
          );
        if (repositoryId !== undefined && !sourceIds.has(repositoryId)) {
          fail(
            'impact.repository_source_missing',
            `${id} freshness trigger binds to undeclared source ${repositoryId}`
          );
        }
        return {
          pattern: validatePattern(trigger.value, `${id} freshness path trigger`),
          repository_id: repositoryId
        };
      });
    const dependencyTriggers = data.freshness.invalidation_triggers
      .filter((trigger) => trigger?.type === 'dependency_changed')
      .map((trigger) => requireNonEmptyString(
        trigger.value,
        'impact.knowledge_invalid',
        `${id} dependency_changed trigger`
      ));
    const knowledgeAreas = requireArray(data.knowledge_areas, 'knowledge_areas', id)
      .map((area) => requireNonEmptyString(area, 'impact.knowledge_invalid', `${id} knowledge area`));
    if (knowledgeAreas.length === 0) {
      fail('impact.knowledge_invalid', `${id} must declare at least one knowledge area`);
    }
    const status = requireNonEmptyString(data.status, 'impact.knowledge_invalid', `${id} status`);
    if (!['accepted', 'deprecated', 'draft', 'superseded'].includes(status)) {
      fail('impact.knowledge_invalid', `${id} has unsupported status ${status}`);
    }

    records.set(id, {
      id,
      status,
      applies_to: appliesTo,
      evidence: pathEvidence,
      claims,
      relationships,
      freshness_paths: triggers,
      dependency_triggers: dependencyTriggers,
      knowledge_areas: knowledgeAreas
    });
  }

  for (const record of records.values()) {
    for (const relationship of record.relationships.filter((item) => item.target_kind === 'knowledge')) {
      if (!relationship.target.startsWith(`${verified.manifest.pack_id}.`)) {
        fail(
          'impact.relationship_cross_pack',
          `${record.id} relationship targets cross-pack knowledge ${relationship.target}`
        );
      }
      if (!records.has(relationship.target)) {
        fail(
          'impact.knowledge_missing',
          `${record.id} relationship targets unknown knowledge ${relationship.target}`
        );
      }
    }
  }
  return { localSourceIds, records };
}

function directAssessment(record, changes, repositoryId, repositoryBoundMode, localSourceIds) {
  const signals = [];
  const paths = [];
  const matchedEvidenceIds = new Set();
  const exactDirectPaths = new Set();
  const localRepositoryMatches = !repositoryBoundMode || localSourceIds.has(repositoryId);
  const unqualifiedLocalPathsMatch = !repositoryBoundMode
    || (localSourceIds.size === 1 && localSourceIds.has(repositoryId));

  if (localRepositoryMatches) {
    for (const evidence of record.evidence) {
      if (repositoryBoundMode && evidence.source_id !== repositoryId) continue;
      const result = pathSignal({ kind: 'evidence_locator', pattern: evidence.locator, changes });
      if (!result) continue;
      signals.push(result.signal);
      paths.push(...result.paths);
      matchedEvidenceIds.add(evidence.id);
      if (!hasGlob(evidence.locator)) {
        for (const matchedPath of result.paths) exactDirectPaths.add(matchedPath);
      }
    }
  }

  if (unqualifiedLocalPathsMatch) {
    for (const pattern of record.applies_to) {
      const result = pathSignal({ kind: 'applies_to', pattern, changes });
      if (!result) continue;
      signals.push(result.signal);
      paths.push(...result.paths);
      if (!hasGlob(pattern)) {
        for (const matchedPath of result.paths) exactDirectPaths.add(matchedPath);
      }
    }
  }

  for (const trigger of record.freshness_paths) {
    if (trigger.repository_id === undefined && !unqualifiedLocalPathsMatch) continue;
    if (trigger.repository_id !== undefined && trigger.repository_id !== repositoryId) continue;
    const result = pathSignal({
      kind: 'freshness_path',
      pattern: trigger.pattern,
      changes,
      repositoryId: trigger.repository_id
    });
    if (!result) continue;
    signals.push(result.signal);
    paths.push(...result.paths);
  }

  if (unqualifiedLocalPathsMatch) {
    for (const relationship of record.relationships.filter((item) =>
      ['code', 'external'].includes(item.target_kind)
      && !item.target.includes('://')
    )) {
      const pattern = validatePattern(relationship.target, `${record.id} relationship path`);
      const result = pathSignal({ kind: 'relationship_path', pattern, changes });
      if (!result) continue;
      signals.push({ ...result.signal, relationship_type: relationship.type });
      paths.push(...result.paths);
    }
  }

  if (signals.length === 0) return null;
  const ambiguousClaims = record.claims
    .filter((claim) =>
      ambiguousStatuses.has(claim.epistemic_status)
      && claim.evidence_refs.some((evidenceId) => matchedEvidenceIds.has(evidenceId))
    )
    .map((claim) => claim.epistemic_status);
  const triggeringPaths = sortUnique(paths);
  const basis = sortSignals(signals);
  const everyPathHasExactDirectEvidence = triggeringPaths.every((path) => exactDirectPaths.has(path));

  if (ambiguousClaims.length > 0) {
    return {
      knowledge_id: record.id,
      review_requirement: 'sme_required',
      triggering_paths: triggeringPaths,
      evidence_strength: 'limited',
      basis,
      limitations: ['matched repository evidence cannot resolve historical or uncertain meaning'],
      explanation: `Matched evidence for ${record.id} supports ${sortUnique(ambiguousClaims).join(' and ')} meaning that changed paths alone cannot resolve; SME review is required.`
    };
  }
  if (everyPathHasExactDirectEvidence) {
    return {
      knowledge_id: record.id,
      review_requirement: 'mechanical',
      triggering_paths: triggeringPaths,
      evidence_strength: 'strong',
      basis,
      limitations: [],
      explanation: `Exact repository path evidence directly links every triggering path (${triggeringPaths.join(', ')}) to ${record.id}; a reviewer can verify the impact relationship mechanically.`
    };
  }
  return {
    knowledge_id: record.id,
    review_requirement: 'interpretive',
    triggering_paths: triggeringPaths,
    evidence_strength: 'bounded',
    basis,
    limitations: ['the declared match establishes scope, not the meaning of the change'],
    explanation: `Declared glob, freshness, or relationship-path evidence links ${triggeringPaths.join(', ')} to ${record.id}; engineering judgment is required to determine meaning.`
  };
}

function relationshipRequiresSme(relationship, target) {
  if (target.claims.some((claim) => claim.epistemic_status === 'historical_knowledge')) return true;
  return ['constrains', 'x-blocked-by'].includes(relationship.type)
    && target.knowledge_areas.some((area) => policyAreas.has(area));
}

function relationshipAssessment(source, target, relationship, sourceAssessment) {
  const smeRequired = relationshipRequiresSme(relationship, target);
  return {
    knowledge_id: target.id,
    review_requirement: smeRequired ? 'sme_required' : 'interpretive',
    triggering_paths: [...sourceAssessment.triggering_paths],
    evidence_strength: smeRequired ? 'limited' : 'bounded',
    basis: [{
      type: 'knowledge_relationship',
      direction: 'outbound',
      source_knowledge_id: source.id,
      relationship_type: relationship.type,
      target_knowledge_id: target.id
    }],
    limitations: [smeRequired
      ? 'repository evidence cannot resolve the related historical, business, domain, or operational meaning'
      : 'one outbound relationship establishes possible impact, not changed meaning'],
    explanation: smeRequired
      ? `Directly affected ${source.id} reaches ${target.id} through outbound ${relationship.type}; repository evidence cannot resolve the target meaning, so SME review is required.`
      : `Directly affected ${source.id} reaches ${target.id} through one outbound ${relationship.type} relationship; engineering judgment is required.`
  };
}

function mergeRelationshipAssessments(assessments) {
  const first = assessments[0];
  const smeRequired = assessments.some((assessment) => assessment.review_requirement === 'sme_required');
  const basis = sortSignals(assessments.flatMap((assessment) => assessment.basis));
  const types = sortUnique(basis.map((signal) => signal.relationship_type));
  return {
    knowledge_id: first.knowledge_id,
    review_requirement: smeRequired ? 'sme_required' : 'interpretive',
    triggering_paths: sortUnique(assessments.flatMap((assessment) => assessment.triggering_paths)),
    evidence_strength: smeRequired ? 'limited' : 'bounded',
    basis,
    limitations: sortUnique(assessments.flatMap((assessment) => assessment.limitations)),
    explanation: smeRequired
      ? `One-hop outbound ${types.join(', ')} evidence reaches ${first.knowledge_id}, but repository evidence cannot resolve its historical, business, domain, or operational meaning; SME review is required.`
      : `One-hop outbound ${types.join(', ')} evidence reaches ${first.knowledge_id}; engineering judgment is required.`
  };
}

function classifyRecords(records, changes, repositoryId, localSourceIds) {
  const accepted = [...records.values()]
    .filter((record) => record.status === 'accepted')
    .sort((left, right) => compareUtf8(left.id, right.id));
  const repositoryBoundMode = accepted.some((record) =>
    record.freshness_paths.some((trigger) => trigger.repository_id !== undefined)
  );
  const direct = new Map();
  for (const record of accepted) {
    const assessment = directAssessment(
      record,
      changes,
      repositoryId,
      repositoryBoundMode,
      localSourceIds
    );
    if (assessment) direct.set(record.id, assessment);
  }

  const propagated = new Map();
  for (const [sourceId, sourceAssessment] of direct) {
    const source = records.get(sourceId);
    for (const relationship of source.relationships) {
      if (relationship.target_kind !== 'knowledge') continue;
      if (relationship.type === 'contradicts') {
        fail(
          'impact.relationship_conflict',
          `${source.id} contradicts ${relationship.target}; impact cannot be justified deterministically`
        );
      }
      if (!structuralRelationships.has(relationship.type)) continue;
      const target = records.get(relationship.target);
      if (target.status !== 'accepted' || direct.has(target.id)) continue;
      const assessment = relationshipAssessment(source, target, relationship, sourceAssessment);
      const existing = propagated.get(target.id) ?? [];
      existing.push(assessment);
      propagated.set(target.id, existing);
    }
  }

  const affected = [...direct.values()];
  for (const assessments of propagated.values()) {
    affected.push(mergeRelationshipAssessments(assessments));
  }
  affected.sort((left, right) => compareUtf8(left.knowledge_id, right.knowledge_id));
  return {
    acceptedCount: accepted.length,
    affected,
    dependencyTriggerCount: accepted.reduce(
      (count, record) => count + record.dependency_triggers.length,
      0
    ),
    repositoryBoundMode
  };
}

function verifyOrderedStrings(values, label, { paths = false, nonEmpty = false } = {}) {
  if (!Array.isArray(values) || (nonEmpty && values.length === 0)) {
    fail('impact.result_invalid', `${label} must be${nonEmpty ? ' a non-empty' : ' an'} array`);
  }
  let prior;
  for (const value of values) {
    requireNonEmptyString(value, 'impact.result_invalid', label);
    if (paths) {
      try {
        validatePortablePath(value, label);
      } catch (error) {
        fail('impact.result_invalid', `${label} contains an invalid path: ${error.message}`);
      }
    }
    if (prior !== undefined && compareUtf8(prior, value) >= 0) {
      fail('impact.result_invalid', `${label} must be unique and use stable UTF-8 ordering`);
    }
    prior = value;
  }
}

function verifyBasisSignal(signal, label) {
  if (signal === null || typeof signal !== 'object' || Array.isArray(signal)) {
    fail('impact.result_evidence_invalid', `${label} must be an object`);
  }
  const type = requireNonEmptyString(
    signal.type,
    'impact.result_evidence_invalid',
    `${label} type`
  );
  if (type === 'knowledge_relationship') {
    assertExactKeys(
      signal,
      ['type', 'direction', 'source_knowledge_id', 'relationship_type', 'target_knowledge_id'],
      'impact.result_evidence_invalid',
      label
    );
    if (signal.direction !== 'outbound') {
      fail('impact.result_evidence_invalid', `${label} relationship direction must be outbound`);
    }
    for (const field of ['source_knowledge_id', 'relationship_type', 'target_knowledge_id']) {
      requireNonEmptyString(signal[field], 'impact.result_evidence_invalid', `${label} ${field}`);
    }
    return;
  }
  if (!['applies_to', 'evidence_locator', 'freshness_path', 'relationship_path'].includes(type)) {
    fail('impact.result_evidence_invalid', `${label} has unsupported signal type ${type}`);
  }
  assertExactKeys(
    signal,
    type === 'relationship_path'
      ? ['type', 'locator', 'match', 'change_types', 'paths', 'relationship_type']
      : type === 'freshness_path'
        ? ['type', 'locator', 'match', 'change_types', 'paths', 'repository_id']
        : ['type', 'locator', 'match', 'change_types', 'paths'],
    'impact.result_evidence_invalid',
    label
  );
  try {
    validatePattern(signal.locator, `${label} locator`);
  } catch (error) {
    fail('impact.result_evidence_invalid', `${label} locator is invalid: ${error.message}`);
  }
  if (!['exact', 'glob'].includes(signal.match)) {
    fail('impact.result_evidence_invalid', `${label} match must be exact or glob`);
  }
  verifyOrderedStrings(signal.change_types, `${label} change_types`, { nonEmpty: true });
  if (signal.change_types.some((changeType) =>
    !['added', 'deleted', 'modified', 'renamed'].includes(changeType)
  )) {
    fail('impact.result_evidence_invalid', `${label} contains an unsupported change type`);
  }
  verifyOrderedStrings(signal.paths, `${label} paths`, { paths: true, nonEmpty: true });
  if (type === 'freshness_path' && signal.repository_id !== undefined) {
    requireNonEmptyString(
      signal.repository_id,
      'impact.result_evidence_invalid',
      `${label} repository_id`
    );
  }
  if (type === 'relationship_path') {
    requireNonEmptyString(
      signal.relationship_type,
      'impact.result_evidence_invalid',
      `${label} relationship_type`
    );
  }
}

export function verifyKnowledgeImpactAssessment(assessment) {
  if (assessment === null || typeof assessment !== 'object' || Array.isArray(assessment)) {
    fail('impact.result_invalid', 'impact assessment must be an object');
  }
  assertExactKeys(
    assessment,
    [
      'assessment_version',
      'change_set_id',
      'snapshot',
      'outcome',
      'completeness',
      'limitations',
      'affected',
      'rationale'
    ],
    'impact.result_invalid',
    'impact assessment'
  );
  if (assessment.assessment_version !== '1.0-experimental') {
    fail('impact.result_invalid', 'impact assessment version is unsupported');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(assessment.change_set_id)) {
    fail('impact.result_invalid', 'impact change-set ID must be a SHA-256 identity');
  }
  if (assessment.snapshot === null || typeof assessment.snapshot !== 'object' || Array.isArray(assessment.snapshot)) {
    fail('impact.result_invalid', 'impact snapshot identity must be an object');
  }
  assertExactKeys(
    assessment.snapshot,
    ['pack_id', 'pack_revision', 'snapshot_id'],
    'impact.result_invalid',
    'impact snapshot identity'
  );
  requireNonEmptyString(assessment.snapshot.pack_id, 'impact.result_invalid', 'impact pack ID');
  requireNonEmptyString(assessment.snapshot.pack_revision, 'impact.result_invalid', 'impact pack revision');
  if (!/^sha256:[a-f0-9]{64}$/.test(assessment.snapshot.snapshot_id)) {
    fail('impact.result_invalid', 'impact snapshot ID must be a SHA-256 identity');
  }
  if (!['indeterminate', 'knowledge_update_required', 'no_knowledge_change'].includes(assessment.outcome)) {
    fail('impact.result_invalid', 'impact outcome is unsupported');
  }
  if (!['complete', 'partial'].includes(assessment.completeness)) {
    fail('impact.result_invalid', 'impact completeness is unsupported');
  }
  verifyOrderedStrings(assessment.limitations, 'impact limitations');
  requireNonEmptyString(assessment.rationale, 'impact.result_invalid', 'impact rationale');
  if (!Array.isArray(assessment.affected)) {
    fail('impact.result_invalid', 'impact affected records must be an array');
  }

  let priorKnowledgeId;
  for (const [index, affected] of assessment.affected.entries()) {
    const label = `affected[${index}]`;
    if (affected === null || typeof affected !== 'object' || Array.isArray(affected)) {
      fail('impact.result_invalid', `${label} must be an object`);
    }
    assertExactKeys(
      affected,
      [
        'knowledge_id',
        'review_requirement',
        'triggering_paths',
        'evidence_strength',
        'basis',
        'limitations',
        'explanation'
      ],
      'impact.result_invalid',
      label
    );
    const knowledgeId = requireNonEmptyString(
      affected.knowledge_id,
      'impact.result_invalid',
      `${label} knowledge ID`
    );
    if (priorKnowledgeId !== undefined && compareUtf8(priorKnowledgeId, knowledgeId) >= 0) {
      fail('impact.result_invalid', 'affected knowledge IDs must be unique and stably ordered');
    }
    priorKnowledgeId = knowledgeId;
    if (!['interpretive', 'mechanical', 'sme_required'].includes(affected.review_requirement)) {
      fail('impact.result_invalid', `${label} review requirement is unsupported`);
    }
    if (!['bounded', 'limited', 'strong'].includes(affected.evidence_strength)) {
      fail('impact.result_invalid', `${label} evidence strength is unsupported`);
    }
    verifyOrderedStrings(affected.triggering_paths, `${label} triggering_paths`, {
      paths: true,
      nonEmpty: true
    });
    verifyOrderedStrings(affected.limitations, `${label} limitations`);
    for (const limitation of assessment.limitations) {
      if (!affected.limitations.includes(limitation)) {
        fail('impact.result_invalid', `${label} does not retain declaration limitation ${limitation}`);
      }
    }
    requireNonEmptyString(affected.explanation, 'impact.result_invalid', `${label} explanation`);
    if (!Array.isArray(affected.basis) || affected.basis.length === 0) {
      fail('impact.result_evidence_invalid', `${label} basis must contain structured evidence`);
    }
    let priorBasis;
    for (const [basisIndex, signal] of affected.basis.entries()) {
      verifyBasisSignal(signal, `${label}.basis[${basisIndex}]`);
      const canonical = canonicalJson(signal);
      if (priorBasis !== undefined && compareUtf8(priorBasis, canonical) >= 0) {
        fail('impact.result_evidence_invalid', `${label} basis must be unique and stably ordered`);
      }
      priorBasis = canonical;
    }
  }

  if (assessment.outcome === 'knowledge_update_required' && assessment.affected.length === 0) {
    fail('impact.result_invalid', 'update-required impact must contain an affected record');
  }
  if (assessment.outcome !== 'knowledge_update_required' && assessment.affected.length > 0) {
    fail('impact.result_invalid', `${assessment.outcome} impact cannot contain affected records`);
  }
  if (assessment.outcome === 'indeterminate' && assessment.completeness !== 'partial') {
    fail('impact.result_invalid', 'indeterminate impact must preserve partial completeness');
  }
  if (assessment.outcome === 'no_knowledge_change' && assessment.completeness !== 'complete') {
    fail('impact.result_invalid', 'no-change impact requires complete evidence');
  }
  if (assessment.completeness === 'partial' && assessment.limitations.length === 0) {
    fail('impact.result_invalid', 'partial impact must retain at least one limitation');
  }
  return structuredClone(assessment);
}

export function classifyKnowledgeImpact(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('impact.input_invalid', 'impact classifier input must be an object');
  }
  if (input.change_set?.representation_version !== '1.0') {
    fail('impact.change_set_version_mismatch', 'change set must be normalized representation version 1.0');
  }
  const expectedPackId = requireNonEmptyString(
    input.expected_pack_id,
    'impact.input_invalid',
    'expected pack ID'
  );
  const expectedSnapshotId = requireNonEmptyString(
    input.expected_snapshot_id,
    'impact.input_invalid',
    'expected snapshot ID'
  );
  const changeSet = normalizeChangeSet(input.change_set);
  const verified = verifySnapshotExport(input.snapshot_export);
  if (verified.manifest.pack_id !== expectedPackId) {
    fail(
      'impact.pack_mismatch',
      `snapshot pack is ${verified.manifest.pack_id}; expected ${expectedPackId}`
    );
  }
  if (verified.manifest.snapshot_id !== expectedSnapshotId) {
    fail(
      'impact.snapshot_mismatch',
      `snapshot is ${verified.manifest.snapshot_id}; expected ${expectedSnapshotId}`
    );
  }

  const { manifest: packManifest, knowledgePaths } = parsePack(verified);
  const { localSourceIds, records } = parseRecords(verified, packManifest, knowledgePaths);
  const limitations = [...changeSet.limitations];
  const classified = classifyRecords(
    records,
    changeSet.changes,
    changeSet.repository_id,
    localSourceIds
  );
  const acceptedCount = classified.acceptedCount;
  const dependencyTriggerNote = classified.dependencyTriggerCount === 0
    ? ''
    : ` ${classified.dependencyTriggerCount} dependency_changed trigger(s) remain freshness metadata and were not path-matched because their values do not identify repository-relative paths.`;
  const repositoryBindingNote = classified.repositoryBoundMode
    ? ' Repository-bound source matching is active; path surfaces were filtered using declared source bindings and the change-set repository_id.'
    : '';
  const affected = classified.affected.map((assessment) => ({
    ...assessment,
    limitations: sortUnique([...assessment.limitations, ...limitations])
  }));
  let outcome;
  let rationale;
  if (affected.length > 0) {
    outcome = 'knowledge_update_required';
    rationale = `${affected.length} accepted knowledge record(s) have deterministic path or bounded relationship evidence for review; no rewrite is proposed.${dependencyTriggerNote}${repositoryBindingNote}`;
  } else if (changeSet.completeness === 'partial') {
    outcome = 'indeterminate';
    rationale = `No visible change matched ${acceptedCount} accepted record(s), but partial change evidence cannot support an unqualified no-change conclusion.${dependencyTriggerNote}${repositoryBindingNote}`;
  } else if (changeSet.changes.length === 0) {
    outcome = 'no_knowledge_change';
    rationale = `The complete normalized change set is an explicit no-op; ${acceptedCount} accepted record(s) were examined against zero changed paths.${dependencyTriggerNote}${repositoryBindingNote}`;
  } else {
    outcome = 'no_knowledge_change';
    rationale = `The complete normalized change set has no exact, declared-glob, freshness-path, relationship-path, or bounded outbound relationship match across ${acceptedCount} accepted record(s).${dependencyTriggerNote}${repositoryBindingNote}`;
  }

  return verifyKnowledgeImpactAssessment({
    assessment_version: '1.0-experimental',
    change_set_id: identifyChangeSet(changeSet),
    snapshot: {
      pack_id: verified.manifest.pack_id,
      pack_revision: verified.manifest.pack_revision,
      snapshot_id: verified.manifest.snapshot_id
    },
    outcome,
    completeness: changeSet.completeness,
    limitations,
    affected,
    rationale
  });
}

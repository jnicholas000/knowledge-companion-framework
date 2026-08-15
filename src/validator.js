import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import { appendJsonPointer, createDiagnostic } from './diagnostics.js';
import {
  contentGroups,
  discoverContentGroups,
  loadKnowledgeFile,
  loadStructuredFile
} from './formats.js';
import { createSchemaValidator, schemaIds } from './schema-catalog.js';

const coreKnowledgeKinds = new Set([
  'concept',
  'architecture',
  'decision',
  'trace',
  'pattern',
  'constraint',
  'runbook',
  'glossary',
  'mission_guide',
  'code_tour',
  'task_guide',
  'onboarding'
]);

const coreRelationshipTypes = new Set([
  'depends_on',
  'implements',
  'implemented_by',
  'supersedes',
  'superseded_by',
  'related_to',
  'contradicts',
  'constrains',
  'traces_to',
  'validated_by'
]);

const localEvidenceKinds = new Set([
  'source_file',
  'test',
  'decision_record',
  'generated_artifact'
]);

const candidateTransitions = Object.freeze({
  proposed: new Set(['triaged', 'deferred', 'rejected']),
  triaged: new Set(['approved', 'deferred', 'rejected']),
  deferred: new Set(['triaged', 'rejected']),
  approved: new Set(['applied'])
});

const frameworkVersion = '0.1.0';

function diagnostic(severity, code, filePath, message, instancePath = '') {
  return createDiagnostic(severity, code, filePath, message, instancePath);
}

function addSchemaDiagnostics(result, filePath, errors = []) {
  for (const error of errors) {
    let location = error.instancePath || '/';
    if (error.params?.missingProperty) {
      location = appendJsonPointer(location, error.params.missingProperty);
    } else if (error.params?.additionalProperty) {
      location = appendJsonPointer(location, error.params.additionalProperty);
    }
    const detail = error.params?.missingProperty
      ? `missing required property ${error.params.missingProperty}`
      : error.message;
    result.errors.push(diagnostic('error', 'schema.invalid', filePath, detail, location));
  }
}

function relativeDisplay(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isSafeRelativePath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || path.isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^[\\/]/.test(value)
  ) return false;
  return !value.split(/[\\/]/).includes('..');
}

function uniqueValues(items, selector) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = selector(item);
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function supportsFramework(range) {
  const match = range.match(/^([~^]?)(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return false;
  const [, operator, majorText, minorText, patchText] = match;
  const requested = [Number(majorText), Number(minorText), Number(patchText ?? 0)];
  const current = frameworkVersion.split('.').map(Number);
  const atLeastRequested = current[0] > requested[0]
    || (current[0] === requested[0] && current[1] > requested[1])
    || (current[0] === requested[0] && current[1] === requested[1] && current[2] >= requested[2]);

  if (operator === '~') {
    return current[0] === requested[0] && current[1] === requested[1] && atLeastRequested;
  }
  if (operator === '^') {
    const compatibleLine = requested[0] === 0
      ? current[0] === 0 && current[1] === requested[1]
      : current[0] === requested[0];
    return compatibleLine && atLeastRequested;
  }
  return patchText === undefined
    ? current[0] === requested[0] && current[1] === requested[1]
    : current.every((part, index) => part === requested[index]);
}

function validateEvidenceReferences(result, file, record) {
  const evidenceIds = new Set((record.evidence ?? []).map((item) => item.id));
  const refOwners = [
    ...(record.claims ?? []).map((item, index) => ({
      owner: `claim ${item.id}`,
      refs: item.evidence_refs,
      pointer: `/claims/${index}/evidence_refs`
    })),
    ...(record.assumptions ?? []).map((item, index) => ({
      owner: `assumption ${item.id}`,
      refs: item.evidence_refs,
      pointer: `/assumptions/${index}/evidence_refs`
    })),
    ...(record.work_items ?? []).map((item, index) => ({
      owner: `work item ${item.id}`,
      refs: item.evidence_refs,
      pointer: `/work_items/${index}/evidence_refs`
    })),
    ...(record.comparable_completed_work ?? []).map((item, index) => ({
      owner: `comparable completed work ${index + 1}`,
      refs: item.evidence_refs,
      pointer: `/comparable_completed_work/${index}/evidence_refs`
    })),
    ...(record.proposed_changes ?? []).map((item, index) => ({
      owner: `proposed change ${index + 1}`,
      refs: item.evidence_refs,
      pointer: `/proposed_changes/${index}/evidence_refs`
    })),
    ...(record.dimensions ?? []).map((item, index) => ({
      owner: `dimension ${item.name}`,
      refs: item.evidence_refs,
      pointer: `/dimensions/${index}/evidence_refs`
    }))
  ];

  for (const { owner, refs = [], pointer } of refOwners) {
    for (const [index, evidenceRef] of refs.entries()) {
      if (!evidenceIds.has(evidenceRef)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.evidence_missing',
            file,
            `${owner} references evidence ${evidenceRef}, which is not supplied by this record`,
            `${pointer}/${index}`
          )
        );
      }
    }
  }
}

function validateRange(result, file, range, label) {
  if (!range || ![range.low, range.likely, range.high].every(Number.isFinite)) return;
  if (range.low > range.likely || range.likely > range.high) {
    result.errors.push(
      diagnostic('error', 'estimate.range_order', file, `${label} must satisfy low <= likely <= high`)
    );
  }
}

function validateSnapshot(result, file, snapshot, manifest, knowledgeIds, pointer) {
  if (!snapshot) return;
  if (snapshot.pack_id !== manifest.id) {
    result.errors.push(
      diagnostic(
        'error',
        'snapshot.pack_mismatch',
        file,
        `snapshot pack_id must be ${manifest.id}`,
        `${pointer}/pack_id`
      )
    );
  }
  if (snapshot.pack_version !== manifest.version) {
    result.errors.push(
      diagnostic(
        'error',
        'snapshot.version_mismatch',
        file,
        `snapshot pack_version must be ${manifest.version}`,
        `${pointer}/pack_version`
      )
    );
  }
  for (const [index, recordId] of (snapshot.record_ids ?? []).entries()) {
    if (!knowledgeIds.has(recordId)) {
      result.errors.push(
        diagnostic(
          'error',
          'reference.knowledge_missing',
          file,
          `snapshot references unknown knowledge ${recordId}`,
          `${pointer}/record_ids/${index}`
        )
      );
    }
  }
}

function hasSameSnapshotIdentity(left, right) {
  return left.pack_id === right.pack_id
    && left.pack_version === right.pack_version
    && left.snapshot_id === right.snapshot_id;
}

function validateCandidateLifecycle(result, record) {
  let current = 'proposed';
  for (const [index, transition] of (record.data.review_history ?? []).entries()) {
    if (transition.from !== current) {
      result.errors.push(
        diagnostic(
          'error',
          'learning.transition_disconnected',
          record.file,
          `review transition ${index + 1} starts at ${transition.from}; expected ${current}`
        )
      );
      current = transition.to;
      continue;
    }
    if (!candidateTransitions[current]?.has(transition.to)) {
      result.errors.push(
        diagnostic(
          'error',
          'learning.transition_invalid',
          record.file,
          `transition ${transition.from} -> ${transition.to} is not allowed`
        )
      );
    }
    current = transition.to;
  }
  if (record.data.state !== current) {
    result.errors.push(
      diagnostic(
        'error',
        'learning.state_mismatch',
        record.file,
        `state is ${record.data.state}, but review history ends at ${current}`
      )
    );
  }
}

async function findManifest(root) {
  const candidates = ['pack.yaml', 'pack.yml', 'pack.json'];
  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) return filePath;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

async function discoverFiles(root, manifest, result) {
  const absoluteFiles = await fg('**/*', {
    absolute: true,
    cwd: root,
    dot: false,
    followSymbolicLinks: false,
    onlyFiles: true,
    unique: true
  });
  const absoluteByRelative = new Map(
    absoluteFiles.map((filePath) => [relativeDisplay(root, filePath), filePath])
  );
  const { discovered: relativeFiles, overlaps } = discoverContentGroups(
    manifest,
    [...absoluteByRelative.keys()]
  );
  for (const overlap of overlaps) {
    result.errors.push(
      diagnostic(
        'error',
        'content.group_overlap',
        overlap.path,
        `file is discovered as both ${overlap.priorOwner} and ${overlap.group}`
      )
    );
  }
  return new Map(
    [...relativeFiles].map(([group, files]) => [
      group,
      files.map((filePath) => absoluteByRelative.get(filePath))
    ])
  );
}

async function loadRecords(root, discovered, ajv, result) {
  const records = new Map(contentGroups.map((group) => [group, []]));

  for (const group of contentGroups) {
    const validate = ajv.getSchema(schemaIds[group]);
    for (const absolutePath of discovered.get(group)) {
      const file = relativeDisplay(root, absolutePath);
      try {
        let data;
        let body;
        if (group === 'knowledge') {
          ({ data, body } = await loadKnowledgeFile(absolutePath));
          if (body.length === 0) {
            result.errors.push(
              diagnostic('error', 'knowledge.body_empty', file, 'knowledge Markdown body must not be empty')
            );
          } else if (!/^#\s+\S/m.test(body)) {
            result.warnings.push(
              diagnostic('warning', 'knowledge.heading_missing', file, 'knowledge body has no level-one heading')
            );
          }
        } else {
          data = await loadStructuredFile(absolutePath);
        }

        const valid = validate(data);
        if (!valid) addSchemaDiagnostics(result, file, validate.errors);
        records.get(group).push({ absolutePath, body, data, file, schemaValid: valid });
      } catch (error) {
        result.errors.push(diagnostic('error', 'parse.invalid', file, error.message));
      }
    }
  }

  return records;
}

async function validateLocalEvidence(result, root, manifest, records) {
  if (!manifest.policies.evidence.require_local_sources_to_exist) return;

  const sources = new Map(manifest.sources.map((source) => [source.id, source]));
  const localRoots = new Map();
  for (const source of manifest.sources.filter((item) => item.kind === 'local')) {
    const declaredRoot = path.resolve(root, source.root);
    try {
      const resolvedRoot = await fs.realpath(declaredRoot);
      const stats = await fs.stat(resolvedRoot);
      if (
        !stats.isDirectory()
        || (resolvedRoot !== root && !resolvedRoot.startsWith(`${root}${path.sep}`))
      ) {
        throw new Error('local source root must be a directory inside the pack root');
      }
      localRoots.set(source.id, resolvedRoot);
    } catch (error) {
      result.errors.push(
        diagnostic(
          'error',
          'source.root_invalid',
          'pack.yaml',
          `local source ${source.id} cannot be used: ${error.message}`
        )
      );
    }
  }

  for (const groupRecords of records.values()) {
    for (const record of groupRecords.filter((item) => item.schemaValid)) {
      for (const [index, evidence] of (record.data.evidence ?? []).entries()) {
        const source = sources.get(evidence.source_id);
        if (!source || source.kind !== 'local') continue;
        if (!localEvidenceKinds.has(evidence.kind)) continue;
        if (!isSafeRelativePath(evidence.locator)) {
          result.errors.push(
            diagnostic(
              'error',
              'evidence.path_unsafe',
              record.file,
              `local evidence ${evidence.id} has an unsafe locator: ${evidence.locator}`,
              `/evidence/${index}/locator`
            )
          );
          continue;
        }
        const sourceRoot = localRoots.get(source.id);
        if (!sourceRoot) continue;
        const target = path.resolve(sourceRoot, evidence.locator);
        if (target !== sourceRoot && !target.startsWith(`${sourceRoot}${path.sep}`)) {
          result.errors.push(
            diagnostic(
              'error',
              'evidence.path_unsafe',
              record.file,
              `evidence ${evidence.id} escapes the pack root`,
              `/evidence/${index}/locator`
            )
          );
          continue;
        }
        try {
          const resolvedTarget = await fs.realpath(target);
          if (resolvedTarget !== sourceRoot && !resolvedTarget.startsWith(`${sourceRoot}${path.sep}`)) {
            result.errors.push(
              diagnostic(
                'error',
                'evidence.path_unsafe',
                record.file,
                `local evidence ${evidence.id} resolves outside the pack root`,
                `/evidence/${index}/locator`
              )
            );
            continue;
          }
          const stats = await fs.stat(resolvedTarget);
          if (!stats.isFile()) throw new Error('not a file');
        } catch {
          result.errors.push(
            diagnostic(
              'error',
              'evidence.path_missing',
              record.file,
              `local evidence ${evidence.id} does not resolve to a file: ${evidence.locator}`,
              `/evidence/${index}/locator`
            )
          );
        }
      }
    }
  }
}

function validateIntegrity(result, manifest, records, now, strictFreshness) {
  const validRecords = (group) => records.get(group).filter((record) => record.schemaValid);
  const allRecords = [...records.values()].flat().filter((record) => record.schemaValid);
  const durableRecords = allRecords.filter((record) => record.data?.id);
  const duplicateIds = uniqueValues(durableRecords, (record) => record.data.id);
  for (const id of duplicateIds) {
    const locations = durableRecords.filter((record) => record.data.id === id).map((record) => record.file);
    result.errors.push(
      diagnostic('error', 'identity.duplicate', locations[0], `record ID ${id} is duplicated in ${locations.join(', ')}`)
    );
  }

  const knowledge = validRecords('knowledge');
  const knowledgeIds = new Set(knowledge.map((record) => record.data.id));
  const knowledgeById = new Map(knowledge.map((record) => [record.data.id, record.data]));
  for (const record of knowledge) {
    for (const claimId of uniqueValues(record.data.claims, (claim) => claim.id)) {
      result.errors.push(
        diagnostic(
          'error',
          'identity.claim_duplicate',
          record.file,
          `claim ID ${claimId} is duplicated within knowledge record ${record.data.id}`
        )
      );
    }
  }
  const knowledgeClaims = new Map(
    knowledge.map((record) => [record.data.id, new Set(record.data.claims.map((claim) => claim.id))])
  );
  const retrievalRequests = new Map(
    validRecords('retrieval_requests').map((record) => [record.data.id, record])
  );
  const retrievalResults = new Map(
    validRecords('retrieval_results').map((record) => [record.data.id, record])
  );
  const impacts = new Map(validRecords('impacts').map((record) => [record.data.id, record]));
  const candidates = new Map(validRecords('candidates').map((record) => [record.data.id, record]));
  const evaluationCases = new Map(validRecords('evaluation_cases').map((record) => [record.data.id, record]));
  const customKinds = new Set((manifest.extensions?.knowledge_kinds ?? []).map((item) => item.name));
  const customRelationships = new Set(
    (manifest.extensions?.relationship_types ?? []).map((item) => item.name)
  );

  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  for (const duplicate of uniqueValues(manifest.sources, (source) => source.id)) {
    result.errors.push(
      diagnostic('error', 'identity.source_duplicate', 'pack.yaml', `source ID ${duplicate} is duplicated`)
    );
  }

  if (!supportsFramework(manifest.framework_compatibility)) {
    result.errors.push(
      diagnostic(
        'error',
        'pack.framework_incompatible',
        'pack.yaml',
        `pack requires ${manifest.framework_compatibility}; validator is ${frameworkVersion}`
      )
    );
  }

  const evidenceLocations = new Map();
  for (const record of allRecords) {
    for (const [index, evidence] of (record.data.evidence ?? []).entries()) {
      if (!sourceIds.has(evidence.source_id)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.source_missing',
            record.file,
            `evidence ${evidence.id} references unknown source ${evidence.source_id}`,
            `/evidence/${index}/source_id`
          )
        );
      }
      const prior = evidenceLocations.get(evidence.id);
      if (prior && (prior.locator !== evidence.locator || prior.source_id !== evidence.source_id)) {
        result.errors.push(
          diagnostic(
            'error',
            'identity.evidence_conflict',
            record.file,
            `evidence ID ${evidence.id} resolves to conflicting sources or locators`
          )
        );
      } else if (!prior) {
        evidenceLocations.set(evidence.id, {
          source_id: evidence.source_id,
          locator: evidence.locator,
          file: record.file
        });
      }
    }
  }

  for (const record of allRecords) validateEvidenceReferences(result, record.file, record.data);

  for (const record of knowledge) {
    const { data, file } = record;
    if (!coreKnowledgeKinds.has(data.kind) && !customKinds.has(data.kind)) {
      result.errors.push(
        diagnostic(
          'error',
          'extension.kind_undeclared',
          file,
          `custom knowledge kind ${data.kind} is not declared`,
          '/kind'
        )
      );
    }

    for (const [index, relation] of (data.relationships ?? []).entries()) {
      if (!coreRelationshipTypes.has(relation.type) && !customRelationships.has(relation.type)) {
        result.errors.push(
          diagnostic(
            'error',
            'extension.relationship_undeclared',
            file,
            `custom relationship type ${relation.type} is not declared`,
            `/relationships/${index}/type`
          )
        );
      }
      if (relation.target_kind === 'knowledge' && !knowledgeIds.has(relation.target)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.knowledge_missing',
            file,
            `relationship targets unknown knowledge ${relation.target}`,
            `/relationships/${index}/target`
          )
        );
      }
    }

    const reviewAfter = Date.parse(`${data.freshness?.review_after}T23:59:59Z`);
    if (Number.isFinite(reviewAfter) && reviewAfter < now.getTime()) {
      const item = diagnostic(
        strictFreshness ? 'error' : 'warning',
        'freshness.review_due',
        file,
        `knowledge review was due on ${data.freshness.review_after}`,
        '/freshness/review_after'
      );
      (strictFreshness ? result.errors : result.warnings).push(item);
    }
  }

  for (const record of validRecords('retrieval_requests')) {
    validateSnapshot(
      result,
      record.file,
      record.data.knowledge_snapshot,
      manifest,
      knowledgeIds,
      '/knowledge_snapshot'
    );
    for (const recordId of record.data.filters.record_ids) {
      if (!knowledgeIds.has(recordId)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.knowledge_missing',
            record.file,
            `retrieval filter names unknown knowledge ${recordId}`
          )
        );
      }
    }
  }

  for (const record of validRecords('retrieval_results')) {
    validateSnapshot(
      result,
      record.file,
      record.data.knowledge_snapshot,
      manifest,
      knowledgeIds,
      '/knowledge_snapshot'
    );
    const request = retrievalRequests.get(record.data.request_id);
    if (!request) {
      result.errors.push(
        diagnostic(
          'error',
          'reference.retrieval_request_missing',
          record.file,
          `retrieval result names unknown request ${record.data.request_id}`
        )
      );
      continue;
    }
    if (record.data.matches.length > request.data.limit) {
      result.errors.push(
        diagnostic(
          'error',
          'retrieval.limit_exceeded',
          record.file,
          `result contains ${record.data.matches.length} matches; request limit is ${request.data.limit}`
        )
      );
    }
    const expectedSnapshot = request.data.knowledge_snapshot;
    const actualSnapshot = record.data.knowledge_snapshot;
    if (!hasSameSnapshotIdentity(expectedSnapshot, actualSnapshot)) {
      result.errors.push(
        diagnostic('error', 'retrieval.snapshot_mismatch', record.file, 'result snapshot differs from its request')
      );
    }
    for (const duplicate of uniqueValues(record.data.matches, (match) => match.rank)) {
      result.errors.push(
        diagnostic('error', 'retrieval.rank_duplicate', record.file, `retrieval rank ${duplicate} is duplicated`)
      );
    }
    for (const duplicate of uniqueValues(record.data.matches, (match) => match.record_id)) {
      result.errors.push(
        diagnostic(
          'error',
          'retrieval.record_duplicate',
          record.file,
          `knowledge record ${duplicate} appears more than once`
        )
      );
    }
    for (const [index, match] of record.data.matches.entries()) {
      if (match.rank !== index + 1) {
        result.errors.push(
          diagnostic(
            'error',
            'retrieval.rank_sequence',
            record.file,
            `match position ${index + 1} has rank ${match.rank}; ranks must be contiguous from 1`
          )
        );
      }
      if (index > 0 && match.score > record.data.matches[index - 1].score) {
        result.errors.push(
          diagnostic(
            'error',
            'retrieval.score_order',
            record.file,
            `rank ${match.rank} has a higher score than the preceding match`
          )
        );
      }
      const claimIds = knowledgeClaims.get(match.record_id);
      if (!claimIds) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.knowledge_missing',
            record.file,
            `retrieval result names unknown knowledge ${match.record_id}`
          )
        );
        continue;
      }
      const matchedKnowledge = knowledgeById.get(match.record_id);
      const filters = request.data.filters;
      const violatesStatus = !filters.statuses.includes(matchedKnowledge.status);
      const violatesKind = filters.kinds.length > 0 && !filters.kinds.includes(matchedKnowledge.kind);
      const violatesRecord = filters.record_ids.length > 0 && !filters.record_ids.includes(match.record_id);
      const violatesTags = !filters.tags.every((tag) => matchedKnowledge.tags.includes(tag));
      if (violatesStatus || violatesKind || violatesRecord || violatesTags) {
        result.errors.push(
          diagnostic(
            'error',
            'retrieval.filter_violation',
            record.file,
            `match ${match.record_id} does not satisfy its request filters`
          )
        );
      }
      for (const claimId of match.matched_claim_ids) {
        if (!claimIds.has(claimId)) {
          result.errors.push(
            diagnostic(
              'error',
              'reference.claim_missing',
              record.file,
              `match ${match.record_id} names unknown claim ${claimId}`
            )
          );
        }
      }
    }
  }

  for (const record of validRecords('impacts')) {
    for (const knowledgeId of record.data.affected_knowledge_ids ?? []) {
      if (!knowledgeIds.has(knowledgeId)) {
        result.errors.push(
          diagnostic('error', 'reference.knowledge_missing', record.file, `impact names unknown knowledge ${knowledgeId}`)
        );
      }
    }
    for (const candidateId of record.data.candidate_ids ?? []) {
      const candidate = candidates.get(candidateId);
      if (!candidate) {
        result.errors.push(
          diagnostic('error', 'reference.candidate_missing', record.file, `impact names unknown candidate ${candidateId}`)
        );
      } else if (candidate.data.impact_id !== record.data.id) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.impact_mismatch',
            candidate.file,
            `candidate points to ${candidate.data.impact_id}; expected ${record.data.id}`
          )
        );
      }
    }
  }

  for (const record of validRecords('candidates')) {
    const impact = impacts.get(record.data.impact_id);
    if (!impact) {
      result.errors.push(
        diagnostic('error', 'reference.impact_missing', record.file, `candidate names unknown impact ${record.data.impact_id}`)
      );
    } else {
      if (!impact.data.candidate_ids.includes(record.data.id)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.candidate_not_declared',
            record.file,
            `candidate ${record.data.id} is not declared by impact ${impact.data.id}`
          )
        );
      }
      if (impact.data.classification === 'no_knowledge_change') {
        result.errors.push(
          diagnostic(
            'error',
            'learning.no_change_candidate',
            record.file,
            `candidate ${record.data.id} cannot attach to no-knowledge-change impact ${impact.data.id}`
          )
        );
      }
    }
    if (record.data.target?.operation !== 'create' && !knowledgeIds.has(record.data.target?.record_id)) {
      result.errors.push(
        diagnostic(
          'error',
          'reference.knowledge_missing',
          record.file,
          `candidate targets unknown knowledge ${record.data.target?.record_id}`
        )
      );
    }
    validateCandidateLifecycle(result, record);

    if (record.data.state === 'applied') {
      const applicationRecordId = record.data.application.record_id;
      const applicationRecord = knowledgeById.get(applicationRecordId);
      if (!applicationRecord) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.application_record_missing',
            record.file,
            `applied candidate names unknown application record ${applicationRecordId}`
          )
        );
      } else if (applicationRecord.status !== 'accepted') {
        result.errors.push(
          diagnostic(
            'error',
            'learning.application_record_not_accepted',
            record.file,
            `application record ${applicationRecordId} has status ${applicationRecord.status}; expected accepted`
          )
        );
      }
      if (
        record.data.target.operation !== 'create'
        && applicationRecordId !== record.data.target.record_id
      ) {
        result.errors.push(
          diagnostic(
            'error',
            'learning.application_target_mismatch',
            record.file,
            `application record ${applicationRecordId} differs from candidate target ${record.data.target.record_id}`
          )
        );
      }
    }
  }

  for (const record of validRecords('estimates')) {
    validateSnapshot(
      result,
      record.file,
      record.data.knowledge_snapshot,
      manifest,
      knowledgeIds,
      '/knowledge_snapshot'
    );
    validateRange(result, record.file, record.data.range, 'aggregate estimate range');
    const workIds = new Set((record.data.work_items ?? []).map((item) => item.id));
    for (const item of record.data.work_items ?? []) {
      validateRange(result, record.file, item.range, `work item ${item.id} range`);
      for (const dependency of item.depends_on ?? []) {
        if (!workIds.has(dependency)) {
          result.errors.push(
            diagnostic(
              'error',
              'reference.work_item_missing',
              record.file,
              `work item ${item.id} depends on unknown work item ${dependency}`
            )
          );
        }
      }
    }
  }

  for (const record of validRecords('reasoning_responses')) {
    validateSnapshot(
      result,
      record.file,
      record.data.knowledge_snapshot,
      manifest,
      knowledgeIds,
      '/knowledge_snapshot'
    );
    if (record.data.retrieval_result_id) {
      const retrievalResult = retrievalResults.get(record.data.retrieval_result_id);
      if (!retrievalResult) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.retrieval_result_missing',
            record.file,
            `reasoning response names unknown retrieval result ${record.data.retrieval_result_id}`
          )
        );
      } else if (!hasSameSnapshotIdentity(
        record.data.knowledge_snapshot,
        retrievalResult.data.knowledge_snapshot
      )) {
        result.errors.push(
          diagnostic(
            'error',
            'reasoning.snapshot_mismatch',
            record.file,
            `reasoning snapshot differs from retrieval result ${record.data.retrieval_result_id}`
          )
        );
      }
    }
  }

  for (const record of validRecords('evaluation_cases')) {
    validateSnapshot(result, record.file, record.data.fixture, manifest, knowledgeIds, '/fixture');
    const dimensions = record.data.rubric?.dimensions ?? [];
    const total = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (Math.abs(total - 1) > 1e-9) {
      result.errors.push(
        diagnostic('error', 'evaluation.weights', record.file, `rubric dimension weights total ${total}; expected 1`)
      );
    }
    for (const name of uniqueValues(dimensions, (dimension) => dimension.name)) {
      result.errors.push(
        diagnostic('error', 'evaluation.dimension_duplicate', record.file, `rubric dimension ${name} is duplicated`)
      );
    }
    for (const evidenceId of record.data.expectations?.required_evidence_ids ?? []) {
      if (!evidenceLocations.has(evidenceId)) {
        result.errors.push(
          diagnostic(
            'error',
            'reference.evidence_missing',
            record.file,
            `evaluation case requires unknown evidence ${evidenceId}`
          )
        );
      }
    }
  }

  for (const record of validRecords('evaluation_results')) {
    const testCase = evaluationCases.get(record.data.case_id);
    if (!testCase) {
      result.errors.push(
        diagnostic('error', 'reference.evaluation_case_missing', record.file, `unknown case ${record.data.case_id}`)
      );
      continue;
    }
    if (record.data.case_version !== testCase.data.version) {
      result.errors.push(
        diagnostic(
          'error',
          'evaluation.case_version_mismatch',
          record.file,
          `result uses case version ${record.data.case_version}; expected ${testCase.data.version}`
        )
      );
    }
    validateSnapshot(
      result,
      record.file,
      record.data.knowledge_snapshot,
      manifest,
      knowledgeIds,
      '/knowledge_snapshot'
    );
    const hasFixtureSnapshot = hasSameSnapshotIdentity(
      record.data.knowledge_snapshot,
      testCase.data.fixture
    );
    if (!hasFixtureSnapshot) {
      result.errors.push(
        diagnostic(
          'error',
          'evaluation.snapshot_mismatch',
          record.file,
          `result snapshot differs from case fixture ${testCase.data.id}@${testCase.data.version}`
        )
      );
    }

    const expectedDimensions = testCase.data.rubric.dimensions;
    const expectedNames = new Set(expectedDimensions.map((dimension) => dimension.name));
    const resultNames = new Set(record.data.dimensions.map((dimension) => dimension.name));
    const duplicateDimensions = uniqueValues(record.data.dimensions, (dimension) => dimension.name);
    for (const name of duplicateDimensions) {
      result.errors.push(
        diagnostic('error', 'evaluation.dimension_duplicate', record.file, `result dimension ${name} is duplicated`)
      );
    }
    const unexpectedDimensions = [...resultNames].filter((name) => !expectedNames.has(name));
    for (const name of unexpectedDimensions) {
      result.errors.push(
        diagnostic(
          'error',
          'evaluation.dimension_unexpected',
          record.file,
          `result dimension ${name} is not present in the case rubric`
        )
      );
    }
    const missingDimensions = [];
    for (const dimension of expectedDimensions) {
      if (!resultNames.has(dimension.name)) {
        missingDimensions.push(dimension.name);
        result.errors.push(
          diagnostic(
            'error',
            'evaluation.dimension_missing',
            record.file,
            `result omits rubric dimension ${dimension.name}`
          )
        );
      }
    }

    const hasExactDimensions = duplicateDimensions.length === 0
      && unexpectedDimensions.length === 0
      && missingDimensions.length === 0;
    if (!hasFixtureSnapshot || !hasExactDimensions) continue;

    const scores = new Map(record.data.dimensions.map((dimension) => [dimension.name, dimension.score]));
    const calculated = expectedDimensions.reduce(
      (sum, dimension) => sum + scores.get(dimension.name) * dimension.weight,
      0
    );
    if (Math.abs(calculated - record.data.overall_score) > 0.001) {
      result.errors.push(
        diagnostic(
          'error',
          'evaluation.score_mismatch',
          record.file,
          `overall_score is ${record.data.overall_score}; weighted score is ${calculated}`
        )
      );
    }
    const expectedOutcome = calculated >= testCase.data.rubric.pass_threshold ? 'pass' : 'fail';
    if (record.data.outcome !== 'inconclusive' && record.data.outcome !== expectedOutcome) {
      result.errors.push(
        diagnostic(
          'error',
          'evaluation.outcome_mismatch',
          record.file,
          `outcome is ${record.data.outcome}; score and threshold imply ${expectedOutcome}`
        )
      );
    }
  }
}

export async function validateSchemas() {
  const { catalog } = await createSchemaValidator();
  return {
    valid: true,
    schema_count: catalog.length,
    schemas: catalog.map(({ filename, schema }) => ({ filename, id: schema.$id }))
  };
}

export async function validatePack(packPath, options = {}) {
  const result = {
    valid: false,
    pack: null,
    files_checked: 0,
    errors: [],
    warnings: []
  };

  let root;
  try {
    root = await fs.realpath(path.resolve(packPath));
    const stats = await fs.stat(root);
    if (!stats.isDirectory()) throw new Error('pack path is not a directory');
  } catch (error) {
    result.errors.push(diagnostic('error', 'pack.path_invalid', String(packPath), error.message));
    return result;
  }

  const manifestPath = await findManifest(root);
  if (!manifestPath) {
    result.errors.push(diagnostic('error', 'pack.manifest_missing', root, 'expected pack.yaml, pack.yml, or pack.json'));
    return result;
  }

  const { ajv } = await createSchemaValidator();
  let manifest;
  try {
    manifest = await loadStructuredFile(manifestPath);
  } catch (error) {
    result.errors.push(diagnostic('error', 'parse.invalid', relativeDisplay(root, manifestPath), error.message));
    return result;
  }

  const validateManifest = ajv.getSchema(schemaIds.pack);
  if (!validateManifest(manifest)) {
    addSchemaDiagnostics(result, relativeDisplay(root, manifestPath), validateManifest.errors);
    return result;
  }

  result.pack = { id: manifest.id, version: manifest.version, root };
  const discovered = await discoverFiles(root, manifest, result);
  const records = await loadRecords(root, discovered, ajv, result);
  result.files_checked = 1 + [...discovered.values()].reduce((sum, files) => sum + files.length, 0);

  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const strictFreshness = Boolean(options.strict || manifest.policies.freshness.strict_after_review_date);
  validateIntegrity(result, manifest, records, now, strictFreshness);
  await validateLocalEvidence(result, root, manifest, records);

  if (options.strict && result.warnings.length > 0) {
    result.errors.push(
      ...result.warnings.map((item) => ({
        ...item,
        severity: 'error',
        code: `strict.${item.code}`
      }))
    );
    result.warnings = [];
  }

  const diagnosticKey = (item) => `${item.path}\0${item.instance_path}\0${item.code}\0${item.message}`;
  result.errors.sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
  result.warnings.sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
  result.valid = result.errors.length === 0;
  return result;
}

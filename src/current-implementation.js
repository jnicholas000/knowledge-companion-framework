import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  discoverContentGroups,
  discoverRegularFiles,
  loadKnowledgeFile,
  loadStructuredFile
} from './formats.js';
import { validatePack } from './validator.js';

const manifestNames = Object.freeze(['pack.yaml', 'pack.yml', 'pack.json']);

export class CurrentImplementationError extends Error {
  constructor(code, message, validation = null) {
    super(message);
    this.name = 'CurrentImplementationError';
    this.code = code;
    this.validation = validation;
  }
}

function compareText(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function valueMatches(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && isDeepStrictEqual(actual, expected);
  }
  if (expected !== null && typeof expected === 'object') {
    if (Array.isArray(actual)) return actual.some((candidate) => valueMatches(candidate, expected));
    if (actual === null || typeof actual !== 'object') return false;
    const entries = Object.entries(expected);
    if (entries.length === 0) return false;
    return entries.every(([key, value]) => (
      Object.prototype.hasOwnProperty.call(actual, key) && valueMatches(actual[key], value)
    ));
  }
  return actual === expected;
}

function applicationIsReflected(candidate, record, changes = candidate.proposed_changes ?? []) {
  if (candidate.application?.record_id !== record.id || changes.length === 0) return false;

  const recordEvidenceById = new Map((record.evidence ?? []).map((item) => [item.id, item]));
  const candidateEvidenceById = new Map((candidate.evidence ?? []).map((item) => [item.id, item]));

  return changes.every((change) => {
    const evidenceRefs = change.evidence_refs ?? [];
    if (evidenceRefs.length === 0 || !evidenceRefs.every((id) => {
      const expected = candidateEvidenceById.get(id);
      const actual = recordEvidenceById.get(id);
      return expected && actual
        && actual.source_id === expected.source_id
        && actual.kind === expected.kind
        && actual.locator === expected.locator
        && actual.revision === expected.revision
        && (expected.digest === undefined || actual.digest === expected.digest);
    })) return false;

    const fieldPath = change.field.split('.');
    let current = record;
    for (const part of fieldPath) {
      if (current === null || typeof current !== 'object'
        || !Object.prototype.hasOwnProperty.call(current, part)) return false;
      current = current[part];
    }
    return current !== undefined && valueMatches(current, change.after);
  });
}

async function findManifest(root) {
  for (const name of manifestNames) {
    const filePath = path.join(root, name);
    try {
      if ((await fs.stat(filePath)).isFile()) return filePath;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new CurrentImplementationError('pack.manifest_missing', 'The validated pack manifest could not be found.');
}

async function resolveOutputTarget(packRoot, outputPath) {
  if (typeof outputPath !== 'string' || outputPath.trim() === '') {
    throw new CurrentImplementationError('output.required', 'Provide an explicit output path outside the application pack.');
  }

  const absolutePath = path.resolve(outputPath);
  let parent;
  try {
    parent = await fs.realpath(path.dirname(absolutePath));
  } catch (error) {
    throw new CurrentImplementationError('output.parent_invalid', `Output parent directory is unavailable: ${error.message}`);
  }

  const targetPath = path.join(parent, path.basename(absolutePath));
  const relative = path.relative(packRoot, targetPath);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new CurrentImplementationError('output.inside_pack', 'Output path must be outside the application pack.');
  }

  try {
    const stats = await fs.lstat(targetPath);
    if (stats.isSymbolicLink()) {
      throw new CurrentImplementationError('output.symlink', 'Output path must not be a symbolic link.');
    }
    if (!stats.isFile()) {
      throw new CurrentImplementationError('output.not_file', 'An existing output path must be a regular file.');
    }
  } catch (error) {
    if (error instanceof CurrentImplementationError) throw error;
    if (error.code !== 'ENOENT') {
      throw new CurrentImplementationError('output.unavailable', `Output path cannot be inspected: ${error.message}`);
    }
  }

  return targetPath;
}

function markdownText(value) {
  const specialCharacters = new Set('\\`*_{}[]<>#+-.!|~():@');
  return [...String(value)].map((character) => (
    specialCharacters.has(character) ? `\\${character}` : character
  )).join('');
}

function markdownCode(value) {
  const text = String(value).replace(/[\r\n\t]+/g, ' ');
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const delimiter = '`'.repeat(longestRun + 1);
  const padding = /^[ `]|[ `]$/.test(text) ? ' ' : '';
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function markdownLink(label, target, allowRelative = false) {
  let safeTarget;
  if (allowRelative) {
    safeTarget = String(target).split('/').map((segment) => encodeURIComponent(segment)).join('/');
  } else {
    let url;
    try {
      url = new URL(String(target));
    } catch {
      return markdownText(label);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return markdownText(label);
    safeTarget = encodeURI(url.href);
  }
  safeTarget = safeTarget.replaceAll('<', '%3C').replaceAll('>', '%3E');
  return `[${markdownText(label)}](<${safeTarget}>)`;
}

function evidenceTarget(source, evidence, root, outputDirectory) {
  if (source.kind === 'local') {
    const sourceRoot = path.resolve(root, source.root);
    const evidencePath = path.resolve(sourceRoot, ...evidence.locator.split('/'));
    return path.relative(outputDirectory, evidencePath).split(path.sep).join('/');
  }
  return source.uri;
}

function latestAppliedProposalsByField(candidates) {
  const proposalsByField = new Map();
  for (const candidate of candidates) {
    if (candidate.state !== 'applied') continue;
    const appliedAt = Date.parse(candidate.application?.applied_at ?? '');
    for (const change of candidate.proposed_changes ?? []) {
      const proposals = proposalsByField.get(change.field) ?? [];
      proposals.push({ candidate, change, appliedAt });
      proposalsByField.set(change.field, proposals);
    }
  }

  const latestByField = new Map();
  for (const [field, proposals] of proposalsByField) {
    if (proposals.some(({ appliedAt }) => !Number.isFinite(appliedAt))) {
      latestByField.set(field, { tied: true, proposals });
      continue;
    }
    const latestAt = Math.max(...proposals.map(({ appliedAt }) => appliedAt));
    const latest = proposals.filter(({ appliedAt }) => appliedAt === latestAt);
    latestByField.set(field, { tied: latest.length !== 1, proposals: latest });
  }
  return latestByField;
}

function buildPendingReasons(impacts, candidates, knowledgeById) {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const updatesByKnowledgeId = new Map();

  for (const impact of impacts) {
    if (impact.classification !== 'knowledge_update_required') continue;
    for (const knowledgeId of impact.affected_knowledge_ids) {
      const targetedCandidates = impact.candidate_ids
        .map((candidateId) => candidatesById.get(candidateId))
        .filter((candidate) => candidate?.target?.record_id === knowledgeId)
        .sort((left, right) => compareText(left.id, right.id));
      const update = updatesByKnowledgeId.get(knowledgeId) ?? {
        candidatesById: new Map(),
        impacts: []
      };
      update.impacts.push({ impact, targetedCandidates });
      for (const candidate of targetedCandidates) update.candidatesById.set(candidate.id, candidate);
      updatesByKnowledgeId.set(knowledgeId, update);
    }
  }

  const pendingByKnowledgeId = new Map();
  for (const [knowledgeId, update] of updatesByKnowledgeId) {
    const record = knowledgeById.get(knowledgeId);
    const allCandidates = [...update.candidatesById.values()];
    const latestByField = latestAppliedProposalsByField(allCandidates);

    for (const { impact, targetedCandidates } of update.impacts) {
      const states = [];
      const pendingCandidateIds = new Set();
      if (targetedCandidates.length === 0) {
        states.push('no linked candidate targets this affected record');
      }
      for (const candidate of targetedCandidates) {
        if (candidate.state !== 'applied') {
          states.push(`${candidate.id}: ${candidate.state}`);
          pendingCandidateIds.add(candidate.id);
          continue;
        }
        if (!record) {
          states.push(`${candidate.id}: applied, but the target record is unavailable`);
          pendingCandidateIds.add(candidate.id);
          continue;
        }

        const currentChanges = [];
        const ambiguousFields = [];
        for (const change of candidate.proposed_changes ?? []) {
          const latest = latestByField.get(change.field);
          if (!latest) {
            ambiguousFields.push(change.field);
          } else if (latest.tied) {
            if (latest.proposals.some((proposal) => (
              proposal.candidate.id === candidate.id && proposal.change === change
            ))) ambiguousFields.push(change.field);
          } else if (
            latest.proposals[0].candidate.id === candidate.id
            && latest.proposals[0].change === change
          ) {
            currentChanges.push(change);
          }
        }

        const isReflected = currentChanges.length === 0
          || applicationIsReflected(candidate, record, currentChanges);
        if (ambiguousFields.length > 0) {
          states.push(`${candidate.id}: applied_at is tied for field(s) ${ambiguousFields.sort(compareText).join(', ')}`);
          pendingCandidateIds.add(candidate.id);
        } else if (!isReflected) {
          states.push(`${candidate.id}: applied, but proposed evidence or changes are absent from the accepted record`);
          pendingCandidateIds.add(candidate.id);
        }
      }

      if (states.length === 0) continue;
      const pending = {
        impactId: impact.id,
        candidateIds: [...pendingCandidateIds].sort(compareText),
        states
      };
      const items = pendingByKnowledgeId.get(knowledgeId) ?? [];
      items.push(pending);
      pendingByKnowledgeId.set(knowledgeId, items);
    }
  }

  return pendingByKnowledgeId;
}

function buildFreshnessReasons(validation, knowledgeRecords) {
  const fileToRecord = new Map(knowledgeRecords.map((record) => [record.file, record.data]));
  const pendingByKnowledgeId = new Map();
  for (const warning of validation.warnings) {
    if (warning.code !== 'freshness.review_due') continue;
    const record = fileToRecord.get(warning.path);
    if (!record) continue;
    pendingByKnowledgeId.set(record.id, [{ freshness: warning.message }]);
  }
  return pendingByKnowledgeId;
}

function renderEvidence(evidence, sources, root, outputDirectory) {
  return evidence
    .slice()
    .sort((left, right) => compareText(left.id, right.id))
    .map((item) => {
      const source = sources.get(item.source_id);
      const target = evidenceTarget(source, item, root, outputDirectory);
      const sourceLink = markdownLink(item.source_id, target, source.kind === 'local');
      const revision = item.revision ? ` · revision ${markdownCode(item.revision)}` : '';
      const observed = item.observed_at ? ` · observed ${markdownCode(item.observed_at)}` : '';
      return `- ${markdownLink(item.id, target, source.kind === 'local')} — ${sourceLink} · locator ${markdownCode(item.locator)}${revision}${observed}. ${markdownText(item.description)}`;
    });
}

function renderClaims(claims) {
  return claims
    .slice()
    .sort((left, right) => compareText(left.id, right.id))
    .map((claim) => {
      const evidence = claim.evidence_refs.length > 0
        ? `; evidence: ${claim.evidence_refs.map((id) => `\`${id}\``).join(', ')}`
        : '; no linked evidence';
      return `- **${claim.epistemic_status} · ${claim.confidence} confidence** — ${markdownText(claim.statement)} (\`${claim.id}\`${evidence})`;
    });
}

function renderPending(pending) {
  return pending
    .slice()
    .sort((left, right) => compareText(left.impactId ?? '', right.impactId ?? ''))
    .map((item) => {
      if (item.freshness) return `- **Pending re-verification:** ${markdownText(item.freshness)}`;
      const detail = item.candidateIds.length > 0
        ? `candidates requiring reconciliation: ${item.states.map((state) => `\`${state}\``).join(', ')}`
        : item.states[0];
      return `- **Pending re-verification** for impact \`${item.impactId}\`; ${detail}.`;
    });
}

function formatValidationNote(warning) {
  return `- ${markdownCode(warning.path)} — ${markdownText(warning.message)} (${markdownCode(warning.code)})`;
}

export async function renderCurrentImplementation(packPath, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const validation = await validatePack(packPath, { now });
  if (!validation.valid) {
    throw new CurrentImplementationError(
      'pack.invalid',
      `Pack ${validation.pack?.id ?? packPath} failed validation; no view was generated.`,
      validation
    );
  }

  const root = validation.pack.root;
  const outputPath = await resolveOutputTarget(root, options.outputPath);
  const manifest = await loadStructuredFile(await findManifest(root));
  const allFiles = await discoverRegularFiles(root);
  const relativeFiles = allFiles.map((filePath) => relativePath(root, filePath));
  const fileByRelative = new Map(allFiles.map((filePath) => [relativePath(root, filePath), filePath]));
  const grouped = discoverContentGroups(manifest, relativeFiles).discovered;

  const knowledgeRecords = [];
  for (const file of grouped.get('knowledge') ?? []) {
    const absolutePath = fileByRelative.get(file);
    const loaded = await loadKnowledgeFile(absolutePath);
    knowledgeRecords.push({ file, ...loaded });
  }

  const structuredRecords = async (group) => Promise.all(
    (grouped.get(group) ?? []).map((file) => loadStructuredFile(fileByRelative.get(file)))
  );
  const impacts = await structuredRecords('impacts');
  const candidates = await structuredRecords('candidates');
  const acceptedRecords = knowledgeRecords
    .filter(({ data }) => data.status === 'accepted')
    .sort((left, right) => compareText(left.data.id, right.data.id));

  const impactPending = buildPendingReasons(
    impacts,
    candidates,
    new Map(knowledgeRecords.map(({ data }) => [data.id, data]))
  );
  const freshnessPending = buildFreshnessReasons(validation, knowledgeRecords);
  const sources = new Map(manifest.sources.map((source) => [source.id, source]));
  const outputDirectory = path.dirname(outputPath);
  const sections = [
    '# Current Implementation',
    '',
    `Pack: \`${validation.pack.id}@${validation.pack.version}\``,
    `Assessed as of UTC date: \`${now.toISOString().slice(0, 10)}\``,
    '',
    '> This file is a derived view of validated, accepted pack knowledge. The pack and its cited',
    '> source evidence remain authoritative. Claim status, evidence revisions, and review state are',
    '> preserved here; generation does not verify the underlying claims.',
    '',
    '## Snapshot',
    '',
    `- Accepted knowledge records: ${acceptedRecords.length}`,
    `- Records pending re-verification: ${acceptedRecords.filter(({ data }) => impactPending.has(data.id) || freshnessPending.has(data.id)).length}`,
    `- Pack validation: passed${validation.warnings.length > 0 ? ` with ${validation.warnings.length} warning(s)` : ''}`,
    '',
    '## Accepted Implementation',
    ''
  ];

  for (const { file, data, body } of acceptedRecords) {
    const pending = [
      ...(impactPending.get(data.id) ?? []),
      ...(freshnessPending.get(data.id) ?? [])
    ];
    sections.push(
      `### ${markdownText(data.title)}`,
      '',
      `${markdownCode(data.id)} · kind ${markdownCode(data.kind)} · areas: ${data.knowledge_areas.map((area) => markdownCode(area)).join(', ')}`,
      '',
      `**Summary:** ${markdownText(data.summary)}`,
      '',
      `**Record:** ${markdownCode(file)} · **last verified:** ${markdownCode(data.freshness.last_verified_at)} · **review after:** ${markdownCode(data.freshness.review_after)}`,
      ''
    );
    if (pending.length > 0) sections.push('#### Review state', '', ...renderPending(pending), '');
    sections.push('#### Record narrative', '', markdownText(body), '', '#### Claims', '', ...renderClaims(data.claims), '', '#### Evidence', '');
    const evidenceLines = renderEvidence(data.evidence, sources, root, outputDirectory);
    sections.push(...(evidenceLines.length > 0 ? evidenceLines : ['- No evidence records are attached.']), '');
  }

  if (acceptedRecords.length === 0) {
    sections.push('No accepted knowledge records are available in this pack.', '');
  }

  const unresolved = acceptedRecords.flatMap(({ data }) => data.claims
    .filter((claim) => claim.epistemic_status === 'uncertainty')
    .map((claim) => ({ record: data, claim })))
    .sort((left, right) => compareText(left.claim.id, right.claim.id));
  sections.push('## Unresolved Questions And Uncertainties', '');
  if (unresolved.length === 0) {
    sections.push('No accepted claims are explicitly marked as uncertainty.', '');
  } else {
    sections.push(...unresolved.map(({ record, claim }) => `- **${markdownText(record.title)}** — ${markdownText(claim.statement)} (\`${claim.id}\`)`), '');
  }

  if (validation.warnings.length > 0) {
    sections.push('## Validation Notes', '', ...validation.warnings.map(formatValidationNote), '');
  }

  return {
    markdown: `${sections.join('\n').trimEnd()}\n`,
    outputPath,
    pack: validation.pack,
    acceptedRecordCount: acceptedRecords.length,
    pendingRecordCount: acceptedRecords.filter(({ data }) => impactPending.has(data.id) || freshnessPending.has(data.id)).length,
    validation
  };
}

export async function writeCurrentImplementation(packPath, options = {}) {
  const rendered = await renderCurrentImplementation(packPath, options);
  const targetPath = rendered.outputPath;
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`
  );

  try {
    await fs.writeFile(temporaryPath, rendered.markdown, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new CurrentImplementationError('output.write_failed', `Could not write current-implementation view: ${error.message}`);
  }

  return {
    outputPath: targetPath,
    pack: rendered.pack,
    acceptedRecordCount: rendered.acceptedRecordCount,
    pendingRecordCount: rendered.pendingRecordCount,
    warnings: rendered.validation.warnings
  };
}

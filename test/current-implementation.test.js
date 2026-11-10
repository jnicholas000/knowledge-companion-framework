import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { stringify } from 'yaml';

import {
  CurrentImplementationError,
  renderCurrentImplementation,
  writeCurrentImplementation
} from '../src/current-implementation.js';
import { validatePack } from '../src/validator.js';

const assessedAt = new Date('2026-11-02T16:00:00.000Z');
const markdownEscapedCharacters = new Set('\\`*_{}[]<>#+-.!|~():@');
function escapeMarkdownText(value) {
  return [...String(value)].map((character) => (
    markdownEscapedCharacters.has(character) ? `\\${character}` : character
  )).join('');
}

const ids = Object.freeze({
  knowledge: 'test.current-implementation.accepted',
  draft: 'test.current-implementation.draft',
  deprecated: 'test.current-implementation.deprecated',
  superseded: 'test.current-implementation.superseded',
  evidence: 'test.current-implementation.accepted.evidence.source',
  impact: 'test.current-implementation.impact.changed',
  candidate: 'test.current-implementation.candidate.changed'
});

function provenance() {
  return {
    created_at: '2026-11-02T15:00:00Z',
    created_by: { id: 'test.owner', type: 'human' },
    last_modified_at: '2026-11-02T15:00:00Z',
    last_modified_by: { id: 'test.owner', type: 'human' }
  };
}

function makeKnowledge({
  status = 'accepted',
  updated = false,
  unsafeMarkdown = false,
  evidenceDigest,
  summary,
  title,
  id = ids.knowledge
} = {}) {
  const revision = updated ? 'source-revision-2' : 'source-revision-1';
  const evidenceId = `${id}.evidence.source`;
  const record = {
    schema_version: '1.0',
    id,
    title: unsafeMarkdown
      ? '# Injected [title](https://example.invalid)'
      : title ?? (status === 'accepted' ? 'Accepted system behavior' : `${status[0].toUpperCase()}${status.slice(1)} record`),
    kind: 'architecture',
    knowledge_areas: ['architecture', 'code'],
    summary: unsafeMarkdown
      ? 'A summary line.\n\n## Injected heading'
      : summary ?? (updated
        ? 'The accepted record reflects the reviewed source update and its replacement behavior.'
        : 'The accepted record describes a bounded system behavior from one exact source revision.'),
    status,
    owners: ['test.owner'],
    tags: ['current-implementation'],
    applies_to: ['src/index.js'],
    evidence: [{
      id: evidenceId,
      source_id: 'test.current-implementation.repository',
      kind: 'source_file',
      locator: unsafeMarkdown ? 'src/index.js\n\n## Injected evidence heading `marker`' : 'src/index.js',
      observed_at: updated ? '2026-11-02T15:30:00Z' : '2026-11-02T15:00:00Z',
      revision: unsafeMarkdown ? 'source-revision-1`\n## Injected revision heading' : revision,
      ...(evidenceDigest === undefined ? {} : { digest: evidenceDigest }),
      description: 'The exact source file contains the accepted behavior described by this record.'
    }, ...(updated ? [{
      id: 'test.current-implementation.evidence.changed-source',
      source_id: 'test.current-implementation.repository',
      kind: 'source_file',
      locator: 'src/index.js',
      observed_at: '2026-11-02T15:30:00Z',
      revision: 'source-revision-2',
      ...(evidenceDigest === undefined ? {} : { digest: evidenceDigest }),
      description: 'The changed source supports the reviewed replacement claim.'
    }] : [])],
    claims: [
      {
        id: `${id}.claim.verified`,
        statement: unsafeMarkdown
          ? 'The service reads this.\n\n- [injected](https://example.invalid)'
          : updated ? 'The service reads the new source configuration.' : 'The service reads its source configuration.',
        epistemic_status: 'verified_fact',
        confidence: 'high',
        evidence_refs: updated ? [evidenceId, 'test.current-implementation.evidence.changed-source'] : [evidenceId]
      },
      {
        id: `${id}.claim.inference`,
        statement: 'The configuration boundary appears to support a separate consumer.',
        epistemic_status: 'inference',
        confidence: 'medium',
        evidence_refs: [evidenceId]
      },
      {
        id: `${id}.claim.historical`,
        statement: 'The earlier configuration format was used before this revision.',
        epistemic_status: 'historical_knowledge',
        confidence: 'medium',
        evidence_refs: [evidenceId]
      },
      {
        id: `${id}.claim.unknown`,
        statement: 'Does the service retry after the remote source is unavailable?',
        epistemic_status: 'uncertainty',
        confidence: 'low',
        evidence_refs: []
      }
    ],
    relationships: status === 'superseded' ? [{
      type: 'superseded_by',
      target_kind: 'knowledge',
      target: ids.knowledge,
      rationale: 'A newer accepted record replaced this historical record.'
    }] : [],
    freshness: {
      last_verified_at: updated ? '2026-11-02T15:30:00Z' : '2026-11-02T15:00:00Z',
      review_after: '2027-01-01',
      invalidation_triggers: [{
        type: 'manual',
        value: 'review-synthetic-record',
        description: 'Recheck this synthetic record when its fixture changes.'
      }]
    },
    provenance: provenance()
  };
  return unsafeMarkdown
    ? `---\n${stringify(record)}---\n\n# Injected narrative heading\n\n[Injected link](https://example.invalid)\n`
    : `---\n${stringify(record)}---\n\n# Accepted record narrative\n\nThis prose is preserved from the accepted record.\n`;
}

function makeImpact(affectedKnowledgeIds = [ids.knowledge]) {
  return {
    schema_version: '1.0',
    id: ids.impact,
    change: {
      id: 'test-change-2',
      base_revision: 'source-revision-1',
      head_revision: 'source-revision-2',
      changed_paths: ['src/index.js'],
      observed_at: '2026-11-02T15:30:00Z',
      limitations: []
    },
    classification: 'knowledge_update_required',
    rationale: 'This source change requires a reviewed update to the accepted system behavior record.',
    affected_knowledge_ids: affectedKnowledgeIds,
    candidate_ids: [ids.candidate],
    declared_at: '2026-11-02T15:35:00Z',
    declared_by: { id: 'test.owner', type: 'human' }
  };
}

function makeCandidate({
  applied = false,
  id = ids.candidate,
  field = 'claims',
  after,
  appliedAt = '2026-11-02T15:50:00Z',
  evidenceDigest
} = {}) {
  const reviewHistory = [{
    from: 'proposed',
    to: 'triaged',
    actor: { id: 'test.reviewer', type: 'human' },
    authorization: {
      policy_ref: 'test.current-implementation.review-policy',
      verified_at: '2026-11-02T15:40:00Z',
      verified_by: { id: 'test.owner', type: 'human' }
    },
    at: '2026-11-02T15:40:00Z',
    rationale: 'The target and supporting evidence are clear and ready for reviewer approval.',
    content_digest: 'sha256:123456'
  }];
  const candidate = {
    schema_version: '1.0',
    id,
    impact_id: ids.impact,
    target: {
      operation: 'update',
      record_id: ids.knowledge,
      expected_revision: 'source-revision-1'
    },
    classification: {
      type: 'fact_changed',
      review_requirement: 'interpretive',
      reason: 'The source behavior changed and the accepted record needs a reviewed update.'
    },
    confidence: 'high',
    evidence: [{
      id: 'test.current-implementation.evidence.changed-source',
      source_id: 'test.current-implementation.repository',
      kind: 'source_file',
      locator: 'src/index.js',
      observed_at: '2026-11-02T15:30:00Z',
      revision: 'source-revision-2',
      ...(evidenceDigest === undefined ? {} : { digest: evidenceDigest }),
      description: 'The changed source supports the proposed replacement claim.'
    }],
    proposed_changes: [{
      field,
      after: after ?? {
        statement: 'The service reads the new source configuration.',
        epistemic_status: 'verified_fact',
        confidence: 'high'
      },
      rationale: 'This change keeps the accepted record aligned with the reviewed source behavior.',
      evidence_refs: ['test.current-implementation.evidence.changed-source']
    }],
    state: applied ? 'applied' : 'triaged',
    review_history: reviewHistory,
    provenance: provenance()
  };

  if (applied) {
    for (const [from, to] of [['triaged', 'approved'], ['approved', 'applied']]) {
      reviewHistory.push({
        from,
        to,
        actor: { id: 'test.reviewer', type: 'human' },
        authorization: {
          policy_ref: 'test.current-implementation.review-policy',
          verified_at: appliedAt,
          verified_by: { id: 'test.owner', type: 'human' }
        },
        at: appliedAt,
        rationale: 'The reviewed candidate was applied to the accepted knowledge record.',
        content_digest: `sha256:${from === 'triaged' ? '234567' : '345678'}`
      });
    }
    candidate.application = {
      record_id: ids.knowledge,
      revision: 'source-revision-2',
      applied_at: appliedAt,
      applied_by: { id: 'test.owner', type: 'human' }
    };
  }
  return candidate;
}

async function createFixture({
  includeImpact = false,
  applied = false,
  includeSecondAffected = false,
  reflectApplied = true
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-current-implementation-'));
  const packRoot = path.join(root, 'pack');
  const outputRoot = path.join(root, 'generated');
  await fs.mkdir(path.join(packRoot, 'knowledge'), { recursive: true });
  await fs.mkdir(path.join(packRoot, 'sources'), { recursive: true });
  await fs.mkdir(path.join(packRoot, 'learning', 'impacts'), { recursive: true });
  await fs.mkdir(path.join(packRoot, 'learning', 'candidates'), { recursive: true });
  await fs.mkdir(outputRoot);

  const manifest = {
    schema_version: '1.0',
    id: 'test.current-implementation',
    name: 'Current Implementation Test Pack',
    version: '0.1.0',
    description: 'Synthetic pack used to verify the generic current implementation projection.',
    framework_compatibility: '^0.1',
    owners: ['test.owner'],
    sources: [{
      id: 'test.current-implementation.repository',
      kind: 'git',
      uri: 'https://github.com/example/system',
      description: 'Synthetic source repository for renderer behavior tests.'
    }],
    content: {
      knowledge: ['knowledge/**/*.md'],
      retrieval_requests: [],
      retrieval_results: [],
      impacts: ['learning/impacts/**/*.json'],
      candidates: ['learning/candidates/**/*.json'],
      estimates: [],
      evaluation_cases: [],
      evaluation_results: [],
      reasoning_responses: []
    },
    policies: {
      freshness: { default_review_interval_days: 180, strict_after_review_date: false },
      evidence: { require_local_sources_to_exist: false }
    },
    provenance: provenance()
  };

  await fs.writeFile(path.join(packRoot, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(packRoot, 'knowledge', 'accepted.md'), makeKnowledge());
  if (includeSecondAffected) {
    await fs.writeFile(path.join(packRoot, 'knowledge', 'second-affected.md'), makeKnowledge({ id: 'test.current-implementation.second-affected' }));
  }
  await fs.writeFile(path.join(packRoot, 'knowledge', 'draft.md'), makeKnowledge({ status: 'draft', id: ids.draft }));
  await fs.writeFile(path.join(packRoot, 'knowledge', 'deprecated.md'), makeKnowledge({ status: 'deprecated', id: ids.deprecated }));
  await fs.writeFile(path.join(packRoot, 'knowledge', 'superseded.md'), makeKnowledge({ status: 'superseded', id: ids.superseded }));
  await fs.writeFile(path.join(packRoot, 'sources', 'index.js'), 'export const config = {};\n');
  if (includeImpact) {
    const affectedKnowledgeIds = includeSecondAffected
      ? [ids.knowledge, 'test.current-implementation.second-affected']
      : [ids.knowledge];
    await fs.writeFile(path.join(packRoot, 'learning', 'impacts', 'changed.json'), `${JSON.stringify(makeImpact(affectedKnowledgeIds), null, 2)}\n`);
    await fs.writeFile(path.join(packRoot, 'learning', 'candidates', 'changed.json'), `${JSON.stringify(makeCandidate({ applied }), null, 2)}\n`);
    if (applied && reflectApplied) {
      await fs.writeFile(path.join(packRoot, 'knowledge', 'accepted.md'), makeKnowledge({ updated: true }));
    }
  }

  const validation = await validatePack(packRoot, { now: assessedAt });
  assert.equal(validation.valid, true, `Synthetic pack fixture is invalid: ${JSON.stringify(validation.errors, null, 2)}`);

  return { root, packRoot, outputRoot, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

async function replaceCandidateSet(fixture, candidates) {
  const impactPath = path.join(fixture.packRoot, 'learning', 'impacts', 'changed.json');
  const impact = JSON.parse(await fs.readFile(impactPath, 'utf8'));
  impact.candidate_ids = candidates.map((candidate) => candidate.id);
  await fs.writeFile(impactPath, `${JSON.stringify(impact, null, 2)}\n`);

  const candidateDirectory = path.join(fixture.packRoot, 'learning', 'candidates');
  for (const filename of await fs.readdir(candidateDirectory)) {
    await fs.rm(path.join(candidateDirectory, filename), { force: true });
  }
  for (const [index, candidate] of candidates.entries()) {
    await fs.writeFile(
      path.join(candidateDirectory, `${String(index + 1).padStart(2, '0')}.json`),
      `${JSON.stringify(candidate, null, 2)}\n`
    );
  }
}

function setProposalChanges(candidate, changes) {
  const template = candidate.proposed_changes[0];
  candidate.proposed_changes = changes.map(({ field, after }) => ({
    ...template,
    field,
    after
  }));
  return candidate;
}

test('renders accepted knowledge deterministically with source revisions and epistemic labels', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const first = await renderCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });
  const second = await renderCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });

  assert.equal(first.markdown, second.markdown);
  assert.match(first.markdown, /test\.current-implementation@0\.1\.0/);
  assert.match(first.markdown, /\*\*verified_fact · high confidence\*\*/);
  assert.match(first.markdown, /\*\*inference · medium confidence\*\*/);
  assert.match(first.markdown, /\*\*historical_knowledge · medium confidence\*\*/);
  assert.match(first.markdown, /## Unresolved Questions And Uncertainties/);
  assert.match(first.markdown, /Does the service retry after the remote source is unavailable\?/);
  assert.ok(first.markdown.includes(`[${escapeMarkdownText(ids.evidence)}]`));
  assert.match(first.markdown, /https:\/\/github\.com\/example\/system/);
  assert.match(first.markdown, /locator `src\/index\.js`/);
  assert.match(first.markdown, /revision `source-revision-1`/);
  assert.doesNotMatch(first.markdown, /Draft record|Deprecated record|Superseded record|test\.current-implementation\.(draft|deprecated|superseded)/);
  assert.equal(first.acceptedRecordCount, 1);
  assert.equal(first.pendingRecordCount, 0);
});

test('escapes source-authored Markdown so it cannot create renderer sections or links', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const knowledgePath = path.join(fixture.packRoot, 'knowledge', 'accepted.md');
  await fs.writeFile(knowledgePath, makeKnowledge({ unsafeMarkdown: true }));
  const hostileFilename = 'accepted`\n## Injected filename.md';
  await fs.rename(knowledgePath, path.join(fixture.packRoot, 'knowledge', hostileFilename));
  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.ok(result.markdown.includes('\\# Injected \\[title\\]\\(https\\://example\\.invalid\\)'));
  assert.match(result.markdown, /\\#\\# Injected heading/);
  assert.ok(result.markdown.includes('\\- \\[injected\\]\\(https\\://example\\.invalid\\)'));
  assert.match(result.markdown, /\\# Injected narrative heading/);
  assert.ok(result.markdown.includes('``knowledge/accepted` ## Injected filename.md``'));
  assert.match(result.markdown, /``\s*src\/index\.js\s+## Injected evidence heading `marker`\s*``/);
  assert.ok(result.markdown.includes('``source-revision-1` ## Injected revision heading``'));
  assert.doesNotMatch(result.markdown, /\n## Injected (heading|evidence|revision)|\n- \[injected\]\(/);
});

test('renders unsupported source URI schemes as plain text', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const manifestPath = path.join(fixture.packRoot, 'pack.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.sources[0].uri = 'javascript:alert(1)';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.ok(result.markdown.includes(escapeMarkdownText('test.current-implementation.repository')));
  assert.doesNotMatch(result.markdown, /\]\(<javascript:/i);
});

test('CLI writes the projection to an explicit external path with a reproducible assessment date', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [
    cliPath,
    'current-implementation',
    fixture.packRoot,
    '--output',
    outputPath,
    '--as-of',
    '2026-11-02'
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 accepted record\(s\), 0 pending re-verification/);
  assert.match(await fs.readFile(outputPath, 'utf8'), /Assessed as of UTC date: `2026-11-02`/);
});

test('CLI requires one pack and rejects unknown or malformed options', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const cases = [
    { args: ['current-implementation', '--output', outputPath], message: /exactly one application pack path/ },
    { args: ['current-implementation', fixture.packRoot, fixture.packRoot, '--output', outputPath], message: /exactly one application pack path/ },
    { args: ['current-implementation', fixture.packRoot, '--output', outputPath, '--surprise'], message: /Unknown option: --surprise/ },
    { args: ['current-implementation', fixture.packRoot, '--output', outputPath, '--as-of', '2026-02-30'], message: /valid calendar date/ }
  ];

  for (const { args, message } of cases) {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  }
  await assert.rejects(fs.access(outputPath));
});

test('marks required knowledge updates pending, then clears them after reviewed application and refresh', async (t) => {
  const fixture = await createFixture({ includeImpact: true });
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const knowledgePath = path.join(fixture.packRoot, 'knowledge', 'accepted.md');
  const packBytesBeforeRender = await fs.readFile(knowledgePath);
  const pending = await writeCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });
  const pendingView = await fs.readFile(outputPath, 'utf8');
  assert.deepEqual(await fs.readFile(knowledgePath), packBytesBeforeRender);
  assert.equal(pending.pendingRecordCount, 1);
  assert.match(pendingView, /Pending re-verification/);
  assert.match(pendingView, new RegExp(ids.candidate.replaceAll('.', '\\.')));

  const acceptedPath = path.join(fixture.packRoot, 'knowledge', 'accepted.md');
  await fs.writeFile(acceptedPath, makeKnowledge({ updated: true }));
  const candidatePath = path.join(fixture.packRoot, 'learning', 'candidates', 'changed.json');
  await fs.writeFile(candidatePath, `${JSON.stringify(makeCandidate({ applied: true }), null, 2)}\n`);
  const refreshed = await writeCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });
  const refreshedView = await fs.readFile(outputPath, 'utf8');

  assert.equal(refreshed.pendingRecordCount, 0);
  assert.ok(refreshedView.includes(escapeMarkdownText('The service reads the new source configuration.')));
  assert.match(refreshedView, /revision `source-revision-2`/);
  assert.doesNotMatch(refreshedView, /Pending re-verification/);
});

test('keeps each affected record pending until a candidate targeting that record is applied', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, includeSecondAffected: true });
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const result = await renderCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });
  const [firstRecord, secondRecord] = result.markdown.split('### Accepted system behavior').slice(1);

  assert.equal(result.acceptedRecordCount, 2);
  assert.equal(result.pendingRecordCount, 1);
  assert.match(firstRecord, /`test\.current-implementation\.accepted`/);
  assert.doesNotMatch(firstRecord, /Pending re-verification/);
  assert.match(secondRecord, /`test\.current-implementation\.second-affected`/);
  assert.match(secondRecord, /Pending re-verification/);
  assert.match(secondRecord, /no linked candidate targets this affected record/);
});

test('keeps an applied candidate pending when its evidence and proposed change are absent from the accepted record', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const result = await renderCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt });

  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /applied, but proposed evidence or changes are absent from the accepted record/);
  assert.ok(result.markdown.includes(escapeMarkdownText('The service reads its source configuration.')));
  assert.doesNotMatch(result.markdown, /The service reads the new source configuration\./);
});

test('does not treat empty or inherited values as proof that an applied proposal was reflected', async (t) => {
  for (const { field, after } of [
    { field: 'claims', after: {} },
    { field: 'claims', after: [] },
    { field: '__proto__', after: {} },
    { field: 'claims.__proto__', after: {} }
  ]) {
    const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
    t.after(fixture.cleanup);
    const candidatePath = path.join(fixture.packRoot, 'learning', 'candidates', 'changed.json');
    const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
    candidate.proposed_changes[0].field = field;
    candidate.proposed_changes[0].after = after;
    await fs.writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

    const result = await renderCurrentImplementation(fixture.packRoot, {
      outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
      now: assessedAt
    });
    assert.equal(result.pendingRecordCount, 1, `${field} ${JSON.stringify(after)} must remain pending`);
    assert.match(result.markdown, /applied, but proposed evidence or changes are absent from the accepted record/);
  }
});

test('requires proposed arrays to match the accepted array value exactly', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const candidatePath = path.join(fixture.packRoot, 'learning', 'candidates', 'changed.json');
  const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
  candidate.proposed_changes[0].after = [candidate.proposed_changes[0].after];
  await fs.writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });
  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /applied, but proposed evidence or changes are absent from the accepted record/);
});

test('uses the uniquely latest applied proposal for a field', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const first = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.first-summary',
    field: 'summary',
    after: 'Earlier accepted summary',
    appliedAt: '2026-11-02T15:51:00Z'
  });
  const second = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.second-summary',
    field: 'summary',
    after: 'Latest accepted summary',
    appliedAt: '2026-11-02T15:52:00Z'
  });
  await replaceCandidateSet(fixture, [first, second]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Latest accepted summary' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 0);
});

test('keeps an applied record pending when its accepted value disagrees with the latest proposal', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const first = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.first-summary',
    field: 'summary',
    after: 'Earlier accepted summary',
    appliedAt: '2026-11-02T15:51:00Z'
  });
  const latest = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.second-summary',
    field: 'summary',
    after: 'Latest accepted summary',
    appliedAt: '2026-11-02T15:52:00Z'
  });
  await replaceCandidateSet(fixture, [first, latest]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Earlier accepted summary' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /applied, but proposed evidence or changes are absent from the accepted record/);
});

test('does not let a later unapplied proposal supersede an applied proposal', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const applied = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.applied-summary',
    field: 'summary',
    after: 'Applied summary from review',
    appliedAt: '2026-11-02T15:51:00Z'
  });
  const unapplied = makeCandidate({
    id: 'test.current-implementation.candidate.unapplied-summary',
    field: 'summary',
    after: 'Unapplied summary'
  });
  await replaceCandidateSet(fixture, [applied, unapplied]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Applied summary from review' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /unapplied-summary: triaged/);
});

test('requires applied proposals on different fields to both match', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const summaryCandidate = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.summary',
    field: 'summary',
    after: 'Reviewed summary for source behavior',
    appliedAt: '2026-11-02T15:51:00Z'
  });
  const titleCandidate = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.title',
    field: 'title',
    after: 'Reviewed title',
    appliedAt: '2026-11-02T15:52:00Z'
  });
  await replaceCandidateSet(fixture, [summaryCandidate, titleCandidate]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Reviewed summary for source behavior', title: 'Reviewed title' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 0);
});

test('still checks an unsuperseded field in a partially superseded multi-field candidate', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const earlier = setProposalChanges(makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.multi-field',
    field: 'summary',
    after: 'Earlier summary',
    appliedAt: '2026-11-02T15:51:00Z'
  }), [
    { field: 'summary', after: 'Earlier summary' },
    { field: 'title', after: 'Earlier reviewed title' }
  ]);
  const later = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.later-summary',
    field: 'summary',
    after: 'Latest summary after review',
    appliedAt: '2026-11-02T15:52:00Z'
  });
  await replaceCandidateSet(fixture, [earlier, later]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Latest summary after review' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /applied, but proposed evidence or changes are absent from the accepted record/);
});

test('keeps same-field proposals pending when their applied timestamps tie', async (t) => {
  const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
  t.after(fixture.cleanup);
  const appliedAt = '2026-11-02T15:52:00Z';
  const first = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.first-summary',
    field: 'summary',
    after: 'First summary',
    appliedAt
  });
  const second = makeCandidate({
    applied: true,
    id: 'test.current-implementation.candidate.second-summary',
    field: 'summary',
    after: 'Second summary after review',
    appliedAt
  });
  await replaceCandidateSet(fixture, [first, second]);
  await fs.writeFile(
    path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
    makeKnowledge({ updated: true, summary: 'Second summary after review' })
  );

  const result = await renderCurrentImplementation(fixture.packRoot, {
    outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
    now: assessedAt
  });

  assert.equal(result.pendingRecordCount, 1);
  assert.match(result.markdown, /applied_at is tied for field\(s\) summary/);
});

test('requires matching candidate evidence digest when one is declared', async (t) => {
  const cases = [
    { name: 'matches', candidateDigest: 'sha256:111111', acceptedDigest: 'sha256:111111', pending: 0 },
    { name: 'mismatch', candidateDigest: 'sha256:111111', acceptedDigest: 'sha256:222222', pending: 1 },
    { name: 'accepted digest missing', candidateDigest: 'sha256:111111', pending: 1 },
    { name: 'candidate digest omitted', acceptedDigest: 'sha256:222222', pending: 0 }
  ];

  for (const { name, candidateDigest, acceptedDigest, pending } of cases) {
    const fixture = await createFixture({ includeImpact: true, applied: true, reflectApplied: false });
    t.after(fixture.cleanup);
    const candidate = makeCandidate({
      applied: true,
      evidenceDigest: candidateDigest
    });
    await replaceCandidateSet(fixture, [candidate]);
    await fs.writeFile(
      path.join(fixture.packRoot, 'knowledge', 'accepted.md'),
      makeKnowledge({ updated: true, evidenceDigest: acceptedDigest })
    );

    const result = await renderCurrentImplementation(fixture.packRoot, {
      outputPath: path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md'),
      now: assessedAt
    });
    assert.equal(result.pendingRecordCount, pending, name);
  }
});

test('rejects invalid packs and keeps existing output untouched', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const outputPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  await fs.writeFile(outputPath, 'existing output\n');
  const packPath = path.join(fixture.packRoot, 'pack.json');
  const manifest = JSON.parse(await fs.readFile(packPath, 'utf8'));
  manifest.id = 'invalid identifier';
  await fs.writeFile(packPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    writeCurrentImplementation(fixture.packRoot, { outputPath, now: assessedAt }),
    (error) => error instanceof CurrentImplementationError && error.code === 'pack.invalid' && Boolean(error.validation)
  );
  assert.equal(await fs.readFile(outputPath, 'utf8'), 'existing output\n');
});

test('rejects output inside the pack and symbolic-link outputs', async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await assert.rejects(
    writeCurrentImplementation(fixture.packRoot, {
      outputPath: path.join(fixture.packRoot, 'CURRENT_IMPLEMENTATION.md'),
      now: assessedAt
    }),
    (error) => error instanceof CurrentImplementationError && error.code === 'output.inside_pack'
  );

  const linkPath = path.join(fixture.outputRoot, 'CURRENT_IMPLEMENTATION.md');
  const targetPath = path.join(fixture.outputRoot, 'target.md');
  await fs.writeFile(targetPath, 'do not replace the link target\n');
  await fs.symlink(targetPath, linkPath);
  await assert.rejects(
    writeCurrentImplementation(fixture.packRoot, { outputPath: linkPath, now: assessedAt }),
    (error) => error instanceof CurrentImplementationError && error.code === 'output.symlink'
  );
  assert.equal(await fs.readFile(targetPath, 'utf8'), 'do not replace the link target\n');
});

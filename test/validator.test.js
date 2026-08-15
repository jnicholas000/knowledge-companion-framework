import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validatePack, validateSchemas } from '../src/validator.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const examplePack = path.join(repositoryRoot, 'examples', 'atlas-notes');
const fixedNow = new Date('2026-08-05T18:00:00Z');

async function withExamplePack(mutate, verify) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-companion-test-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  await fs.cp(examplePack, packRoot, { recursive: true });
  try {
    await mutate(packRoot);
    const result = await validatePack(packRoot, { now: fixedNow, strict: true });
    await verify(result);
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

function hasCode(result, code) {
  return result.errors.some((error) => error.code === code);
}

async function applyCandidate(packRoot, applicationRecordId) {
  await replaceIn(
    packRoot,
    'learning/candidates/atomic-write.yaml',
    'state: triaged',
    'state: applied'
  );
  await replaceIn(
    packRoot,
    'learning/candidates/atomic-write.yaml',
    'provenance:',
    `  - from: triaged
    to: approved
    actor: { id: example.reviewer, type: human }
    authorization:
      policy_ref: example.atlas-notes.policy.knowledge-review
      verified_at: "2026-08-05T15:20:00Z"
      verified_by: { id: example.maintainer, type: human }
    at: "2026-08-05T15:20:00Z"
    rationale: The exact proposed change is accepted for application.
    content_digest: sha256:3b1d5a
  - from: approved
    to: applied
    actor: { id: example.maintainer, type: human }
    authorization:
      policy_ref: example.atlas-notes.policy.knowledge-application
      verified_at: "2026-08-05T15:25:00Z"
      verified_by: { id: example.maintainer, type: human }
    at: "2026-08-05T15:25:00Z"
    rationale: The accepted knowledge revision was written and verified.
    content_digest: sha256:3b1d5a
application:
  record_id: ${applicationRecordId}
  revision: fictional-atomic-write
  applied_at: "2026-08-05T15:25:00Z"
  applied_by: { id: example.maintainer, type: human }
provenance:`
  );
}

test('all canonical schemas compile under strict JSON Schema validation', async () => {
  const result = await validateSchemas();
  assert.equal(result.valid, true);
  assert.equal(result.schema_count, 11);
});

test('the complete example pack passes strict validation', async () => {
  const result = await validatePack(examplePack, { now: fixedNow, strict: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.files_checked, 13);
});

test('knowledge entries require an explicit application-neutral knowledge area', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/architecture.md',
      'knowledge_areas: [architecture, code]\n',
      ''
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );
});

test('an unresolved internal knowledge relationship is rejected', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/add-note-trace.md',
      'target: example.atlas-notes.architecture.boundaries',
      'target: example.atlas-notes.architecture.missing'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.knowledge_missing'), true);
    }
  );
});

test('a missing local evidence source is rejected', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/architecture.md',
      'locator: sources/system-overview.md',
      'locator: sources/missing-overview.md'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evidence.path_missing'), true);
    }
  );
});

test('evidence must name a source declared by the pack', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/architecture.md',
      'source_id: example.atlas-notes.repository',
      'source_id: example.atlas-notes.unknown-source'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.source_missing'), true);
    }
  );
});

test('schema-invalid records report diagnostics without entering semantic checks', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/add-note-trace.md',
      `relationships:
  - type: depends_on
    target_kind: knowledge
    target: example.atlas-notes.architecture.boundaries
    rationale: The trace follows the component boundaries described by the architecture record.
freshness:`,
      `relationships:
  invalid: true
freshness:`
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );
});

test('a local evidence locator cannot escape the pack root', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/architecture.md',
      'locator: sources/system-overview.md',
      'locator: ../outside.md'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evidence.path_unsafe'), true);
    }
  );
});

test('a local evidence symlink cannot resolve outside the pack root', async () => {
  await withExamplePack(
    async (root) => {
      const outside = path.join(path.dirname(root), 'outside.md');
      await fs.writeFile(outside, '# Outside the pack');
      await fs.symlink(outside, path.join(root, 'sources', 'outside-link.md'));
      await replaceIn(
        root,
        'knowledge/architecture.md',
        'locator: sources/system-overview.md',
        'locator: sources/outside-link.md'
      );
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evidence.path_unsafe'), true);
    }
  );
});

test('strict validation exposes overdue knowledge review as an error', async () => {
  await withExamplePack(
    (root) => replaceIn(root, 'knowledge/architecture.md', 'review_after: "2027-02-01"', 'review_after: "2026-01-01"'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'freshness.review_due'), true);
    }
  );
});

test('learning candidate state must match a connected, valid transition history', async () => {
  await withExamplePack(
    (root) => replaceIn(root, 'learning/candidates/atomic-write.yaml', 'state: triaged', 'state: approved'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'learning.state_mismatch'), true);
    }
  );
});

test('learning candidates model deferred review without allowing deferred approval skips', async () => {
  await withExamplePack(
    async (root) => {
      await replaceIn(root, 'learning/candidates/atomic-write.yaml', 'state: triaged', 'state: deferred');
      await replaceIn(root, 'learning/candidates/atomic-write.yaml', 'to: triaged', 'to: deferred');
    },
    (result) => {
      assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
    }
  );

  await withExamplePack(
    async (root) => {
      await replaceIn(root, 'learning/candidates/atomic-write.yaml', 'state: triaged', 'state: approved');
      await replaceIn(
        root,
        'learning/candidates/atomic-write.yaml',
        'to: triaged',
        'to: deferred'
      );
      await replaceIn(
        root,
        'learning/candidates/atomic-write.yaml',
        '    content_digest: sha256:3b1d5a',
        '    content_digest: sha256:3b1d5a\n  - from: deferred\n    to: approved\n    actor:\n      id: example.reviewer\n      type: human\n    authorization:\n      policy_ref: example.atlas-notes.policy.knowledge-review\n      verified_at: "2026-08-05T15:20:00Z"\n      verified_by: { id: example.maintainer, type: human }\n    at: "2026-08-05T15:20:00Z"\n    rationale: Approval cannot skip resumed triage after a deferral.\n    content_digest: sha256:feedface'
      );
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'learning.transition_invalid'), true);
    }
  );
});

test('learning review transitions require explicit reviewer authorization evidence', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'learning/candidates/atomic-write.yaml',
      '    authorization:\n      policy_ref: example.atlas-notes.policy.knowledge-review\n      verified_at: "2026-08-05T15:15:00Z"\n      verified_by: { id: example.maintainer, type: human }\n',
      ''
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );
});

test('three-point estimate ranges must remain ordered', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'estimates/export-command.yaml',
      'range: { low: 1, likely: 2, high: 5 }',
      'range: { low: 3, likely: 2, high: 1 }'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'estimate.range_order'), true);
    }
  );
});

test('estimates require explicit vision-aligned drivers and comparable-work evidence', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'estimates/export-command.yaml',
      'primary_drivers:',
      'omitted_primary_drivers:'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );

  await withExamplePack(
    (root) => replaceIn(
      root,
      'estimates/export-command.yaml',
      'example.atlas-notes.evidence.export-analogue\nrisks:',
      'example.atlas-notes.evidence.missing-comparable\nrisks:'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.evidence_missing'), true);
    }
  );
});

test('no-knowledge-change declarations cannot retain update candidates', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'learning/impacts/atomic-write.yaml',
      'classification: knowledge_update_required',
      'classification: no_knowledge_change'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'schema.invalid'), true);
    }
  );
});

test('undeclared custom vocabulary cannot enter a pack implicitly', async () => {
  await withExamplePack(
    (root) => replaceIn(root, 'knowledge/add-note-trace.md', 'kind: trace', 'kind: x-runtime-trace'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'extension.kind_undeclared'), true);
    }
  );
});

test('evaluation result scores must match the case weights', async () => {
  await withExamplePack(
    (root) => replaceIn(root, 'evals/explain-boundaries.result.yaml', 'overall_score: 1', 'overall_score: 0.5'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evaluation.score_mismatch'), true);
    }
  );
});

test('retrieval results must preserve contiguous score order and request filters', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.retrieval-result.yaml',
      'rank: 2\n    score: 0.93',
      'rank: 3\n    score: 0.99'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'retrieval.rank_sequence'), true);
      assert.equal(hasCode(result, 'retrieval.score_order'), true);
    }
  );
});

test('evaluation results must use the exact case fixture snapshot', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      'snapshot_id: example-pack-0.1.0',
      'snapshot_id: another-example-pack-snapshot'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evaluation.snapshot_mismatch'), true);
    }
  );
});

test('evaluation result dimensions must match the rubric exactly', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      'overall_score: 1',
      `  - name: knowledge_quality
    score: 1
    observations:
      - This duplicate must not silently replace the first dimension observation.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
overall_score: 1`
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evaluation.dimension_duplicate'), true);
    }
  );

  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      `  - name: evidence
    score: 1
    observations:
      - Both material claims cite the required source evidence identifiers.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
`,
      ''
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evaluation.dimension_missing'), true);
    }
  );

  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      'overall_score: 1',
      `  - name: retrieval_quality
    score: 1
    observations:
      - This dimension is valid vocabulary but is not part of this case rubric.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
overall_score: 1`
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'evaluation.dimension_unexpected'), true);
    }
  );

  await withExamplePack(
    async () => {},
    (result) => {
      assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
    }
  );
});

test('learning candidates must be reciprocally declared by an update-required impact', async () => {
  await withExamplePack(
    async (root) => {
      const original = path.join(root, 'learning/candidates/atomic-write.yaml');
      const declared = path.join(root, 'learning/candidates/declared-placeholder.yaml');
      await fs.copyFile(original, declared);
      await replaceIn(
        root,
        'learning/candidates/declared-placeholder.yaml',
        'id: example.atlas-notes.candidate.atomic-write',
        'id: example.atlas-notes.candidate.declared-placeholder'
      );
      await replaceIn(
        root,
        'learning/impacts/atomic-write.yaml',
        'example.atlas-notes.candidate.atomic-write',
        'example.atlas-notes.candidate.declared-placeholder'
      );
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.candidate_not_declared'), true);
    }
  );
});

test('learning candidates cannot attach to a no-knowledge-change impact', async () => {
  await withExamplePack(
    async (root) => {
      await replaceIn(
        root,
        'learning/impacts/atomic-write.yaml',
        'classification: knowledge_update_required',
        'classification: no_knowledge_change'
      );
      await replaceIn(
        root,
        'learning/impacts/atomic-write.yaml',
        `affected_knowledge_ids:
  - example.atlas-notes.decision.repository-port
candidate_ids:
  - example.atlas-notes.candidate.atomic-write`,
        `affected_knowledge_ids: []
candidate_ids: []`
      );
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'learning.no_change_candidate'), true);
      assert.equal(hasCode(result, 'reference.candidate_not_declared'), true);
    }
  );
});

test('applied candidates must resolve application evidence to accepted knowledge', async () => {
  await withExamplePack(
    (root) => applyCandidate(root, 'example.atlas-notes.decision.unknown'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reference.application_record_missing'), true);
    }
  );

  await withExamplePack(
    (root) => applyCandidate(root, 'example.atlas-notes.architecture.boundaries'),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'learning.application_target_mismatch'), true);
    }
  );

  await withExamplePack(
    async (root) => {
      await replaceIn(
        root,
        'learning/candidates/atomic-write.yaml',
        `target:
  operation: update
  record_id: example.atlas-notes.decision.repository-port
  expected_revision: example-pack-0.1.0`,
        `target:
  operation: create
  proposed_path: knowledge/architecture.md`
      );
      await replaceIn(root, 'knowledge/architecture.md', 'status: accepted', 'status: draft');
      await applyCandidate(root, 'example.atlas-notes.architecture.boundaries');
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'learning.application_record_not_accepted'), true);
    }
  );

  await withExamplePack(
    (root) => applyCandidate(root, 'example.atlas-notes.decision.repository-port'),
    (result) => {
      assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
    }
  );
});

test('an applied create candidate resolves the newly accepted record without a prior target ID', async () => {
  await withExamplePack(
    async (root) => {
      await fs.copyFile(
        path.join(root, 'knowledge/repository-port-decision.md'),
        path.join(root, 'knowledge/created-atomic-write.md')
      );
      await replaceIn(
        root,
        'knowledge/created-atomic-write.md',
        'id: example.atlas-notes.decision.repository-port',
        'id: example.atlas-notes.decision.atomic-write'
      );
      await replaceIn(
        root,
        'learning/candidates/atomic-write.yaml',
        `target:
  operation: update
  record_id: example.atlas-notes.decision.repository-port
  expected_revision: example-pack-0.1.0`,
        `target:
  operation: create
  proposed_path: knowledge/created-atomic-write.md`
      );
      await applyCandidate(root, 'example.atlas-notes.decision.atomic-write');
    },
    (result) => {
      assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
    }
  );
});

test('reasoning responses must preserve the referenced retrieval snapshot identity', async () => {
  await withExamplePack(
    (root) => replaceIn(
      root,
      'evals/explain-boundaries.reasoning.yaml',
      'snapshot_id: example-pack-0.1.0',
      'snapshot_id: another-example-pack-snapshot'
    ),
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'reasoning.snapshot_mismatch'), true);
    }
  );
});

test('claim identifiers must be unique within each knowledge record', async () => {
  await withExamplePack(
    async (root) => {
      await replaceIn(
        root,
        'knowledge/architecture.md',
        'id: example.atlas-notes.claim.repository-dependency',
        'id: example.atlas-notes.claim.application-boundary'
      );
      await replaceIn(
        root,
        'evals/explain-boundaries.retrieval-result.yaml',
        'example.atlas-notes.claim.repository-dependency',
        'example.atlas-notes.claim.application-boundary'
      );
    },
    (result) => {
      assert.equal(result.valid, false);
      assert.equal(hasCode(result, 'identity.claim_duplicate'), true);
    }
  );

  await withExamplePack(
    (root) => replaceIn(
      root,
      'knowledge/add-note-trace.md',
      'id: example.atlas-notes.claim.add-trace-order',
      'id: example.atlas-notes.claim.application-boundary'
    ),
    (result) => {
      assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
    }
  );
});

test('combined evaluation violations retain deterministic diagnostics and skip score calculation', async () => {
  const mutate = async (root) => {
    await replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      'snapshot_id: example-pack-0.1.0',
      'snapshot_id: another-example-pack-snapshot'
    );
    await replaceIn(
      root,
      'evals/explain-boundaries.result.yaml',
      `  - name: evidence
    score: 1
    observations:
      - Both material claims cite the required source evidence identifiers.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
overall_score: 1`,
      `  - name: knowledge_quality
    score: 0
    observations:
      - A duplicate result entry must retain an explicit integrity diagnostic.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
  - name: retrieval_quality
    score: 0
    observations:
      - An unexpected result entry must retain an explicit integrity diagnostic.
    evidence_refs:
      - example.atlas-notes.evidence.evaluation-output
overall_score: 0`
    );
  };

  let firstErrors;
  await withExamplePack(mutate, (result) => {
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      [
        'evaluation.dimension_duplicate',
        'evaluation.dimension_missing',
        'evaluation.dimension_unexpected',
        'evaluation.snapshot_mismatch'
      ]
    );
    assert.equal(hasCode(result, 'evaluation.score_mismatch'), false);
    assert.equal(hasCode(result, 'evaluation.outcome_mismatch'), false);
    firstErrors = result.errors;
  });

  await withExamplePack(mutate, (result) => {
    assert.deepEqual(result.errors, firstErrors);
  });
});

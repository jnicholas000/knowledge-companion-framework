# Continuous-Learning Architecture

## Objective

Knowledge changes as software changes. The learning architecture makes impact explicit, stale
knowledge visible, and updates reviewable. It does not equate recency with correctness and does not
grant a generator authority to change accepted knowledge.

## Workflow

```text
Repository change
  → normalized change evidence
  → knowledge-impact declaration
  → candidate updates (when required)
  → classification and triage
  → human-authorized review decision
  → separately applied knowledge evolution
  → validation and evaluation
```

Every meaningful change eventually produces one of two outcomes:

1. `knowledge_update_required`, with at least one candidate ID, or
2. `no_knowledge_change`, with a substantive rationale.

This declaration is the audit seam that makes silent staleness harder to hide. Phase One validates
the declaration format; repository hooks and pull-request enforcement are deferred.

## Change Evidence

A change detector normalizes repository-specific data into a provider-neutral change set with an
opaque repository identity, opaque base and target revisions, observation time, completeness,
limitations, and ordered path changes. Added, modified, deleted, and renamed paths are distinct;
renames preserve one old/new path pair, and a complete empty list is an explicit no-op. Missing
files, pagination, shallow history, or denied permissions make the set partial with explicit
limitations rather than silently complete. A detector does not decide knowledge impact.

Milestone 3 proves this boundary with a local Git-derived history and a checked-in synthetic
provider-shaped fixture. It does not match changes to `applies_to`, evidence, freshness triggers, or
relationships; that remains Milestone 4 work.

## Impact Detection

An impact classifier compares changed paths and change semantics with:

- record `applies_to` paths
- freshness invalidation triggers
- evidence locators
- knowledge relationships
- pack policy

The result is a `knowledge-impact` record. An impact declaration can name affected knowledge IDs
without proposing wording. `no_knowledge_change` is a reviewable claim, not the absence of a file.

Milestone 4 adds a read-only experimental assessment before candidate construction. It consumes one
normalized change set and one verified fixed snapshot, then emits stable affected-record entries
with `mechanical`, `interpretive`, or `sme_required` review requirements, triggering paths,
structured basis, evidence strength, limitations, and explanation. Exact local evidence and
`applies_to` paths establish mechanical linkage unless the matched evidence supports historical or
uncertain meaning. Declared globs and one outbound, allowlisted structural relationship hop establish
bounded interpretive scope; historical, business, domain, or operational ambiguity remains
SME-required. Weak, inbound-only, and second-hop adjacency does not propagate impact.

The experiment is deliberately not the Stable V1 `knowledge-impact` record. It creates no
candidate, proposed wording, approval, or write instruction. A complete unmatched input can support
reviewable no-change; a partial unmatched input is `indeterminate` and retains its limitations.

## Candidate Updates

A `learning-candidate` identifies one target operation: `create`, `update`, `supersede`, or
`deprecate`. It contains proposed field-level changes, evidence, classification, confidence, and a
review history. One candidate should be small enough to accept or reject coherently.

Candidates are suggestions. Their evidence may include repository diffs and test results, but their
proposed prose is not evidence.

Candidate classification has two independent axes:

- change type: what semantic surface changed (`fact_changed`, `decision_changed`,
  `relationship_changed`, `guidance_changed`, `freshness_only`, or `coverage_gap`)
- review requirement: how the proposed update can be established (`mechanical`, `interpretive`, or
  `sme_required`)

`mechanical` means the proposal can be checked deterministically against evidence; it does not mean
Phase One applies it automatically. `interpretive` requires a reviewer to judge meaning.
`sme_required` identifies knowledge that repository evidence alone cannot establish and requires an
accountable subject-matter expert.

## Lifecycle

```text
proposed → triaged → approved → applied
    ├──────────────→ rejected
    └──→ deferred → triaged
          └────────→ rejected
```

- `proposed`: generated or authored, not yet classified by a reviewer.
- `triaged`: target, scope, evidence, and ownership have been checked.
- `approved`: an authorized reviewer accepts the exact proposed change.
- `rejected`: terminal; rationale records why the proposal should not apply.
- `deferred`: review reached an explicit not-yet decision; rationale records the missing evidence,
  owner, or trigger for resumption. It may return only to `triaged` or end as `rejected`.
- `applied`: terminal; the accepted knowledge revision and application evidence are recorded.

Accepted outcomes are represented by `approved` and the separately evidenced `applied` state;
rejected and deferred outcomes remain durable rather than disappearing from the workflow.

Skipping a state is invalid. Editing an approved proposal creates a new candidate or returns it to a
new review cycle; approval never floats over changing content.

## Review Contract

Each transition records from/to state, actor, time, rationale, candidate content digest, and an
authorization check naming the governing policy plus who verified it. Review authorization is pack
or deployment policy, not a hard-coded role name. Phase One preserves the authorization evidence but
does not implement an identity or policy service. An AI may propose or assist review, but Phase One
assumes an accountable human authorizes approval and application. Mechanical classification never
bypasses that authorization boundary.

An applier must use optimistic concurrency against the target revision. If the target changed after
approval, application fails and the candidate returns for review rather than merging silently.

## Freshness And Staleness

Freshness has three independent signals:

- time-based: `review_after` has passed
- event-based: an invalidation trigger matches a change
- evidence-based: a cited source revision or digest no longer matches

A stale signal means "reverify," not "delete" and not "false." Strict validation makes overdue
review visible in gated workflows. Future dashboards can aggregate signals without changing their
meaning.

## Extension Points

Phase One defines seams for change detection, impact classification, candidate generation, review,
and application. Implementations may be rules, language analyzers, AI systems, or manual tools. They
share contracts and must preserve limitations, provenance, and review authority.

## Deferred Automation

The following are intentionally not implemented:

- fuzzy or model-driven diff-to-knowledge heuristics
- automatic pull-request comments or gates
- AI-generated candidate text
- unattended approval or application
- repository write-back

Phase One also does not detect repository changes. It models normalized change evidence and the
records that later detectors, classifiers, reviewers, and appliers must exchange.

## Knowledge And Evaluation Maintenance

`knowledge-impact` and `learning-candidate` records model changes to accepted knowledge. Evaluation
cases and results are separately versioned contracts: a knowledge change may expose an evaluation
maintenance need, but approval of a knowledge candidate does not silently rewrite a fixture,
rubric, or result. Any evaluation update requires its own reviewed evidence and version change.

Phase One does not publish an evaluation-update candidate schema because one example pack has not
proven a portable lifecycle beyond the existing versioned evaluation contracts. The roadmap keeps
reviewed evaluation fixtures ahead of continuous-learning automation; until that evidence exists,
evaluation maintenance is a visible design responsibility, not an implemented write-back feature.

They require real pack evidence and trust-boundary design. The contracts allow them later without
pretending they are safe now.

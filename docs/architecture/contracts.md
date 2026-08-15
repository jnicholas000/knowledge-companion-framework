# Contract Model

## Canonical Formats

JSON Schema Draft 2020-12 is the canonical structural definition. YAML and JSON are equivalent
serializations for structured records. Authored knowledge is Markdown with one YAML front-matter
object followed by a non-empty body:

```md
---
schema_version: "1.0"
id: example.architecture.boundary
...
---

# Human-readable content
```

The front matter is the machine contract. The body explains the record to humans and supplies
usable narrative context to AI systems. Front matter must never assert one thing while the body
asserts another; semantic review remains necessary because schemas cannot prove prose consistency.

## Schema Inventory

| Schema | Purpose |
| --- | --- |
| `common.schema.json` | shared identifiers, evidence, claims, provenance, relationships, freshness, extensions |
| `pack.schema.json` | pack identity, discovery globs, policies, and extension declarations |
| `knowledge-entry.schema.json` | metadata for a Markdown knowledge or delivery record |
| `retrieval-request.schema.json` | provider-neutral query, filters, snapshot, and result limit |
| `retrieval-result.schema.json` | ranked record references, rationale, provider, and limitations |
| `reasoning-response.schema.json` | inspectable output for explain, compare, trace, debug, estimate, and plan |
| `knowledge-impact.schema.json` | explicit result of assessing repository changes |
| `learning-candidate.schema.json` | proposed knowledge evolution and human review history |
| `estimate.schema.json` | evidence-backed ranges, work items, assumptions, risks, and exclusions |
| `evaluation-case.schema.json` | repeatable input and grading expectations |
| `evaluation-result.schema.json` | observations, dimension scores, outcome, and findings |

All schemas use stable `$id` URLs. Loading those URLs over the network is not required; validators
should register the local schema catalog by `$id`.

## Identity

Every durable record has a stable, lowercase, dot-separated identifier such as
`atlas-notes.decision.local-storage`. Paths and titles may change without changing identity. IDs are
never reused after deletion. Superseded records remain addressable and point to their replacements.

Application pack IDs should use an organization or example namespace. Extension keys use the same
principle, for example `com.example.security-review`. The `x-` prefix is reserved for extended enum
values such as a custom knowledge kind; its meaning must be declared in the pack manifest.

## Evidence And Claims

Pack manifests register evidence sources by stable ID. A source may be a local root, Git repository,
web origin, or artifact store. Each evidence item names a source plus a locator within that source;
this keeps paths meaningful when a pack is moved or a source is remote. The reference validator reads
only declared local roots inside the pack boundary. Future providers resolve remote sources without
changing evidence records.

Evidence identifies an observable item: a repository file and line range, test, commit, issue,
decision record, external document, interview, or direct observation. Evidence has its own ID,
source ID, locator, observation time, and optional content digest.

A claim has:

- a statement
- an epistemic status
- confidence
- zero or more evidence references

The five statuses are intentionally distinct:

| Status | Meaning | Evidence rule |
| --- | --- | --- |
| `verified_fact` | currently observable and checked | at least one evidence reference |
| `historical_knowledge` | an evidenced statement about prior state or intent | at least one evidence reference |
| `supported_conclusion` | conclusion logically supported by cited facts | at least one evidence reference |
| `inference` | plausible interpretation not established as fact | evidence encouraged; uncertainty must remain visible |
| `uncertainty` | material unknown, ambiguity, or conflict | evidence optional; must not be rewritten as a fact |

Confidence is not a substitute for status or evidence. `high` confidence in an inference is still an
inference. The validator checks local evidence references; evaluation must judge whether evidence
actually supports the statement.

## Relationships

Relationships are directed edges with a type, target, and optional rationale. Core types are:

- `depends_on`
- `implements`
- `implemented_by`
- `supersedes`
- `superseded_by`
- `related_to`
- `contradicts`
- `constrains`
- `traces_to`
- `validated_by`

The target kind is `knowledge`, `code`, or `external`. Internal knowledge targets must resolve
within the pack. Code and external targets are locators and are not mistaken for knowledge IDs.
Custom relationship types use `x-<name>` and must be declared by the pack.

## Knowledge Areas

Every knowledge entry declares at least one value in `knowledge_areas`. The seven core areas are:

- `identity`
- `domain_model`
- `architecture`
- `code`
- `business`
- `operational`
- `historical`

Areas are semantic facets, while `kind` identifies the record shape. For example, a `code_tour` may
cover `architecture`, `code`, and `operational` knowledge. This keeps the framework neutral while
making broad coverage and retrieval expectations explicit for human and AI consumers.

## Evidence Hierarchy

When evidence conflicts or a consumer must decide how strongly to present a conclusion, use this
order without silently erasing disagreement:

1. verified repository facts and executable evidence
2. accepted companion knowledge whose claims cite current evidence
3. accepted architectural decisions
4. evidenced historical records
5. inference, explicitly labeled
6. unknown or conflicting information, explicitly acknowledged

The hierarchy controls presentation and review priority; it does not allow a consumer to relabel an
inference as fact. Provenance, freshness, epistemic status, and limitations remain visible.

## Retrieval

A retrieval request fixes the pack snapshot, query, core filters, and limit. A retrieval result
returns ranked record IDs and optional claim IDs rather than copying or rewriting knowledge. Scores
are normalized to `0..1` for one provider invocation; they are not assumed comparable across
providers. Each match includes a human-readable rationale, and partial coverage is recorded in
`limitations`. The contracts do not prescribe keyword search, graph traversal, vectors, or ranking
technology.

Filter categories are conjunctive. Within `statuses`, `kinds`, and `record_ids`, a match may satisfy
any listed value; an empty `kinds` or `record_ids` list means unrestricted. A match must contain every
requested tag. Results are ordered by contiguous rank beginning at one, and score is non-increasing
within a result.

## Repository Change And Snapshot Interchange

Milestone 3 established a provider-neutral internal change-set representation through local Git
and synthetic provider-shaped acquisition experiments. A normalized change set preserves an opaque
repository identity, opaque base and target repository revisions, observation time, explicit
completeness and limitations, and ordered file changes. A file change is `added`, `modified`,
`deleted`, or `renamed`; a rename alone carries one distinct old path. An empty ordered change list
is an explicit no-op, not missing evidence. Adapters may consume provider vocabulary, but the
normalized representation may not retain it.

The same milestone established a local snapshot interchange experiment over both example packs.
Its reproducible manifest preserves pack identity, pack revision, optional opaque repository
revision provenance, completeness and limitations, sorted portable paths, exact byte sizes and
SHA-256 content references, and canonical record IDs plus content-derived record revisions only for
paths discovered through the content groups declared by `pack.yaml`. Metadata parsing shares normal
pack semantics while identity remains based on original bytes. The snapshot identity is the SHA-256
digest of the canonical identity-bearing manifest;
repository revision is deliberately excluded so identical pack content at two repository commits
retains one content identity.

These revision concepts are distinct:

- **repository revision** identifies source-control state and remains opaque to KCF; it is
  provenance, not proof that exported bytes came from that state;
- **knowledge-pack revision** is the pack manifest's declared release/version identity and may stay
  unchanged while working content changes; and
- **snapshot identity** identifies one exact canonical pack-content manifest and changes when its
  identity-bearing content relationships change.

Record revision in the experiment is an exact-byte content digest. SHA-256 verification detects the
tested accidental or adversarial mutations when an attacker does not replace both content and its
identity; it is not a signature, authenticity proof, retention guarantee, or claim that collisions
are impossible.

No new core schema is promoted yet. Both experiments and both packs converged, but current consumer
schemas use minimal `pack_id`/`pack_version`/`snapshot_id` references while the interchange uses
`pack_revision`, exact files, and content objects. The experiment has only one implementation and
no independent interchange consumer. Preserving it as a strict experimental module avoids
prematurely making transport and naming choices part of Stable V1. Promotion requires a separately
reviewed compatibility plan; current accepted instances remain valid and may use a content-derived
snapshot ID without changing their structure.

### Experimental Impact Assessment

Milestone 4 consumes the experimental normalized change-set and verified snapshot boundaries without
promoting either into Stable V1. Its internal `1.0-experimental` assessment distinguishes affected,
supported no-change, and partial-evidence `indeterminate` outcomes. Each affected entry carries a
review requirement, triggering paths, structured matching or relationship basis, evidence strength,
limitations, and explanation. Output ordering and identity are deterministic; no declared timestamp,
candidate, proposal, approval, or mutation instruction is added.

The Stable V1 `knowledge-impact.schema.json` remains unchanged. It cannot represent the reviewed
Milestone 4 outcome without semantic distortion: `knowledge_update_required` requires at least one
candidate, a complete no-op cannot satisfy `changed_paths`, `indeterminate` is absent, and per-record
review evidence has no core field. Extensions cannot remove those requirements. Promotion therefore
requires a separately reviewed versioned successor or compatibility plan; Milestone 4 does not
manufacture candidates or reinterpret V1.

## Freshness

Freshness is explicit metadata, not a guess based on Git timestamps:

- `last_verified_at`: when the record's claims were last checked
- `review_after`: the date after which the record is due for review
- `invalidation_triggers`: repository paths, dependencies, events, or manual conditions that should
  prompt impact analysis

Being due for review does not prove a record is false. It produces a visible warning; strict
validation promotes that warning to an error. A future change detector can match invalidation
triggers, but Phase One does not infer or apply updates.

## Provenance

Provenance records who or what created and last changed an artifact and when. An actor has a stable
ID and a type: `human`, `ai`, `automation`, or `system`. AI-created records are not assigned lower
quality automatically; they remain subject to identical evidence and review rules.

## Extensions

Core objects are closed to unknown fields. Additive extension data belongs under `extensions`, keyed
by a namespaced owner. Packs may also declare custom `x-` knowledge kinds and relationship types.
An extension cannot:

- change a core field's meaning
- remove a core validation requirement
- claim a different epistemic status model
- introduce executable code through a data manifest
- shadow another namespace

This yields strict cores without forcing every future domain into today's vocabulary.

## Versioning And Compatibility

`schema_version` is `major.minor` and is independent from pack and framework semantic versions.

- A framework patch release may clarify prose or repair validation without changing
  `schema_version` or the set of accepted instances.
- A schema minor version adds optional fields or additive enum values under an already documented
  rule.
- A schema major version removes fields, adds required fields, or changes semantics.

A validator must reject unsupported major versions. Migrations are explicit transformations from one
validated version to another; consumers must never silently reinterpret an old record as a new
version. Phase One publishes only `1.0` and therefore includes no migration code.

## Validation Levels

1. Parse validity: YAML, JSON, and front matter can be read.
2. Schema validity: required types, fields, and conditional rules hold.
3. Pack integrity: IDs are unique, references resolve, declared extensions exist, and paths are safe.
4. Quality signals: freshness, body completeness, and policy thresholds produce warnings or strict
   failures.
5. Semantic quality: evaluation and human review judge whether prose and evidence are actually
   correct. Phase One does not pretend schemas can supply this level.

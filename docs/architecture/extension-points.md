# Extension Points

## Design Rule

Extensions implement capabilities around stable records. They do not inherit framework internals or
modify core schemas at runtime. Each port is language-neutral and can later be mapped to a local
library, process boundary, MCP server, hosted API, or another protocol.

Every provider advertises a provider ID, contract version, capabilities, configuration schema, and
health information. Inputs and outputs are serializable values. Provider-specific data remains in a
namespaced extension object.

## Port Catalog

| Port | Input | Output | Invariants |
| --- | --- | --- | --- |
| `KnowledgeStore` | validated record plus expected revision | stored record and new revision | optimistic concurrency; no semantic mutation |
| `KnowledgeReader` | pack/snapshot and record ID | exact validated record or not-found | preserves accepted bytes and revision |
| `Retriever` | query, filters, snapshot, limit | ranked record references with scores and rationale | no claim generation; stable snapshot |
| `ReasoningStrategy` | mode, query, retrieved records, policy | `reasoning-response` | all non-uncertain factual claims cite supplied evidence |
| `ChangeDetector` | base/head repository references | normalized change set | read-only; records ignored/unavailable surfaces |
| `ImpactClassifier` | change set, accepted knowledge index | `knowledge-impact` | always returns update-required or justified no-change |
| `CandidateGenerator` | approved impact declaration and records | learning candidates in `proposed` | cannot approve or apply |
| `ReviewWorkflow` | candidate and reviewer decision | candidate with one valid state transition | reviewer identity and rationale are durable |
| `CandidateApplier` | approved candidate and expected target revision | updated record plus audit result | rejects non-approved or stale targets |
| `DeliveryRenderer` | accepted records or reasoning response, audience, format | rendered artifact plus source map | preserves claim status and evidence links |
| `Evaluator` | evaluation case, versioned system-under-test descriptor | `evaluation-result` | observations accompany scores |
| `PackPolicyValidator` | validated pack plus one namespaced policy object | portable diagnostics | read-only; cannot weaken core validation |

## Common Provider Envelope

Conceptually, every call accepts:

```text
request_id
contract_version
capability
input
configuration_reference
```

and returns:

```text
request_id
provider_id
provider_version
contract_version
status: succeeded | failed | partial
output
diagnostics
started_at
completed_at
```

This is an architectural boundary, not a Phase One wire protocol. A future protocol schema should be
introduced only after two distinct providers demonstrate the same need.

## Snapshot Boundary

Retrieval, reasoning, delivery, and evaluation receive an immutable knowledge snapshot identifier.
This prevents an answer from silently combining records from different pack revisions. A storage
implementation decides how snapshots work; provider output must still identify the snapshot used.

Milestone 3's local interchange evidence defines the minimum portable information behind that
identifier: pack identity and declared revision, a canonical content manifest, exact byte content
references and sizes, and record IDs plus exact-byte revisions only for paths discovered through
the manifest's content groups. Metadata parsing shares canonical pack semantics while identity uses
original bytes. Completeness and limitations remain explicit, and repository revision remains
separate opaque provenance. Git-tree and
content-addressed-directory experiments converge on one content-derived snapshot identity for the
same pack bytes, but their native source identities remain adapter details.

Import verification rejects missing or mutated objects, non-canonical ordering, record/content
identity mismatch, partial snapshots, pack substitution, duplicate snapshot identity, and stale
target revision. These are local experiment semantics, not a production storage provider or wire
protocol. Current consumer snapshot references remain compatible and do not by themselves prove
that a friendly `snapshot_id` was constructed immutably.

## Failure Semantics

Ports fail visibly and preserve partial evidence:

- `failed` means no output is safe to consume.
- `partial` means explicitly listed surfaces were unavailable; downstream reasoning must convert the
  gap into uncertainty.
- Timeouts and permission failures are diagnostics, not evidence that data does not exist.
- Providers do not retry non-idempotent mutation without an idempotency key and expected revision.

## Registration And Discovery

Application packs declare vocabulary extensions, not executable providers. Runtime composition will
belong to a separate deployment profile in a later phase. This prevents opening a pack from executing
code and keeps the same pack usable by multiple engines and IDEs.

## Adding A Port

Add a new core port only when:

1. at least two plausible implementations share the capability,
2. the input and output can be described without provider vocabulary,
3. its ownership does not overlap an existing port,
4. failure and partial-result semantics are explicit, and
5. a conformance case can verify the boundary.

Otherwise, implement a namespaced provider capability until evidence supports promotion.

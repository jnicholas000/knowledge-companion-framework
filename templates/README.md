# Authoring Templates

Templates are starting points, not alternate contracts. Replace every `{{...}}` token, remove
irrelevant optional fields, and validate the containing pack. The corresponding schema remains
canonical if a template and schema ever disagree.

Keep every `pack.yaml` content group, using `[]` when the pack has no matching records. Explicit
empty groups make discovery intent reviewable and keep packs on one canonical path. See the
[authoring and diagnostics guide](../docs/guides/authoring.md) for the CLI workflow and optional
schema-aware YAML mapping.

| Template | Contract |
| --- | --- |
| `pack.yaml` | `pack.schema.json` |
| `knowledge-entry.md` | `knowledge-entry.schema.json` |
| `decision.md` | `knowledge-entry.schema.json` with `kind: decision` |
| `mission-guide.md` | `knowledge-entry.schema.json` with `kind: mission_guide` |
| `code-tour.md` | `knowledge-entry.schema.json` with `kind: code_tour` |
| `task-guide.md` | `knowledge-entry.schema.json` with `kind: task_guide` |
| `onboarding.md` | `knowledge-entry.schema.json` with `kind: onboarding` |
| `knowledge-impact.yaml` | `knowledge-impact.schema.json` |
| `learning-candidate.yaml` | `learning-candidate.schema.json` |
| `estimate.yaml` | `estimate.schema.json` |
| `evaluation-case.yaml` | `evaluation-case.schema.json` |

## Planning Governance Template

`milestone-activation.template.md` turns one milestone from an approved KCF phase plan into a
separately approved, bounded execution handoff. It records entry evidence, allowed and prohibited
surfaces, deliverables, validation, completion evidence, stop conditions, and durable artifact
updates. It is not a pack record, has no schema contract, and does not activate a milestone merely
by being copied or drafted.

Delivery templates include a minimal metadata block and body shape. Add evidence and claims before
changing `status` from `draft` to `accepted`; the validator checks structural evidence references,
while reviewers remain responsible for whether evidence supports the prose.

Every knowledge or delivery record declares at least one application-neutral value in
`knowledge_areas`.
Mission Guide, Code Tour, Task Guide, and onboarding body concerns are narrative profile
requirements owned by [`docs/architecture/delivery.md`](../docs/architecture/delivery.md); their
dedicated templates make those concerns reviewable without encoding brittle heading rules in JSON
Schema.

# Delivery Architecture

## Purpose

Delivery turns accepted knowledge and structured reasoning into an artifact suited to a particular
job. It never becomes a second fact store: every durable delivery artifact is itself a knowledge
entry with evidence, claims, relationships, provenance, and freshness.

The core `knowledge-entry` schema supplies machine metadata. A delivery profile supplies the body
contract. Profiles remain Markdown conventions in Phase One because narrative structure is valuable
to humans and AI systems but inappropriate to encode as brittle JSON Schema heading rules.

## Profiles

| Profile | Knowledge kind | Required body concerns | Primary quality risk |
| --- | --- | --- | --- |
| Mission Guide | `mission_guide` | outcome, audience, prerequisites, scope decisions, affected repositories/applications/systems/folders/services/APIs, sequence, testing, observability, deployment/rollback, risks, mistakes, completion evidence, estimation factors | broad goal without an executable path |
| Code Tour | `code_tour` | orientation, ordered symbols/files, typed edges and branches, source references, tests, operational context, recap, change risks | disconnected file list, hidden relationships, or brittle line numbers |
| Task Guide | `task_guide` | applicability, preconditions, procedure, verification, recovery | unsafe steps or no coherent recovery point |
| Onboarding | `onboarding` | learning outcomes, progressive concept sequence, questions, exercises, Code Tour, practical Mission Guide, verification, next routes | encyclopedic dump without a learning path |
| Planning | reasoning mode `plan`, optionally persisted as `mission_guide` | scope, assumptions, decisions, ordered slices, evidence, stop conditions | hidden architecture decisions or unverifiable tasks |
| Estimating | `estimate` plus reasoning mode `estimate` | completion evidence, work items, range, uncertainty, exclusions | false precision or unsupported assumptions |
| Testing Guidance | usually `task_guide` | behavior contract, fixtures, normal/failure cases, evidence capture, limitations | treating unexecuted checks as verified |
| Deployment Guidance | usually `task_guide` | authority, preflight, rollout, observation, rollback, post-checks | hiding destructive or externally visible actions |

Profiles reuse knowledge kinds rather than adding a kind for every topic. Testing and deployment are
task-guide specializations; planning is a reasoning output that can graduate into a reviewed Mission
Guide; an estimate has its own structured contract because numeric consistency needs validation.
The onboarding profile is the Phase One learning-path contract. Code Tours explain existing systems;
Mission Guides (the framework's durable Mission Tour form) explain how to accomplish bounded work.
They must not be collapsed into one artifact type.

## Generation Contract

A Delivery Renderer receives:

- accepted knowledge or a validated reasoning response
- immutable knowledge snapshot identity
- profile and audience
- output format and consumer capabilities
- optional pack policy

It returns the rendered artifact plus a source map from output sections to claim, evidence, and
knowledge record IDs. A renderer may shorten or reorder content for an audience. It may not change
epistemic status, omit material uncertainty, invent evidence, or present draft knowledge as accepted.

## Human And AI Parity

Humans need narrative sequence, consequences, recovery, and readable source links. AI systems need
stable IDs, explicit scope, evidence, state, and stop conditions. The front-matter/body split supplies
both without maintaining parallel documents. Renderers can emit another format, but the source map
must preserve these semantics.

## Lifecycle

1. A reasoning or authoring process produces a draft delivery record.
2. Validation checks the core metadata and internal references.
3. Review checks body/profile completeness and whether cited evidence supports the guidance.
4. The accepted artifact becomes retrievable like any other knowledge entry.
5. Path/event triggers and `review_after` expose staleness.
6. Material changes follow the normal learning-candidate workflow.

Generated output that is not reviewed may still be returned as an ephemeral `reasoning-response`; it
must not be stored as accepted delivery knowledge merely because it reads well.

## Composition Rules

- Link record IDs rather than copy architectural explanations into every guide.
- Repeat operational steps only when the profile needs a self-contained safety boundary.
- Keep audience-specific phrasing in delivery artifacts, not canonical architecture records.
- Put commands and paths in guidance only when supported by current evidence.
- Mark blocked or manual verification explicitly.
- Put rollback beside rollout, and failure expectations beside success expectations.

Templates in `templates/` implement the Mission Guide, Code Tour, Task Guide, and Onboarding
profiles. The Atlas Notes example demonstrates onboarding as a validated delivery record.

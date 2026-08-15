---
schema_version: "1.0"
id: example.atlas-notes.onboarding.first-change
title: First Atlas Notes Change
kind: onboarding
knowledge_areas: [identity, architecture, code]
summary: New contributors learn the fictional request boundary before planning their first small change.
status: accepted
owners:
  - example.maintainer
tags:
  - onboarding
applies_to:
  - sources/**/*.md
evidence:
  - id: example.atlas-notes.evidence.onboarding-overview
    source_id: example.atlas-notes.repository
    kind: source_file
    locator: sources/system-overview.md
    observed_at: "2026-08-05T14:15:00Z"
    revision: example-pack-0.1.0
    description: The overview supplies the architectural sequence taught by this onboarding guide.
claims:
  - id: example.atlas-notes.claim.onboarding-start
    statement: A contributor should understand the parser-to-repository dependency direction before changing a command.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.onboarding-overview
relationships:
  - type: traces_to
    target_kind: knowledge
    target: example.atlas-notes.trace.add-note
    rationale: The add-note trace is the concrete path used during onboarding.
  - type: depends_on
    target_kind: knowledge
    target: example.atlas-notes.decision.repository-port
    rationale: The persistence decision explains the boundary a contributor must preserve.
freshness:
  last_verified_at: "2026-08-05T14:15:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/**/*.md
      description: Architectural or workflow changes may make the onboarding sequence misleading.
provenance:
  created_at: "2026-08-05T14:15:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-05T14:15:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# First Atlas Notes Change

## Learning Outcomes

After completing this path, a new contributor can:

- explain the parser-to-presenter add-note flow and its dependency direction;
- distinguish parser, application-service, repository-port, and storage-adapter responsibilities;
- use accepted records and source evidence to classify a small change; and
- plan that change without coupling application behavior to the JSON adapter.

## Prerequisites

- Read access to the fictitious pack and `sources/system-overview.md`.
- Familiarity with command parsing, application services, and interface/adapter terminology.
- Stop and ask the maintainer for an alternate explanation if the repository-port boundary is still
  unclear after reading `example.atlas-notes.decision.repository-port`.

## Progressive Concept Path

1. Learn component responsibilities from `example.atlas-notes.architecture.boundaries`.
2. Learn why persistence is behind a port from `example.atlas-notes.decision.repository-port`.
3. Follow `example.atlas-notes.trace.add-note` to connect those boundaries to one request.
4. Classify a proposed change as parser, application, port, or adapter work and identify which
   accepted records its implementation could invalidate.

## Learner Questions

- Why may the parser construct a command but not write the notes file directly?
- Which dependency permits use-case tests to run without disk I/O?
- Which accepted records and source locator support those answers?
- What change to the documented request sequence would make this onboarding record stale?

## Exercises

1. Draw the request flow using only stable component names and label each dependency or call edge.
2. Given a proposed application validation rule, name the owning component and explain why the JSON
   adapter is outside the initial scope.
3. List the knowledge records that need review if the application service begins bypassing the
   repository port.

## Existing-System Code Tour

Use `example.atlas-notes.trace.add-note` as the accepted source for this editor-neutral tour:

1. **Parser** — converts `atlas add "Call Sam"` into a command; calls the application service.
2. **`NoteApplicationService`** — validates the command; depends on `NoteRepository`.
3. **`NoteRepository` port** — carries the persistence request without selecting storage.
4. **`JsonFileNoteRepository`** — serializes and atomically replaces the local JSON file.
5. **Presenter** — receives the result through the application service and displays it.

The primary relationship is a parser-to-service call followed by a service-to-port dependency and
a port-to-adapter implementation edge. Re-check `sources/system-overview.md` and the relevant use-case
tests if available; a new branch, storage bypass, or moved validation makes the tour stale. This tour
explains existing flow and contains no implementation sequence.

## Practical Mission Guide

Plan a small application-service validation change while preserving the repository boundary.

- **Scope:** the application validation rule and its use-case tests are in scope. Parser or adapter
  changes require separate evidence; a storage technology change is excluded.
- **Sequence:** confirm the accepted boundary, identify the application behavior, describe the
  smallest implementation surface, then specify normal and rejection-path tests using a repository
  test double.
- **Completion evidence:** the plan maps each changed surface to a supported record, keeps file I/O
  out of the application behavior, and names the tests that would demonstrate the rule.
- **Operations:** this exercise does not deploy or mutate the fictitious application. If later
  executed in a real repository, use that repository's observability, rollout, and rollback rules.
- **Stop conditions:** stop for architecture review if the proposal requires a parser-to-adapter
  dependency, changes persistence semantics, or lacks evidence for the validation owner.

## Verification

The contributor should answer the learner questions from named evidence, reproduce the ordered Code
Tour, and present the practical Mission Guide with explicit scope, tests, completion evidence, and
stop conditions. A maintainer confirms that the plan preserves the accepted dependency direction.

## Next Routes

- Revisit `example.atlas-notes.architecture.boundaries` when verification reveals a boundary gap.
- Continue to `example.atlas-notes.trace.add-note` for deeper flow analysis.
- Continue to `example.atlas-notes.decision.repository-port` before planning persistence work.
- Request architectural review instead of continuing when a mission requires the application
  service to depend on a concrete storage adapter or exposes persistence behavior to the parser.

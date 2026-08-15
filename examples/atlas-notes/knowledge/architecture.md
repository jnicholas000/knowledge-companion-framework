---
schema_version: "1.0"
id: example.atlas-notes.architecture.boundaries
title: Atlas Notes Architectural Boundaries
kind: architecture
knowledge_areas: [architecture, code]
summary: The command parser, application service, repository port, and JSON adapter have distinct responsibilities.
status: accepted
owners:
  - example.maintainer
tags:
  - architecture
  - boundaries
applies_to:
  - sources/system-overview.md
  - sources/decisions/*.md
evidence:
  - id: example.atlas-notes.evidence.system-overview
    source_id: example.atlas-notes.repository
    kind: source_file
    locator: sources/system-overview.md
    observed_at: "2026-08-05T14:00:00Z"
    revision: example-pack-0.1.0
    description: The fictional system overview defines the components and their dependency direction.
claims:
  - id: example.atlas-notes.claim.application-boundary
    statement: The command parser delegates validated application behavior to NoteApplicationService.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.system-overview
  - id: example.atlas-notes.claim.repository-dependency
    statement: NoteApplicationService depends on the NoteRepository port rather than the JSON adapter.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.system-overview
relationships:
  - type: implemented_by
    target_kind: knowledge
    target: example.atlas-notes.decision.repository-port
    rationale: The repository-port decision explains why the dependency boundary exists.
freshness:
  last_verified_at: "2026-08-05T14:00:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/system-overview.md
      description: Component or dependency changes can invalidate the architecture description.
    - type: path_changed
      value: sources/decisions/*.md
      description: A replacement persistence decision can alter the documented boundary.
provenance:
  created_at: "2026-08-05T14:00:00Z"
  created_by:
    id: example.maintainer
    type: human
    display_name: Example Maintainer
  last_modified_at: "2026-08-05T14:00:00Z"
  last_modified_by:
    id: example.maintainer
    type: human
    display_name: Example Maintainer
---

# Atlas Notes Architectural Boundaries

## Scope

This record explains responsibility and dependency direction for the fictional command flow. It
does not prescribe a programming language, CLI library, or future storage technology.

## Components

The parser translates input but does not persist data. `NoteApplicationService` owns use-case
validation and orchestration. It calls the `NoteRepository` port. `JsonFileNoteRepository` implements
that port and owns file serialization.

## Consequences

Use-case tests can replace storage with an in-memory repository, and another storage adapter does not
require changes to command parsing. The boundary would be violated if a command handler imported the
JSON adapter directly.

## Verification

Re-check the source overview and accepted persistence decisions. Any direct parser-to-adapter edge or
movement of validation into the adapter requires review.

---
schema_version: "1.0"
id: example.atlas-notes.trace.add-note
title: Add Note Request Trace
kind: trace
knowledge_areas: [architecture, code]
summary: An add-note command crosses the parser, application service, repository port, JSON adapter, and presenter.
status: accepted
owners:
  - example.maintainer
tags:
  - request-trace
applies_to:
  - sources/system-overview.md
evidence:
  - id: example.atlas-notes.evidence.add-trace
    source_id: example.atlas-notes.repository
    kind: source_file
    locator: sources/system-overview.md
    observed_at: "2026-08-05T14:10:00Z"
    revision: example-pack-0.1.0
    description: The system overview states the ordered fictional add-note request sequence.
claims:
  - id: example.atlas-notes.claim.add-trace-order
    statement: Add-note handling proceeds from parser to service to repository port to JSON adapter to presenter.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.add-trace
relationships:
  - type: depends_on
    target_kind: knowledge
    target: example.atlas-notes.architecture.boundaries
    rationale: The trace follows the component boundaries described by the architecture record.
freshness:
  last_verified_at: "2026-08-05T14:10:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/system-overview.md
      description: Request sequencing changes can invalidate one or more trace stops.
provenance:
  created_at: "2026-08-05T14:10:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-05T14:10:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Add Note Request Trace

## Entry

The parser converts `atlas add "Call Sam"` into an add command. It does not know the persistence
adapter.

## Application

`NoteApplicationService` validates the note text and invokes the `NoteRepository` port.

## Persistence And Return

`JsonFileNoteRepository` serializes the updated collection and replaces the notes file. The result
returns through the application service to the presenter.

## Change Risks

Moving validation or storage into the parser, or introducing an event queue, would materially change
the trace and requires a new verification pass.

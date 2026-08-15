---
schema_version: "1.0"
id: example.atlas-notes.decision.repository-port
title: Persistence Uses A Repository Port
kind: decision
knowledge_areas: [architecture, historical]
summary: Persistence is isolated behind NoteRepository so application behavior is independent of file storage.
status: accepted
owners:
  - example.maintainer
tags:
  - decision
  - persistence
applies_to:
  - sources/decisions/001-repository-port.md
evidence:
  - id: example.atlas-notes.evidence.repository-decision
    source_id: example.atlas-notes.repository
    kind: decision_record
    locator: sources/decisions/001-repository-port.md
    observed_at: "2026-08-05T14:05:00Z"
    revision: example-pack-0.1.0
    description: The accepted fictional decision records the persistence boundary and its rationale.
claims:
  - id: example.atlas-notes.claim.repository-port-selected
    statement: Atlas Notes selected NoteRepository as the application-facing persistence boundary.
    epistemic_status: historical_knowledge
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.repository-decision
  - id: example.atlas-notes.claim.repository-port-tradeoff
    statement: The added interface is supported by the ability to test use cases without disk I/O.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs:
      - example.atlas-notes.evidence.repository-decision
relationships:
  - type: implements
    target_kind: knowledge
    target: example.atlas-notes.architecture.boundaries
    rationale: The decision establishes the persistence dependency described by the architecture record.
freshness:
  last_verified_at: "2026-08-05T14:05:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/decisions/001-repository-port.md
      description: A revised or superseded decision requires this record to be reviewed.
provenance:
  created_at: "2026-08-05T14:05:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-05T14:05:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Persistence Uses A Repository Port

## Context

Commands need persistent notes, but parsing, application rules, and storage have different reasons
to change.

## Decision

The application service talks to `NoteRepository`. JSON serialization remains an adapter detail.

## Alternatives Considered

Direct file access from command handlers was rejected because it mixes input parsing, validation,
and storage. A database was rejected because the fictional local application has no demonstrated
query or concurrency requirement.

## Consequences

Tests can provide an in-memory repository and persistence can change independently. The application
must maintain an explicit port and mapping boundary.

## Revisit Triggers

Revisit when use cases require cross-process concurrency or queries the repository contract cannot
express without leaking a specific storage model.

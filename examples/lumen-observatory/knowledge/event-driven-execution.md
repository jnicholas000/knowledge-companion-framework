---
schema_version: "1.0"
id: example.lumen-observatory.architecture.event-execution
title: Event-Driven Scheduling And Execution Boundaries
kind: architecture
knowledge_areas: [architecture, code, operational]
summary: Request events feed eligibility projection, queue selection, atomic reservation, and externally controlled execution through separate boundaries.
status: accepted
owners: [example.maintainer]
tags: [architecture, events, reservation, execution]
applies_to: [sources/architecture.md, sources/test-matrix.md]
evidence:
  - id: example.lumen-observatory.evidence.event-architecture
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/architecture.md
    observed_at: "2026-08-06T14:25:00Z"
    revision: lumen-pack-0.1.0
    description: The fictional architecture source defines components, dependencies, events, and failure boundaries.
  - id: example.lumen-observatory.evidence.acceptance-tests
    source_id: example.lumen-observatory.repository
    kind: test
    locator: sources/test-matrix.md
    observed_at: "2026-08-06T14:25:00Z"
    revision: lumen-pack-0.1.0
    description: The acceptance matrix supplies reservation-conflict and hold edge cases.
claims:
  - id: example.lumen-observatory.claim.scheduler-boundary
    statement: The Scheduler reads eligible requests and writes through the Reservation Ledger without interpreting sensors or sending device commands.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.event-architecture]
  - id: example.lumen-observatory.claim.atomic-reservation
    statement: Reservation conflicts are resolved by refreshing eligibility and selecting again rather than double executing a request.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.event-architecture, example.lumen-observatory.evidence.acceptance-tests]
  - id: example.lumen-observatory.claim.loss-of-status-fails-closed
    statement: Loss of fresh safety status prevents new reservations until the projector observes a fresh open state.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.event-architecture]
relationships:
  - type: implements
    target_kind: knowledge
    target: example.lumen-observatory.domain.observation-lifecycle
    rationale: The component and event boundaries realize the lifecycle described by the domain record.
  - type: x-blocked-by
    target_kind: knowledge
    target: example.lumen-observatory.constraint.safety-gates
    rationale: Eligibility projection and execution coordination must preserve safety-gate precedence.
freshness:
  last_verified_at: "2026-08-06T14:25:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/architecture.md
      description: Component, dependency, event, or failure-boundary changes require architecture review.
    - type: dependency_changed
      value: telescope-control-boundary
      description: A changed execution-control contract may invalidate coordinator responsibilities.
provenance:
  created_at: "2026-08-06T14:25:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:25:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Event-Driven Scheduling And Execution Boundaries

## Components

The Request API appends validated submissions. The Eligibility Projector derives a read model from
request, catalog, time, and safety events. The Scheduler selects from that model, while the
Reservation Ledger prevents concurrent selection of the same request. Only the Execution
Coordinator calls the external telescope-control boundary.

## Failure Paths

Reservation conflicts restart selection. Command rejection fails the reserved request and keeps the
external reason. Missing fresh safety state prevents reservation, which preserves fail-closed
behavior without teaching the Scheduler about sensors.

## Verification

Review component dependency statements in `sources/architecture.md` and the concurrency and hold
cases in `sources/test-matrix.md`.

---
schema_version: "1.0"
id: example.lumen-observatory.domain.observation-lifecycle
title: Observation Request Lifecycle
kind: concept
knowledge_areas: [domain_model, business]
summary: Observation requests move through eligibility, reservation, execution, and terminal states under temporal and safety constraints.
status: accepted
owners: [example.maintainer]
tags: [domain-model, lifecycle, observation-request]
applies_to: [sources/domain-model.md, sources/test-matrix.md]
evidence:
  - id: example.lumen-observatory.evidence.domain-model
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/domain-model.md
    observed_at: "2026-08-06T14:15:00Z"
    revision: lumen-pack-0.1.0
    description: The fictional domain model defines request fields, lifecycle states, windows, and arbitration.
  - id: example.lumen-observatory.evidence.acceptance-tests
    source_id: example.lumen-observatory.repository
    kind: test
    locator: sources/test-matrix.md
    observed_at: "2026-08-06T14:15:00Z"
    revision: lumen-pack-0.1.0
    description: The acceptance matrix specifies window, priority, safety, conflict, and hold expectations.
claims:
  - id: example.lumen-observatory.claim.lifecycle-order
    statement: A normal observation request progresses from submitted through eligible, reserved, and executing to completed or failed.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.domain-model]
  - id: example.lumen-observatory.claim.full-duration-fit
    statement: Eligibility requires execution to begin within the observing window and the full requested duration to end no later than its exclusive boundary; ending exactly at that boundary is valid, while extending beyond it is invalid.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.domain-model, example.lumen-observatory.evidence.acceptance-tests]
  - id: example.lumen-observatory.claim.queue-order
    statement: Eligible requests sort by descending priority, then earliest window end, then stable request ID.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.domain-model, example.lumen-observatory.evidence.acceptance-tests]
relationships:
  - type: x-blocked-by
    target_kind: knowledge
    target: example.lumen-observatory.constraint.safety-gates
    rationale: Safety status participates in eligibility before a request can advance to reservation.
  - type: implemented_by
    target_kind: knowledge
    target: example.lumen-observatory.architecture.event-execution
    rationale: The event-driven components implement the request lifecycle and reservation boundary.
freshness:
  last_verified_at: "2026-08-06T14:15:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/domain-model.md
      description: State, window, configuration, or queue-rule changes require lifecycle review.
    - type: path_changed
      value: sources/test-matrix.md
      description: Acceptance expectation changes may invalidate lifecycle and boundary claims.
provenance:
  created_at: "2026-08-06T14:15:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:15:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Observation Request Lifecycle

## Request And Window

Each request binds a target label and instrument configuration to a required duration inside a
half-open UTC window. Execution must begin at or after the included start and before the excluded
end, and the full requested duration must fit within that window. An execution interval ending
exactly at the window end is valid; one extending beyond the boundary is ineligible.

## State And Arbitration

Eligibility precedes selection. The queue orders only requests already proven eligible; priority
cannot compensate for an unsupported configuration, insufficient time, or closed safety gate.

## Boundaries And Consequences

Selection is not execution. The reservation and external command boundaries can still fail, and
their outcomes determine whether the request proceeds or terminates.

## Verification

Review the domain model and acceptance matrix together. The source prose supplies state meaning;
the matrix provides edge cases that prevent an overly broad interpretation.

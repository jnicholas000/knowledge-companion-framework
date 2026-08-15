---
schema_version: "1.0"
id: example.lumen-observatory.code-tour.observation-execution
title: Observation Request To Execution Tour
kind: code_tour
knowledge_areas: [architecture, code, operational]
summary: This ordered tour follows a request from submission through eligibility and atomic reservation to the external execution boundary.
status: accepted
owners: [example.maintainer]
tags: [code-tour, event-flow, execution]
applies_to: [sources/architecture.md, sources/domain-model.md]
evidence:
  - id: example.lumen-observatory.evidence.event-architecture
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/architecture.md
    observed_at: "2026-08-06T14:30:00Z"
    revision: lumen-pack-0.1.0
    description: The architecture source defines each tour stop and the event or port connecting it.
  - id: example.lumen-observatory.evidence.domain-model
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/domain-model.md
    observed_at: "2026-08-06T14:30:00Z"
    revision: lumen-pack-0.1.0
    description: The domain source defines the lifecycle and arbitration semantics encountered in the tour.
claims:
  - id: example.lumen-observatory.claim.execution-tour-order
    statement: The normal flow crosses Request API, Eligibility Projector, Scheduler, Reservation Ledger, and Execution Coordinator in that order.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.event-architecture]
  - id: example.lumen-observatory.claim.tour-preserves-boundaries
    statement: Queue selection and external execution are separated by the atomic reservation boundary.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.event-architecture, example.lumen-observatory.evidence.domain-model]
relationships:
  - type: traces_to
    target_kind: knowledge
    target: example.lumen-observatory.architecture.event-execution
    rationale: The tour is a narrative traversal of the architecture record's components and edges.
  - type: x-blocked-by
    target_kind: knowledge
    target: example.lumen-observatory.constraint.safety-gates
    rationale: A closed or unknown gate stops the tour before a new reservation can be issued.
freshness:
  last_verified_at: "2026-08-06T14:30:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/architecture.md
      description: Changes to components or event order require the tour to be repeated.
    - type: event
      value: reservation-protocol-changed
      description: A changed reservation protocol may alter the primary path and its failure branch.
provenance:
  created_at: "2026-08-06T14:30:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:30:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Observation Request To Execution Tour

## Orientation

Follow one request through the event-driven path. The tour demonstrates how domain state and safety
constraints meet without collapsing scheduling and device control into one component.

## Stop 1 — Request API

- Location: `sources/architecture.md#components`
- Purpose: validate shape and append `request.submitted`.
- Observe: submission does not imply eligibility.
- Outgoing edge: the event feeds the Eligibility Projector.

## Stop 2 — Eligibility Projector

- Location: `sources/architecture.md#components`
- Purpose: combine request, catalog, clock, and safety state.
- Observe: a closed or unknown gate excludes the request before selection.
- Outgoing edge: an eligibility view supplies candidates to the Scheduler.

## Stop 3 — Scheduler

- Location: `sources/domain-model.md#queue-arbitration`
- Purpose: apply priority and deterministic tie breakers to eligible requests.
- Observe: the Scheduler does not interpret sensor inputs.
- Outgoing edge: the selected request goes to the Reservation Ledger port.

## Stop 4 — Reservation Ledger

- Location: `sources/architecture.md#failure-boundaries`
- Purpose: reserve one request atomically.
- Observe: a conflict restarts selection and prevents duplicate execution.
- Outgoing edge: a successful reservation reaches the Execution Coordinator.

## Stop 5 — Execution Coordinator

- Location: `sources/architecture.md#components`
- Purpose: send the command through the external telescope-control port and record outcomes.
- Observe: command rejection remains distinct from queue or reservation failure.

## Branches And Change Risks

Safety closure blocks new reservations and holds active execution. Changes to event order,
reservation semantics, or telescope-control ownership make this tour stale.

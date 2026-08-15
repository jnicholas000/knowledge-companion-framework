---
schema_version: "1.0"
id: example.lumen-observatory.runbook.weather-hold
title: Recover An Observation From A Weather Hold
kind: runbook
knowledge_areas: [operational, domain_model]
summary: Operators verify all gates, control acknowledgement, and remaining observing time before resuming or releasing a held observation.
status: accepted
owners: [example.maintainer]
tags: [runbook, safety, weather-hold]
applies_to: [sources/operations.md, sources/test-matrix.md]
evidence:
  - id: example.lumen-observatory.evidence.safe-hold-operations
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/operations.md
    observed_at: "2026-08-06T14:35:00Z"
    revision: lumen-pack-0.1.0
    description: The fictional operations source defines hold observability, preconditions, actions, and escalation.
  - id: example.lumen-observatory.evidence.acceptance-tests
    source_id: example.lumen-observatory.repository
    kind: test
    locator: sources/test-matrix.md
    observed_at: "2026-08-06T14:35:00Z"
    revision: lumen-pack-0.1.0
    description: The test matrix distinguishes resumable and expired holds.
claims:
  - id: example.lumen-observatory.claim.recovery-preconditions
    statement: Resume requires every gate to be freshly open, control hold acknowledgement, and enough remaining window duration.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.safe-hold-operations, example.lumen-observatory.evidence.acceptance-tests]
  - id: example.lumen-observatory.claim.no-forced-recovery
    statement: Operators may not edit gate state or extend an observing window to force a resume.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.safe-hold-operations]
relationships:
  - type: depends_on
    target_kind: knowledge
    target: example.lumen-observatory.constraint.safety-gates
    rationale: Recovery decisions rely on the safety precedence and fail-closed constraint.
  - type: related_to
    target_kind: knowledge
    target: example.lumen-observatory.domain.observation-lifecycle
    rationale: Release, resume, and fail actions change the observation request lifecycle.
freshness:
  last_verified_at: "2026-08-06T14:35:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/operations.md
      description: Procedure, observability, or escalation changes require runbook review.
    - type: event
      value: required-safety-gates-changed
      description: A changed gate set invalidates the recovery checklist immediately.
provenance:
  created_at: "2026-08-06T14:35:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:35:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Recover An Observation From A Weather Hold

## Preconditions And Stop Conditions

Confirm the request ID, gate IDs and timestamps, control-boundary hold acknowledgement, and
remaining duration. Stop if a timestamp or calculation is missing, any gate is not freshly open,
or the control boundary has not confirmed the hold.

## Recovery Sequence

1. Verify every required gate has a fresh `safety.open` event.
2. Verify the external control boundary acknowledged the active hold.
3. Recalculate whether the full remaining duration fits inside the current window.
4. Resume the same reservation only when all three checks pass.
5. Otherwise release the reservation; return the request to submitted if another valid window
   remains, or fail it when no valid window remains.
6. Record the operator action and rationale.

## Observability And Escalation

The operator view must show gate identity, request identity, last status times, and hold
acknowledgement. Catalog disagreements go to the fictional instrument specialist; command
rejections go to the fictional controls maintainer.

## Verification

Use the held-execution and expired-hold rows in `sources/test-matrix.md`. A reopened gate alone is
not completion evidence.

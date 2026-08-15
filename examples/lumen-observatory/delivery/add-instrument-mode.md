---
schema_version: "1.0"
id: example.lumen-observatory.mission-guide.add-instrument-mode
title: Add A Supported Instrument Mode
kind: mission_guide
knowledge_areas: [domain_model, architecture, code, operational]
summary: This bounded mission adds a fictional instrument mode while preserving eligibility, safety, reservation, and operator evidence.
status: accepted
owners: [example.maintainer]
tags: [mission-guide, instrument-catalog, testing]
applies_to: [sources/domain-model.md, sources/architecture.md, sources/test-matrix.md]
evidence:
  - id: example.lumen-observatory.evidence.domain-model
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/domain-model.md
    observed_at: "2026-08-06T14:40:00Z"
    revision: lumen-pack-0.1.0
    description: The domain source defines supported configurations and specialist review responsibility.
  - id: example.lumen-observatory.evidence.event-architecture
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/architecture.md
    observed_at: "2026-08-06T14:40:00Z"
    revision: lumen-pack-0.1.0
    description: The architecture source locates catalog use in eligibility rather than scheduling.
  - id: example.lumen-observatory.evidence.acceptance-tests
    source_id: example.lumen-observatory.repository
    kind: test
    locator: sources/test-matrix.md
    observed_at: "2026-08-06T14:40:00Z"
    revision: lumen-pack-0.1.0
    description: The matrix supplies safety, duration, priority, and conflict expectations to retain.
claims:
  - id: example.lumen-observatory.claim.catalog-review-required
    statement: Adding a supported instrument configuration requires instrument-specialist review and matching eligibility tests.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.domain-model]
  - id: example.lumen-observatory.claim.catalog-change-boundary
    statement: Instrument support belongs in the catalog and Eligibility Projector rather than the Scheduler's arbitration logic.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.domain-model, example.lumen-observatory.evidence.event-architecture]
relationships:
  - type: depends_on
    target_kind: knowledge
    target: example.lumen-observatory.architecture.event-execution
    rationale: The mission preserves the established catalog, projection, scheduling, and execution boundaries.
  - type: validated_by
    target_kind: knowledge
    target: example.lumen-observatory.code-tour.observation-execution
    rationale: Repeating the request-to-execution tour checks that the new mode does not move responsibilities.
freshness:
  last_verified_at: "2026-08-06T14:40:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/domain-model.md
      description: Catalog ownership or configuration changes can invalidate mission scope.
    - type: path_changed
      value: sources/architecture.md
      description: Component responsibility changes can invalidate the implementation sequence.
provenance:
  created_at: "2026-08-06T14:40:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:40:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Add A Supported Instrument Mode

## Outcome And Audience

An instrument specialist and contributor add one fictional mode to the supported catalog without
changing queue arbitration or bypassing safety gates.

## Prerequisites And Stop Conditions

Obtain specialist confirmation of the mode name, setup profile, and duration implications. Stop if
the mode requires a new safety policy, external control contract, or physical-device capability;
those are outside this mission's evidence.

## Scope Decisions

Change the catalog, eligibility projection expectations, and supporting tests. Do not change queue
priority, reservation, operator override policy, or telescope-control ownership.

## Implementation Sequence

1. Record specialist approval and the supported setup profile.
2. Add the catalog entry consumed by the Eligibility Projector.
3. Add eligible and unsupported-configuration cases at observing-window boundaries.
4. Re-run closed and missing gate cases to prove the mode cannot bypass safety.
5. Re-run equal-priority and reservation-conflict cases to prove arbitration remains generic.
6. Traverse the observation-execution Code Tour and record completion evidence.

## Testing, Deployment, And Recovery

The fictional fixture defines no production deployment. Completion requires reviewed catalog
evidence and the normal/failure cases above. Recovery is removal of the unaccepted catalog entry;
stop rather than invent a migration for already running observations.

## Estimation Factors

Scope varies with setup-profile complexity, external control compatibility, window-duration rules,
and the number of safety cases. This guide supplies no effort estimate because no comparable
completed implementation exists.

---
schema_version: "1.0"
id: example.lumen-observatory.constraint.safety-gates
title: Safety Gates Precede Scheduling
kind: constraint
knowledge_areas: [domain_model, architecture, operational, historical]
summary: Closed, missing, or stale safety status excludes requests before queue priority is considered and holds active execution.
status: accepted
owners: [example.maintainer]
tags: [constraint, safety, eligibility]
applies_to: [sources/decisions/001-safety-gate-precedence.md, sources/operations.md, sources/test-matrix.md]
evidence:
  - id: example.lumen-observatory.evidence.safety-decision
    source_id: example.lumen-observatory.repository
    kind: decision_record
    locator: sources/decisions/001-safety-gate-precedence.md
    observed_at: "2026-08-06T14:20:00Z"
    revision: lumen-pack-0.1.0
    description: The accepted fictional decision establishes fail-closed gate precedence over priority.
  - id: example.lumen-observatory.evidence.safe-hold-operations
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/operations.md
    observed_at: "2026-08-06T14:20:00Z"
    revision: lumen-pack-0.1.0
    description: The operations source defines hold behavior and recovery preconditions after gate closure.
  - id: example.lumen-observatory.evidence.acceptance-tests
    source_id: example.lumen-observatory.repository
    kind: test
    locator: sources/test-matrix.md
    observed_at: "2026-08-06T14:20:00Z"
    revision: lumen-pack-0.1.0
    description: The acceptance matrix demonstrates closed and missing safety-status failure paths.
claims:
  - id: example.lumen-observatory.claim.fail-closed-gates
    statement: A closed, missing, or stale required safety-gate status is treated as closed for eligibility.
    epistemic_status: historical_knowledge
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.safety-decision]
  - id: example.lumen-observatory.claim.priority-cannot-bypass
    statement: Increasing request priority cannot bypass a safety gate because gating occurs before queue arbitration.
    epistemic_status: supported_conclusion
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.safety-decision, example.lumen-observatory.evidence.acceptance-tests]
  - id: example.lumen-observatory.claim.active-execution-holds
    statement: Gate closure during execution requires a confirmed hold before recovery can begin.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.safe-hold-operations]
relationships:
  - type: constrains
    target_kind: knowledge
    target: example.lumen-observatory.domain.observation-lifecycle
    rationale: The constraint controls whether a submitted request may enter the eligible state.
  - type: validated_by
    target_kind: external
    target: sources/test-matrix.md
    rationale: The acceptance matrix contains the fail-closed and priority-precedence cases.
freshness:
  last_verified_at: "2026-08-06T14:20:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/decisions/001-safety-gate-precedence.md
      description: A replaced safety decision may change precedence or missing-status behavior.
    - type: event
      value: safety-gate-policy-changed
      description: Any change in required gates or freshness thresholds requires immediate review.
provenance:
  created_at: "2026-08-06T14:20:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:20:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Safety Gates Precede Scheduling

## Decision And Constraint

Safety is a prerequisite for eligibility, not another sorting signal. Closed, missing, and stale
statuses all exclude a request before the scheduler sees it.

## Runtime Consequence

A closure during active execution has a different consequence: the coordinator requests and
confirms a hold. Reopening a gate does not by itself authorize resume because time fit and hold
confirmation must also be checked.

## Verification

Review the accepted decision, operations procedure, and negative acceptance cases. They jointly
support precedence, active-execution behavior, and the prohibition on priority bypass.

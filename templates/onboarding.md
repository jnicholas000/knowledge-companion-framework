---
schema_version: "1.0"
id: "{{pack-id}}.onboarding.{{slug}}"
title: "{{onboarding path title}}"
kind: onboarding
knowledge_areas: [identity, architecture, code, operational]
summary: "{{audience, starting point, and practical capability this learning path develops}}"
status: draft
owners: ["{{owner-id}}"]
tags: [onboarding]
applies_to: ["{{learned path or glob}}"]
evidence: []
claims:
  - id: "{{pack-id}}.claim.{{slug}}-outcome"
    statement: "{{supported statement describing what a learner can do after completing the path}}"
    epistemic_status: uncertainty
    confidence: low
    evidence_refs: []
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - { type: path_changed, value: "{{learned path or glob}}", description: "{{why the learning path must be rechecked}}" }
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by: { id: "{{actor-id}}", type: human }
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by: { id: "{{actor-id}}", type: human }
---

# {{Onboarding Path Title}}

## Learning Outcomes

State the observable knowledge and practical capability the learner should demonstrate. Separate
orientation outcomes from the bounded work they will be ready to perform.

## Prerequisites

List required access, prior concepts, setup, and source records. Name a safe stop or alternate route
for a learner who does not meet a prerequisite.

## Progressive Concept Path

Order concepts from foundational vocabulary and boundaries through system relationships and change
consequences. For each stage, link the accepted knowledge and evidence the learner should inspect.

## Learner Questions

Provide questions that reveal whether the learner can explain why the system behaves as documented,
not merely repeat names or steps. Include where the learner should find evidence for each answer.

## Exercises

Give small, observable exercises that build toward the practical mission. Include expected evidence,
safe boundaries, and recovery or escalation guidance where an exercise can affect a real system.

## Existing-System Code Tour

Link a `code_tour` record when one exists, or provide an ordered, editor-neutral tour that follows
the same profile. Identify stable stops, typed relationships and branches, source references, tests,
operational context, and change risks. Explain existing behavior only; do not put the practical
mission's implementation sequence in this section.

## Practical Mission Guide

Link a `mission_guide` record when one exists, or provide a bounded practical mission that follows
the same profile. State the outcome, scope, affected surfaces, sequence, testing and completion
evidence, observability, deployment or non-deployment boundary, rollback or recovery, risks, and
stop conditions.

## Verification

Define how a learner demonstrates the outcomes through explanations, evidence-backed decisions,
and the practical result. Distinguish automated, observable, and reviewer-confirmed checks.

## Next Routes

Point to the next learning paths, deeper Code Tours, Mission Guides, or knowledge records. Include a
route for gaps revealed by verification instead of assuming every learner should continue forward.

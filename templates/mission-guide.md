---
schema_version: "1.0"
id: "{{pack-id}}.mission-guide.{{slug}}"
title: "{{mission title}}"
kind: mission_guide
knowledge_areas: [architecture, code, operational]
summary: "{{outcome, audience, and scope of this mission guide}}"
status: draft
owners: ["{{owner-id}}"]
tags: [mission-guide]
applies_to: ["{{affected path or glob}}"]
evidence: []
claims:
  - id: "{{pack-id}}.claim.{{slug}}-scope"
    statement: "{{supported statement that defines the mission's safe scope}}"
    epistemic_status: uncertainty
    confidence: low
    evidence_refs: []
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - { type: path_changed, value: "{{affected path or glob}}", description: "{{why the guide must be rechecked}}" }
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by: { id: "{{actor-id}}", type: human }
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by: { id: "{{actor-id}}", type: human }
---

# {{Mission Title}}

## Outcome And Audience

Define what becomes true, who will execute the mission, and the expected starting knowledge.

## Prerequisites And Stop Conditions

List required access, verified assumptions, dependencies, and stop conditions.

## Scope Decisions

State what is included, excluded, product- or application-specific, and still unknown.

## Affected Repositories And Applications

Name every affected repository and application, including evidence-backed reasons and explicit
non-impacts where they matter.

## Affected Systems And Surfaces

Name affected systems, folders, services, APIs, data flows, and their relationships; link knowledge
record IDs and source evidence rather than copying canonical explanations.

## Implementation Sequence

Provide ordered, bounded steps. For each step name the purpose, likely surface, evidence of
completion, and rollback or recovery point.

## Testing And Completion Evidence

Separate automated, observable, and manual checks. Include failure-path expectations.

## Observability

State required logs, metrics, traces, alerts, dashboards, or an evidence-backed reason no change is
needed.

## Deployment And Rollback

Describe authority, preflight checks, rollout order, observation, rollback, and post-deployment
evidence. Mark non-applicable concerns explicitly.

## Risks, Common Mistakes, And Escalation

State what can invalidate the guide, common failure patterns, and when the executor should stop
rather than infer.

## Estimation Factors

List the scope drivers, assumptions, unknowns, dependencies, comparable completed work, exclusions,
and likely variance factors that an evidence-backed estimate should consider. Do not embed an
unsupported point estimate.

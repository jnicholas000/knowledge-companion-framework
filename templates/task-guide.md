---
schema_version: "1.0"
id: "{{pack-id}}.task-guide.{{slug}}"
title: "{{task title}}"
kind: task_guide
knowledge_areas: [code, operational]
summary: "{{repeatable task, safe boundary, and intended operator}}"
status: draft
owners: ["{{owner-id}}"]
tags: [task-guide]
applies_to: ["{{affected path or glob}}"]
evidence: []
claims:
  - id: "{{pack-id}}.claim.{{slug}}-precondition"
    statement: "{{statement describing a critical task precondition}}"
    epistemic_status: uncertainty
    confidence: low
    evidence_refs: []
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - { type: path_changed, value: "{{affected path or glob}}", description: "{{why changes require revalidation}}" }
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by: { id: "{{actor-id}}", type: human }
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by: { id: "{{actor-id}}", type: human }
---

# {{Task Title}}

## Use When / Do Not Use When

Define the safe applicability boundary.

## Preconditions

List access, system state, knowledge records, and backups or recovery points.

## Procedure

Give ordered steps with observable outcomes. Never hide a destructive or externally visible action
inside a generic step.

## Verification

State exact success behavior, failure behavior, and any manual checks.

## Recovery

Explain how to stop, resume, or restore a coherent state.

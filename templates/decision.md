---
schema_version: "1.0"
id: "{{pack-id}}.decision.{{slug}}"
title: "{{decision title}}"
kind: decision
knowledge_areas: [architecture, historical]
summary: "{{decision, scope, and primary reason in one sentence}}"
status: draft
owners:
  - "{{owner-id}}"
tags:
  - decision
applies_to:
  - "{{affected path or glob}}"
evidence:
  - id: "{{pack-id}}.evidence.{{decision-source}}"
    source_id: "{{source-id declared in pack.yaml}}"
    kind: decision_record
    locator: "{{relative source path or durable URL}}"
    observed_at: "{{ISO-8601 timestamp}}"
    description: "{{where the decision and rationale were recorded}}"
claims:
  - id: "{{pack-id}}.claim.{{decision-slug}}"
    statement: "{{the decision that was made}}"
    epistemic_status: historical_knowledge
    confidence: high
    evidence_refs:
      - "{{pack-id}}.evidence.{{decision-source}}"
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - type: path_changed
      value: "{{affected path or glob}}"
      description: "{{why this change may invalidate the decision's current applicability}}"
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by: { id: "{{actor-id}}", type: human }
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by: { id: "{{actor-id}}", type: human }
---

# {{Decision Title}}

## Context

What forces and constraints made a decision necessary?

## Decision

What was selected, for which scope, and from when?

## Alternatives Considered

Compare credible alternatives and state why they lost. Do not invent ceremonial alternatives.

## Consequences

List positive, negative, and operational consequences.

## Revisit Triggers

Name observable conditions that should reopen this decision.

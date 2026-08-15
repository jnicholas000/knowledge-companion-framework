---
schema_version: "1.0"
id: "{{pack-id}}.code-tour.{{slug}}"
title: "{{tour title}}"
kind: code_tour
knowledge_areas: [architecture, code]
summary: "{{flow and audience covered by this ordered code tour}}"
status: draft
owners: ["{{owner-id}}"]
tags: [code-tour]
applies_to: ["{{toured path or glob}}"]
evidence: []
claims:
  - id: "{{pack-id}}.claim.{{slug}}-entry"
    statement: "{{statement describing the verified entry point}}"
    epistemic_status: uncertainty
    confidence: low
    evidence_refs: []
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - { type: path_changed, value: "{{toured path or glob}}", description: "{{why changes require retouring}}" }
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by: { id: "{{actor-id}}", type: human }
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by: { id: "{{actor-id}}", type: human }
---

# {{Tour Title}}

## Orientation

Explain the flow, prerequisites, and why these stops form one coherent tour.

## Stop 1 — {{File Or Symbol}}

- Location: `{{path and optional line/symbol}}`
- Purpose: {{why this stop exists}}
- Observe: {{what the reader should learn}}
- Source references: {{evidence IDs or repository locators supporting this stop}}
- Outgoing edges: {{typed execution, data, dependency, or control-flow relationships to later stops}}

## Stop 2 — {{File Or Symbol}}

Repeat the structure for each stop. Prefer semantic symbols and evidence locators over brittle line
numbers.

## Relationship Map And Branches

Represent alternate, fan-out, and fan-in paths explicitly. Preserve the primary reading order while
linking graph-oriented relationships through stable stop labels and knowledge relationships.

## Tests And Operational Context

Name the tests that protect the flow, observable runtime signals, failure modes, and operational
surfaces relevant to understanding existing behavior.

## Recap And Change Risks

Summarize the existing flow, related decisions, source references, and changes that would make the
tour stale. Do not turn this section into an implementation sequence or Mission Guide.

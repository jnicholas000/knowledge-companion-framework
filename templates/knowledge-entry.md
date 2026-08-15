---
schema_version: "1.0"
id: "{{pack-id}}.{{kind}}.{{slug}}"
title: "{{title}}"
kind: concept
knowledge_areas: ["{{identity | domain_model | architecture | code | business | operational | historical}}"]
summary: "{{one-sentence scope and purpose, at least twenty characters}}"
status: draft
owners:
  - "{{owner-id}}"
tags: []
applies_to:
  - "{{repository/path/or/glob}}"
evidence:
  - id: "{{pack-id}}.evidence.{{source-slug}}"
    source_id: "{{source-id declared in pack.yaml}}"
    kind: source_file
    locator: "{{relative/source/path}}"
    observed_at: "{{ISO-8601 timestamp}}"
    revision: "{{source revision}}"
    description: "{{what was observed and why it is relevant}}"
claims:
  - id: "{{pack-id}}.claim.{{claim-slug}}"
    statement: "{{one independently reviewable statement}}"
    epistemic_status: verified_fact
    confidence: high
    evidence_refs:
      - "{{pack-id}}.evidence.{{source-slug}}"
relationships: []
freshness:
  last_verified_at: "{{ISO-8601 timestamp}}"
  review_after: "{{YYYY-MM-DD}}"
  invalidation_triggers:
    - type: path_changed
      value: "{{repository/path/or/glob}}"
      description: "{{why this change may invalidate the record}}"
provenance:
  created_at: "{{ISO-8601 timestamp}}"
  created_by:
    id: "{{actor-id}}"
    type: human
  last_modified_at: "{{ISO-8601 timestamp}}"
  last_modified_by:
    id: "{{actor-id}}"
    type: human
---

# {{Title}}

## Scope

State what this record explains and what it intentionally excludes.

## Explanation

Explain the knowledge for a new reader. Tie important statements to the claim IDs above when the
connection is not obvious.

## Boundaries And Consequences

Describe constraints, downstream effects, and situations where this knowledge does not apply.

## Verification

Explain how a reviewer can re-check the evidence and what would invalidate the record.

---
schema_version: "1.0"
id: example.authoring-corpus.concept.record
title: Authoring corpus record
kind: concept
knowledge_areas: [identity]
summary: A valid control record for authoring diagnostic corpus mutations.
status: accepted
owners: [example.maintainer]
tags: [authoring]
applies_to: [sources/source.md]
evidence:
  - id: example.authoring-corpus.evidence.source
    source_id: example.authoring-corpus.repository
    kind: source_file
    locator: sources/source.md
    observed_at: "2026-08-07T12:00:00Z"
    revision: fixture-v1
    description: The checked-in source defines this fictional record.
claims:
  - id: example.authoring-corpus.claim.source
    statement: The corpus control record is intentionally minimal and fictional.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.authoring-corpus.evidence.source]
relationships: []
freshness:
  last_verified_at: "2026-08-07T12:00:00Z"
  review_after: "2027-08-07"
  invalidation_triggers:
    - type: path_changed
      value: sources/source.md
      description: Review when the corpus source changes.
provenance:
  created_at: "2026-08-07T12:00:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-07T12:00:00Z"
  last_modified_by: { id: example.maintainer, type: human }
---

# Authoring Corpus Record

This record is the valid control replaced by one invalid draft per corpus test.

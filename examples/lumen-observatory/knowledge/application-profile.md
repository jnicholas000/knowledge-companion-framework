---
schema_version: "1.0"
id: example.lumen-observatory.identity.application
title: Lumen Application Profile
kind: concept
knowledge_areas: [identity, business]
summary: Lumen schedules fictional telescope observations while leaving device control and scientific processing outside its boundary.
status: accepted
owners: [example.maintainer]
tags: [application-profile, observatory, scheduling]
applies_to: [sources/application-profile.md]
evidence:
  - id: example.lumen-observatory.evidence.application-profile
    source_id: example.lumen-observatory.repository
    kind: source_file
    locator: sources/application-profile.md
    observed_at: "2026-08-06T14:10:00Z"
    revision: lumen-pack-0.1.0
    description: The fictional application profile defines Lumen's purpose, users, and system boundary.
claims:
  - id: example.lumen-observatory.claim.scheduling-boundary
    statement: Lumen schedules and reports observation-request state but does not drive telescope motors or manage scientific data products.
    epistemic_status: verified_fact
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.application-profile]
  - id: example.lumen-observatory.claim.fairness-unknown
    statement: The fixture does not establish whether queue ordering prevents starvation of repeatedly deferred long-duration requests.
    epistemic_status: uncertainty
    confidence: high
    evidence_refs: [example.lumen-observatory.evidence.application-profile]
relationships:
  - type: related_to
    target_kind: knowledge
    target: example.lumen-observatory.domain.observation-lifecycle
    rationale: The lifecycle record explains the central request managed inside the application boundary.
freshness:
  last_verified_at: "2026-08-06T14:10:00Z"
  review_after: "2027-02-01"
  invalidation_triggers:
    - type: path_changed
      value: sources/application-profile.md
      description: A change to users, purpose, or excluded responsibilities can invalidate this profile.
    - type: manual
      value: application-boundary-review
      description: Review is required if a consumer proposes physical control or data-product ownership.
provenance:
  created_at: "2026-08-06T14:10:00Z"
  created_by: { id: example.maintainer, type: human }
  last_modified_at: "2026-08-06T14:10:00Z"
  last_modified_by: { id: example.maintainer, type: human }
extensions:
  example.lumen-observatory:
    fixture_role: application-profile
---

# Lumen Application Profile

## Scope

Lumen accepts observation requests, determines eligibility, selects one request, reserves it, and
coordinates execution through an external control boundary. Proposal coordinators, night
operators, and instrument specialists use the modeled application.

## Boundaries

Physical motion, weather forecasting, and scientific data processing remain outside Lumen. Those
boundaries matter because a scheduler outcome is not proof that hardware moved or data was
captured.

## Explicit Unknown

The sources define deterministic ordering but no fairness or starvation guarantee. Consumers must
retain that uncertainty instead of translating stable sorting into a service-level promise.

## Verification

Compare the purpose, users, and exclusions with `sources/application-profile.md`. Re-review this
record if the fictional source assigns Lumen a new external responsibility.

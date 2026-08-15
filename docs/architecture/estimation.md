# Estimation Architecture

## Purpose

Estimation is an evidence-backed reasoning mode, not a number generator. It should show what work is
included, why the range has its shape, which facts or analogues support it, and what would change the
estimate.

## Contract

An estimate contains:

- a stable subject and knowledge snapshot
- evidence and comparable work references
- explicit assumptions with epistemic status and confidence
- independently estimable work items
- low, likely, and high values in one declared unit
- primary drivers, material unknowns, risks, exclusions, and likely variance factors
- comparable completed work with evidence references, or an explicitly empty set whose absence is
  reflected in confidence and unknowns
- provenance and creation time

The aggregate range is derived from work items. A validator checks ordering (`low ≤ likely ≤ high`)
but does not claim statistical certainty or force a universal aggregation method.

## Process

1. Define the deliverable and completion evidence.
2. Load relevant architecture, implementation patterns, dependencies, tests, and historical work.
3. Separate verified scope from assumptions and unknowns.
4. Decompose the work at dependency and verification boundaries.
5. Identify comparable completed work and explain why each analogue applies.
6. Estimate each item as a three-point range.
7. Record correlation or integration effects in the method rather than blindly summing optimistic
   values.
8. State primary drivers, assumptions, unknowns, exclusions, and likely variance factors, including
   triggers that require re-estimation.
9. Emit both an `estimate` record and, when answering a query, a `reasoning-response` whose claims
   point to that record.

## Units

Core units are `hours`, `person_days`, and `story_points`, all expressed as numeric three-point
ranges. Categorical sizing can be added in a namespaced extension until repeated use justifies a
dedicated contract. Do not convert story points to time without a team-specific, evidenced
calibration.

## Confidence

Confidence describes evidence quality and scope stability:

- `high`: scope and dependencies are verified; close analogues exist; no mission-critical unknowns.
- `medium`: meaningful evidence exists, with bounded novelty or dependency uncertainty.
- `low`: key scope, integration, or operational facts remain uncertain.

Confidence does not narrow a range automatically. The reason for confidence must be recorded.

## Calibration And Evaluation

Future estimation evaluation compares forecast ranges with observed work while retaining scope
changes and interruptions. Useful measures include range hit rate, directional bias, interval width,
and calibration by confidence level. Raw elapsed time alone is not a fair actual when scope changed.

Estimates are immutable observations. Re-estimation creates a new record related by `supersedes`; it
does not rewrite the prior forecast after outcomes are known.

## Failure Modes To Avoid

- single-point estimates presented as certainty
- estimates without completion criteria or exclusions
- hidden assumptions disguised as verified facts
- unsupported precision
- treating generated plans as historical evidence
- copying another team's velocity or point-to-time conversion
- updating the original estimate to make retrospective accuracy look better

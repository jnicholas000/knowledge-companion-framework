# Evaluation Architecture

## Purpose

The framework must be able to evaluate knowledge and system behavior without letting the component
under test grade itself invisibly. Evaluation cases define repeatable inputs and expectations;
evaluation results preserve observations, scores, limitations, and version identity.

## Quality Dimensions

| Dimension | Question |
| --- | --- |
| `knowledge_quality` | Are claims clear, scoped, non-duplicative, and appropriately classified? |
| `reasoning_quality` | Do conclusions follow from cited evidence and expose uncertainty? |
| `retrieval_quality` | Were the relevant records returned without material distractors? |
| `mission_quality` | Is a guide accurate, actionable, sequenced, and audience-appropriate? |
| `estimation_quality` | Are scope, evidence, ranges, uncertainty, and calibration sound? |
| `freshness` | Are due reviews and invalidating changes visible and handled? |
| `coverage` | Does the pack cover the concepts, flows, decisions, and risks it claims to cover? |
| `evidence` | Are claims traceable to available sources that actually support them? |

## Evaluation Cases

A case fixes:

- query or task and reasoning mode
- audience and fixture snapshot
- required and prohibited observable behaviors
- dimension weights and pass threshold
- evaluator method: deterministic, rubric, human, model-assisted, or hybrid

Expectations should prefer stable semantics over exact prose. For example, require that a trace names
all four components and cites two source files; do not require one exact paragraph.

## Evaluation Results

A result identifies the case, system under test, pack version, knowledge snapshot, evaluator, and
time. Each dimension contains a 0–1 score, observations, and evidence references. The weighted score
and outcome are derived, but raw observations remain available for audit.

Model-assisted evaluators record model/provider identity and prompt or rubric revision under a
namespaced extension. Their score is evidence about output quality, not a verified fact.

## Evaluation Levels

1. Contract conformance: schemas, IDs, links, and lifecycles are valid.
2. Fixture correctness: the case's expected facts are independently reviewed.
3. Component evaluation: retrieval, reasoning, learning, or delivery is tested in isolation.
4. End-to-end evaluation: a consumer task is executed against a fixed snapshot.
5. Longitudinal evaluation: freshness, coverage, learning latency, and estimation calibration are
   measured over time.

Phase One implements Level 1 for the example pack and supplies contracts for the remaining levels.

## Phase Two Static Evaluation Evidence

Phase Two adds an experimental reviewed static evaluator outside the public schemas. Six cases span
the core reasoning modes across two fixed content-derived pack snapshots. A fixture-local registry
pins complete case and output artifacts, and evaluated context contains only the reviewed query,
snapshot identity, and exact allowlisted record bytes. Grounded controls pass while known-bad,
identity, version, evidence, uncertainty, dimension, answer-key, and aggregate-masking controls fail
or reject. Change normalization and impact classification are evaluated separately as components.

This is exact-artifact fixture evidence, not semantic grading of arbitrary prose, live retrieval or
reasoning-provider evaluation, model benchmarking, signing/authentication, or a production trust
service. The evaluation case/result schemas remain unchanged because the fixture registry and
component shapes have only one experimental consumer.

Fixture accountability timestamps must be real RFC 3339 calendar timestamps and are included in
the reviewed case digest. Validation is deliberately deterministic: it does not consult a runtime
clock or infer whether a timestamp is later than the review event it describes. Proving temporal
ordering beyond a durable commit boundary would require a larger provenance contract with an
explicit event source or signed record; that remains outside the Phase Two static evaluator.

## Anti-Gaming Rules

- Test fixtures are versioned separately from production knowledge.
- Evaluators cite observations; scores without evidence are invalid.
- Unknown or blocked checks lower coverage rather than becoming implicit passes.
- A system does not receive hidden answer keys as retrieval context.
- Changing a rubric or fixture creates a new case version.
- Aggregate scores never erase dimension-level failures or safety/evidence findings.

## Future Baselines

Before optimizing a retrieval or reasoning provider, establish a small, reviewed case set across
explain, compare, trace, debug, estimate, and plan modes. Coverage should include architecture,
business behavior, debugging, deployment, impact analysis, mission guidance, unsupported-claim
resistance, source grounding, retrieval quality, and freshness. Add cases from real failures. A
second independent application pack should be present before treating any benchmark as
framework-wide.

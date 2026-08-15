# Decision 001: Safety Gates Precede Queue Arbitration

- Status: accepted
- Decided: 2026-08-06
- Owner: `example.maintainer`

## Context

Lumen needs deterministic queue ordering, but selecting a high-priority request while weather or
equipment status is unsafe would make ordering override execution safety.

## Decision

Eligibility applies all safety gates before queue arbitration. A closed, missing, or stale gate
status is treated as closed. Priority can order only requests that are already eligible.

## Consequences

The Scheduler receives fewer candidates and does not interpret sensor status. Tests must show that
a higher-priority unsafe request is excluded rather than selected. Operators cannot bypass a gate
by changing request priority.

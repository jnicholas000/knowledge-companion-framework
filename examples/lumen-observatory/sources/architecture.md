# Lumen Event-Driven Architecture

## Components

The Request API validates submission shape and appends request events. The Eligibility Projector
combines request state, the instrument catalog, the UTC clock, and safety-gate events into an
eligibility view. The Scheduler selects one eligible request and asks the Reservation Ledger to
reserve it atomically. The Execution Coordinator converts a reservation into a command for the
external telescope-control boundary and records the resulting execution events.

## Dependency Direction

The Scheduler reads the eligibility view and writes through the Reservation Ledger port. It does
not read weather sensors, inspect instrument catalog files, or send telescope-control commands.
The Execution Coordinator depends on the Reservation Ledger and telescope-control port, not on the
Request API.

## Event Sequence

A normal request flows through `request.submitted`, `request.eligible`, `request.reserved`,
`execution.started`, and `execution.completed`. Safety closure produces `safety.closed`; the
Eligibility Projector marks unreserved requests ineligible, while the Execution Coordinator moves
an active execution to a hold before acknowledging the closure.

## Failure Boundaries

Reservation conflicts cause the Scheduler to refresh and choose again. A rejected telescope-control
command fails the reserved request and preserves the rejection reason. Loss of safety status is
fail-closed: no new reservation is issued until a fresh open status is observed.

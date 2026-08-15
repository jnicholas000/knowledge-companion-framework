# Lumen Safe-Hold Operations

## Entering A Hold

Wind, precipitation, or equipment gates may close. A closure makes queued requests ineligible and
requires an active execution to acknowledge `hold.requested`. The operator sees the gate ID,
observation request ID, last status time, and whether the external telescope-control boundary
confirmed the hold.

## Recovery Preconditions

Recovery requires a fresh `safety.open` event for every gate, a confirmed telescope-control hold,
and an observation window with enough remaining duration. Operators may not edit gate state or
extend a window to force recovery.

## Resume Or Release

If all preconditions hold, the operator may resume the same reservation. Otherwise the operator
releases it; Lumen returns the request to `submitted` when another valid window remains or marks it
failed when none remains. The action and rationale are recorded as an operator event.

## Escalation

Stop recovery when any gate timestamp is missing, the telescope-control hold is unconfirmed, or
the remaining-window calculation is unavailable. Escalate to the fictional instrument specialist
for catalog disagreement and to the fictional controls maintainer for command rejection.

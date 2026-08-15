# Lumen Scheduling Domain Model

## Observation Request

An observation request has a stable request ID, target label, required duration, observing window,
instrument configuration, priority, and lifecycle state. The lifecycle is `submitted`, `eligible`,
`reserved`, `executing`, then `completed` or `failed`. A submitted request becomes eligible only
while its observing window is open, its configuration is supported, and all safety gates are open.

## Observing Window

An observing window is a half-open UTC interval: its start is included and its end is excluded. A
request is eligible only when its full required duration fits before the interval end. Overlapping
windows do not create a dependency between requests.

## Queue Arbitration

Among eligible requests, higher numeric priority sorts first. Equal-priority requests sort by
earliest window end and then stable request ID. Arbitration chooses a request; it does not override
safety gates or shorten the requested duration.

## Instrument Configuration

An instrument configuration names an instrument mode and its setup profile. Only configurations in
the supported catalog can become eligible. Changing that catalog requires instrument-specialist
review and corresponding eligibility tests.

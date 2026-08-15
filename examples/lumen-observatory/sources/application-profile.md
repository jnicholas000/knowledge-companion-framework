# Lumen Application Profile

## Purpose

Lumen is a fictional observatory scheduling application. Proposal coordinators submit observation
requests, operators supervise execution, and instrument specialists maintain supported instrument
configurations. The application selects eligible requests for one simulated telescope; it does not
drive physical motors, forecast weather, or manage scientific data products.

## Application Boundary

Lumen accepts an observation request containing a target label, an observing window, a required
duration, and an instrument configuration. It reports lifecycle state and the reasons a request is
not eligible. A separate telescope-control boundary receives an execution command only after Lumen
has reserved an eligible request.

## Ownership And Users

The fictional `example.maintainer` owns the application profile and fixture facts. Proposal
coordinators, night operators, and instrument specialists are the modeled users. No real people,
organizations, repositories, or facilities are represented.

## Known Unknown

The fixture does not define a fairness guarantee for repeatedly deferred long-duration requests.
Consumers must not infer one from queue ordering.

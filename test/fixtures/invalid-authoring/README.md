# Invalid Authoring Corpus

This corpus replays the structural failures exercised by Phase Two Milestone 1: missing manifest
metadata, unknown relationships, undeclared extensions, unknown evidence sources, missing local
evidence, overdue freshness, and cross-pack snapshot identity. The malformed-front-matter case
retains clearly necessary fail-closed parser coverage required by the Phase Two plan.

Tests copy `base-pack/` to a temporary directory and apply exactly one checked-in `before`/`after`
mutation from `corpus.json`. The same entry records the stable diagnostic code, file, and JSON
Pointer expected from the materialized invalid draft. The baseline remains valid so every failure
can be attributed to its one authoring mutation.

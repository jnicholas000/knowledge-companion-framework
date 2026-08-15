# Authoring And Diagnostics

KCF schemas and the repository-local CLI are the canonical validation path. Editor feedback is an
optional early signal, not acceptance evidence.

## Canonical Workflow

Use the same loop for every pack and editor:

1. Author or edit a record.
2. Save the file.
3. Run `node src/cli.js validate path/to/pack --strict`.
4. Fix each reported location and rerun until the pack is strict-clean.
5. Perform semantic review before accepting knowledge.

Use `--json` for tools. Do not parse the human console format.

## Diagnostic Envelope

Every error and warning in the JSON result contains:

| Field | Meaning | Stability |
| --- | --- | --- |
| `severity` | `error` or `warning` after strict-mode promotion. | Stable classification for a given validation mode. |
| `code` | Machine-readable failure category such as `reference.knowledge_missing`. | Stable and suitable for tests or integrations. |
| `path` | File path relative to the pack, or the supplied pack path for root failures. | Deterministic for the same pack layout. |
| `instance_path` | JSON Pointer to the relevant structured field; `/` means the file/root as a whole. | Stable and suitable for field navigation. |
| `message` | Concise description of the observed failure. | Human-facing wording is not contractual. |
| `guidance` | A corrective action that does not weaken the validation rule. | Presence and intent are stable; exact prose is not contractual. |

Human output renders these same diagnostic objects as
`SEVERITY code file#/pointer: message Fix: guidance`. JSON is the integration format and includes
the complete ordered result.

## Optional Schema-Aware YAML Editing

The checked-in `knowledge-companion-framework.code-workspace` associates structured YAML files with
their canonical schemas for Visual Studio Code plus the commonly used YAML extension. Open that
workspace and accept or install the recommended `redhat.vscode-yaml` extension to receive early
feedback for pack manifests, retrieval fixtures, learning records, estimates, evaluation records,
and reasoning responses. Structured-record associations mirror the recursive discovery globs in
`pack.yaml`, so both direct-child and nested record layouts receive the same schema feedback.

The mapping is removable metadata:

- it defines no schema meaning;
- it is not loaded by `src/` or CI;
- the standalone validation proof deliberately removes the workspace file before running the full
  repository-local gate; and
- another editor may associate the same file globs with the same files under `schemas/v1/`.

Schema feedback is necessarily partial. Cross-file checks—such as whether an `x-...` relationship
is declared by `pack.yaml`, whether referenced IDs exist, whether evidence files resolve, and
whether snapshots stay within one pack—remain CLI responsibilities.

KCF Markdown knowledge uses YAML front matter. The repository does not claim a reliable generic
schema association for YAML embedded inside Markdown, and it does not ship a custom editor plugin.
For those records, use the canonical save -> run validator -> fix diagnostics loop.

## Manifest Content Groups

`pack.yaml` requires every canonical content group even when a pack has no files of that type. Use
an explicit empty array (`[]`) rather than omitting a group. This makes discovery intent reviewable
and keeps every pack on the same canonical path; it does not require placeholder records.

## Manual Semantic Review

Structural success does not prove:

- that evidence supports the prose or claim;
- that a claim is factually correct;
- that an interpretation is reasonable; or
- that uncertainty is represented appropriately.

A reviewer must compare accepted prose and claims with their cited sources. Evaluation-evidence
relevance also remains review-owned until separately authorized evaluation-maturity work supplies a
portable rule. Do not advance a freshness date without performing that review.

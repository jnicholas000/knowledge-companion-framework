# Knowledge Companion Framework

Knowledge Companion Framework is a standalone, contract-first foundation for building institutional
memory for software systems. It gives human readers and AI reasoning systems the same versioned
knowledge, evidence, provenance, relationships, freshness signals, and review history without
depending on chat history or an external orchestration system.

The framework provides schemas, authoring contracts, delivery templates, learning and evaluation
seams, a reference validator, and two fictitious example packs. It contains no ISP knowledge,
retrieval engine, embeddings, web UI, hosted service, or automatic knowledge mutation.

The repository supports standard GitHub Copilot use through its checked-in instructions,
documentation, npm commands, tests, and GitHub Actions workflow. External orchestration is not required.

## Start Here

- [Product vision](docs/vision.md) — long-term intent and desired companion capabilities
- [Architecture](docs/architecture/overview.md) — layers, dependency rules, and lifecycle
- [Contract model](docs/architecture/contracts.md) — formats, identifiers, evidence, and versioning
- [Extension points](docs/architecture/extension-points.md) — replaceable engine ports
- [Continuous learning](docs/architecture/continuous-learning.md) — change-to-review workflow
- [Delivery profiles](docs/architecture/delivery.md) — mission, tour, task, and onboarding outputs
- [Estimation](docs/architecture/estimation.md) — evidence-backed range estimates
- [Evaluation](docs/architecture/evaluation.md) — self-evaluation model
- [Copilot-only adoption](docs/guides/copilot-only-adoption.md) — standard work-fork setup and flow
- [Authoring and diagnostics](docs/guides/authoring.md) — canonical CLI and diagnostics
- [Atlas Notes example](examples/atlas-notes/README.md) — complete fictitious conformance pack
- [Lumen Observatory example](examples/lumen-observatory/README.md) — unrelated fictitious portability pack

## Repository Map

```text
schemas/v1/             Canonical, portable JSON Schema contracts
src/                    Reference validation tooling; no application knowledge
templates/              Human-authoring templates aligned to the schemas
examples/               Fictitious application packs and conformance examples
docs/architecture/      Durable architecture and engine boundaries
docs/guides/            Contributor and adoption guidance
test/                   Validator, contract, and portability tests
```

## Quick Start

Requirements: Node.js 20 or later and npm.

```sh
npm install
npm test
npm run validate
```

Run the consolidated validation gate used by GitHub Actions:

```sh
npm run check:ci
```

Validate another pack:

```sh
node src/cli.js validate path/to/pack --strict
```

`--strict` promotes freshness and quality warnings to errors. `--json` emits stable diagnostic
codes and JSON Pointer locations. See the [authoring guide](docs/guides/authoring.md).

## Core Guarantees

- Application knowledge lives in application packs, never in framework source.
- Every supported conclusion can be traced to evidence and an epistemic classification.
- Dates, provenance, confidence, relationships, and invalidation triggers are structured data.
- Learning suggestions cannot silently become accepted knowledge.
- Schemas are technology-neutral; the Node.js validator is a replaceable reference implementation.
- Extensions are namespaced and additive. They cannot redefine core fields or bypass core checks.
- Core contribution and CI require no external repository, custom agent, or personal workflow.

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing a contract.

## License

The contents distributed in this repository are licensed under the
[Apache License 2.0](LICENSE) unless a file or directory explicitly states otherwise. This includes
the bundled fictional examples.

Application packs created outside this repository may be proprietary, confidential, separately
owned, or differently licensed. Using KCF does not automatically apply Apache-2.0 to external pack
content.

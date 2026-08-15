# Contributing

The framework is contract-first. Changes must preserve portability, explicit evidence, human
reviewability, and application isolation. Standard GitHub Copilot, npm, GitHub pull requests, and
GitHub Actions are sufficient; custom agents and external orchestration are optional.

## Standard Copilot-Only Contribution Flow

1. Read `AGENTS.md`, `docs/vision.md`, `docs/architecture/overview.md`, and the architecture document
   that owns the concept you will change.
2. Define a bounded change with explicit scope, exclusions, acceptance criteria, verification, and
   a stop condition.
3. Implement only that slice while preserving unrelated changes and contract boundaries.
4. Run focused tests and the full validation gate, including failure-path coverage where useful.
5. Open a pull request with scope, exact verification results, limitations, and follow-up work.

This flow requires no custom agent. See the
[Copilot-only adoption guide](docs/guides/copilot-only-adoption.md).

## Working Agreement

- Keep one canonical owner for each concept and link to it instead of copying rules.
- Put application knowledge in a pack; never special-case a domain in `src/` or a core schema.
- Add a schema constraint only when every conforming pack should obey it.
- Treat new required fields or changed meaning as breaking contract changes.
- Update tests, templates, documentation, and examples together for approved contract changes.

## Contract Change Checklist

- Is the change framework-wide rather than application-specific?
- Can humans author and review it without specialized tooling?
- Can another language implement the same contract from the schema and docs?
- Does it preserve evidence and uncertainty?
- Is compatibility impact documented?
- Do positive and negative conformance tests cover it?
- Are templates and examples synchronized?

## Commands

```sh
npm ci
npm test
npm run validate:schemas
npm run validate
npm run check:syntax
npm audit --audit-level=high
git diff --check
npm run check:ci
```

Use `npm run validate -- --json` when integrating the validator with another tool. Do not parse the
human-readable console output. Follow the [authoring guide](docs/guides/authoring.md).

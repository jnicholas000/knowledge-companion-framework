# Copilot-Only Adoption

Use this repository with standard GitHub Copilot, npm, GitHub pull requests, and GitHub Actions. No
custom Copilot agent, external orchestration system, sibling repository, or personal-repository
access is required.

## Retain For A Work Fork

Keep the framework contract and its local evidence:

- `AGENTS.md`, `README.md`, and `CONTRIBUTING.md`
- `docs/architecture/`, `docs/guides/`, and `docs/vision.md`
- `schemas/`, `src/`, `templates/`, `examples/`, and `test/`
- `package.json`, `package-lock.json`, and `.github/workflows/`

## Optional Personal Surfaces

Private source repositories may contain `integrations/starfleet/`, `.github/agents/`, and `.codex/`
as optional personal tooling. Those paths may be removed and are intentionally absent from this
public distribution. Removing them must not change framework behavior or core validation.

## Standard Work Flow

1. Read `AGENTS.md`, `docs/vision.md`, and the relevant architecture docs.
2. Define a bounded change with clear acceptance criteria and exclusions.
3. Implement without adding application facts to framework code or schemas.
4. Run focused tests and the repository validation gate.
5. Open a standard GitHub pull request and let the Validate workflow confirm the same gate.

## Validation

Use Node.js 20 or later and run:

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

## Security And Ownership Boundaries

- Use organization-owned repositories, credentials, access controls, branches, reviews, and CI
  secrets for organization work.
- Do not grant organization automation access to personal repositories.
- Keep application facts in an application-owned pack.
- Review extensions, evidence paths, generated content, and external links against local policy.
- Treat Copilot suggestions as proposed changes; human reviewers retain responsibility.

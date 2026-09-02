# Repository Instructions

This repository contains a long-lived, application-neutral framework, not an application knowledge
base. Repository correctness must be recoverable from this repository alone.

## Source Of Truth

1. `README.md` defines the public entry point and supported use.
2. `docs/vision.md` defines long-term product intent.
3. `docs/architecture/` defines product architecture.
4. Current source and tests provide executable evidence.

## Execution Flow

For non-trivial work:

1. Read `README.md`, `docs/vision.md`, `docs/architecture/overview.md`, and the relevant architecture
   document.
2. Inspect the worktree, preserve unrelated changes, and keep the slice bounded.
3. Implement only the requested scope without redefining product architecture.
4. Add behavioral and failure-path coverage where the risk warrants it.
5. Review correctness, scope, evidence, and remaining risk independently.
6. Run the complete repository validation gate before claiming completion.

GitHub Copilot contributors may follow this flow with standard repository instructions and ordinary
pull requests. Custom agents and external orchestration are not required.

## Commands And Quality Gates

Use Node.js 20 or later. Before completion, run:

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

Also verify local Markdown links, application isolation, strict example-pack validation, and any
slice-specific acceptance criteria.

## Project Boundaries

- Never embed ISP, company, or other application knowledge in `src/`, core schemas, or shared
  templates. Application facts belong in separately owned application packs.
- Prefer portable contracts and namespaced extensions over provider, language, IDE, or domain
  special cases.
- Do not add retrieval providers, embeddings, vector databases, hosted services, user interfaces,
  automatic knowledge mutation, or other deferred capability as incidental cleanup.
- Do not change schemas, validator semantics, fixtures, or product architecture incidentally.
- Preserve unrelated worktree changes and avoid destructive Git operations.

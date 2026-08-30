# Codex Remote Adoption

Use the project-scoped `.codex/config.toml` defaults when this repository is opened in a trusted
Codex session, including remote repository work from a ChatGPT or Codex host that honors project
configuration.

## What The Defaults Do

The checked-in `.codex/config.toml` establishes:

- `sandbox_mode = "workspace-write"` so ordinary repository work can happen in the project
  workspace;
- `approval_policy = "on-request"` so actions outside the sandbox boundary remain approval-gated;
- `approvals_reviewer = "auto_review"` so eligible approval requests can be evaluated by the
  Codex reviewer instead of pausing for a person;
- `model_reasoning_summary = "none"` and `model_verbosity = "low"` to keep routine execution
  output compact; and
- `agents.max_concurrent_threads_per_session = 1` to keep repository work bounded.

The configuration does not enable outbound network access. This is deliberate. Enable network access
only in a user-level configuration or a specific session when the task requires it.

## How To Use It

1. Open the repository in a Codex-compatible host.
2. Mark the project trusted when the host asks for trust.
3. Confirm that the host honors project-scoped `.codex/config.toml`.
4. Work inside the repository and let the normal approval boundary handle actions that need more
   authority.

If the host does not support project-scoped configuration, use the equivalent settings in the
user-level Codex configuration or the host's permission controls.

## Boundaries

This repository configuration is a convenience default, not a security bypass.

- Host, account, and organization-managed settings remain authoritative.
- Auto-review changes who evaluates eligible approval requests. It does not expand filesystem,
  network, or tool permissions.
- Trusted-project loading is required. Untrusted projects skip project-local Codex configuration.
- Destructive operations, secrets, production systems, external mutations, and unclear authority
  still require an explicit stop and review.
- Network access, additional writable roots, and full-access execution are not enabled here.

## Troubleshooting

If routine repository work still prompts frequently:

- verify that the project is trusted;
- verify that the host loaded `.codex/config.toml`;
- check whether the action is actually outside the workspace boundary;
- check whether the prompt comes from an app, MCP server, or organization policy rather than the
  local sandbox; and
- enable network access only when it is required, using the host or user-level configuration.

## References

- [Codex configuration reference](https://developers.openai.com/codex/config-reference)
- [Auto-review](https://developers.openai.com/codex/sandboxing/auto-review)
- [Agent approvals and security](https://developers.openai.com/codex/agent-approvals-security)

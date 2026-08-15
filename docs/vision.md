# Knowledge Companion Framework Vision

## Purpose

The Knowledge Companion Framework is a reusable, application-neutral foundation for building
AI-assisted institutional memory for software systems. Its goal is to help people and AI systems
understand an application, explain why it behaves as it does, and make grounded delivery decisions.

Documentation is one evidence source, not the product by itself. A useful companion connects
architecture, domain concepts, implementation patterns, operations, decisions, history, ownership,
tests, and source evidence while stating uncertainty honestly.

Application-specific knowledge belongs in separately owned knowledge packs. It must not become a
core framework assumption.

## Product Model

The long-term product model has four cooperating capabilities:

1. A knowledge engine represents application facts, provenance, relationships, confidence,
   freshness, and ownership.
2. A reasoning engine explains behavior, traces dependencies, compares implementations, assesses
   likely impact, and exposes missing evidence.
3. A delivery engine turns grounded knowledge into implementation guidance, testing and
   observability needs, deployment notes, risks, and evidence-based effort ranges.
4. A learning engine detects potentially affected knowledge, proposes bounded updates, validates
   them, and preserves human review for interpretive or application-specific decisions.

The same durable knowledge should serve human readers and tool consumers. Markdown should remain
clear to people, while stable identifiers and structured metadata support validation and later
retrieval or reasoning providers.

## Knowledge Areas

An application pack may describe:

- identity, purpose, owners, repositories, dependencies, and glossary;
- domain concepts and their relationships;
- architecture, interfaces, consumers, and failure modes;
- code organization, patterns, tests, and known hazards;
- operational practices, observability, release behavior, and troubleshooting;
- architectural decisions and historical context;
- delivery missions, Code Tours, learning paths, and evaluation cases;
- evidence-based estimates and their assumptions; and
- provenance, confidence, freshness, and unresolved questions.

Knowledge should be split into focused artifacts with stable identities and explicit evidence. A
claim should be distinguishable as verified fact, decision, example, inference, or unknown.

## Evidence And Reasoning

Important claims should be traceable to evidence such as source files, repository revisions,
decisions, incidents, tests, or explicit subject-matter confirmation. Reasoning should prefer
verified facts, label inference, and acknowledge when available evidence is insufficient.

The framework must not manufacture precise estimates. An estimate should provide a range,
confidence, assumptions, primary drivers, unknowns, relevant comparable work, and excluded work.

Code Tours and Mission Tours remain distinct:

- A Code Tour explains how an existing system or flow works.
- A Mission Tour explains how to complete a bounded engineering task, including scope, affected
  areas, sequence, tests, observability, deployment, risks, and completion evidence.

## Learning And Governance

Potential knowledge changes fall into three broad classes:

- Mechanical changes can be verified directly, such as renamed paths or dependency versions.
- Interpretive changes require contextual judgment and human review.
- Subject-matter changes require explicit confirmation from an authorized application owner.

Automatic knowledge mutation is not a foundation capability. Later automation must preserve
review, provenance, reproducibility, and a clear record of accepted, rejected, or deferred changes.

## Framework And Pack Boundary

The framework defines portable contracts, schemas, validation, interchange, evaluation, and
extension seams. It remains application-neutral, provider-neutral, editor-neutral, and tool-neutral.

Application packs contain system-specific knowledge and retain their own ownership and licensing.
The two bundled example packs are fictional validation fixtures; they are not production knowledge
and do not authorize use or disclosure of any external pack.

Optional orchestration, editor adapters, retrieval providers, reasoning providers, hosted services,
and user interfaces must remain separable from framework correctness. They may be introduced only
through evidence-gated, explicitly authorized work.

## Development Sequence

The foundation establishes contracts, schemas, templates, validation, architecture boundaries,
provenance, confidence, learning-state contracts, estimation contracts, and fictional examples.

Further work pressure-tests portability across unrelated fictional packs and experiments with
bounded interchange, impact assessment, and static evaluation. Later capabilities such as
retrieval, provider-backed reasoning, automated learning, or hosted consumers require separate
plans and evidence.

## Definition Of Success

The framework succeeds when an application companion can reliably help a human or AI system:

- explain a system and cite the evidence supporting important claims;
- trace behavior and identify affected components;
- find appropriate implementation patterns;
- assess likely impact and state uncertainty;
- prepare an implementation and validation plan;
- identify testing, observability, deployment, and operational needs;
- teach a new contributor through focused learning artifacts;
- evaluate whether answers remain grounded and useful; and
- identify stale knowledge and propose reviewable updates.

The long-term goal is durable institutional memory that remains understandable, verifiable,
portable, and governed by the people responsible for each application.

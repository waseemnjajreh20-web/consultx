# AGENTS.md

## Operating Rules

- Do not move to the next task until the current task is fully finished and verified.
- Do not revisit closed phases unless a real contradiction is proven.
- Do not touch unrelated files.
- Do not start UI, backend handlers, or migration SQL until the current documentation/spec phase is fully closed.
- Prefer updating existing structures over rebuilding.
- Be explicit about what is created, what is updated, and what remains unresolved.

## Current Project Goal

Build the institutional/enterprise operating layer for ConsultX for consultancy offices.

## Current Active Phase

Phase 1 docs are CLOSED (see `docs/enterprise/`).
Next work: surgical product passes — billing completion, Supabase integration, verification flows, frontend fixes.

## Hard Constraints

- No broad refactors.
- No subscription logic rewrite unless explicitly scoped.
- No schema migrations without a plan presented and confirmed first.
- No moving to a new phase until the current phase is fully closed.

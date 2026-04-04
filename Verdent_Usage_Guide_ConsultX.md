# Verdent for ConsultX — Recommended Usage Guide

## Why this setup
Verdent works best when you separate:
- persistent project rules
- task-specific prompts
- planning vs execution
- isolated parallel workspaces for risky changes

For ConsultX, the best setup is:
- `AGENTS.md` in the project root for stable project rules
- Plan Mode for large changes
- Agent Mode for surgical execution
- separate workspaces for risky UI / backend / agent-logic work

## 1) Put AGENTS.md in the project root
Recommended location:
- `<project-root>/AGENTS.md`

For your current project, that means the file should live in the root of the repository that Verdent opens as the active project.

## 2) Start complex work in Plan Mode first
Use Plan Mode for:
- large refactors
- shell redesigns
- multi-file UX changes
- backend/frontend alignment work
- agent-logic changes

Plan Mode goal:
- inspect
- ask clarifying questions if needed
- save the plan as markdown
- avoid editing until scope is clear

## 3) Move to Agent Mode only after plan approval
Use Agent Mode for:
- surgical edits
- finishing approved tasks
- verification
- testing/build passes

## 4) Use Workspaces for parallel risky streams
Recommended parallel streams for ConsultX:
- Workspace A — public website / landing / pricing
- Workspace B — chat shell / account / subscription UX
- Workspace C — backend state alignment
- Workspace D — agent logic / prompts / reasoning structure

Never mix all four in one uncontrolled task.

## 5) Prompt structure that works best in Verdent
Use this shape for complex work:

### Goal
State the product-level goal clearly.

### Context
Explain what already exists and what must not be broken.

### Requirements
List specific requirements in bullets.

### Constraints
List non-negotiables.

### Verification
Tell Verdent what success must be proven by.

## 6) Recommended reusable prompt templates

### Template A — Audit First
```text
Audit the current repository state before making changes.
Classify files into:
- completed
- partial
- not started
Do not modify anything until the audit is complete.
Then propose the smallest safe execution path.
```

### Template B — Surgical Continuation
```text
Continue from the current repository state without restarting the redesign.
Do not rewrite completed work from scratch.
First inspect current files, git diff, and wiring.
Then complete only the unfinished parts.
Run verification before recommending commit.
```

### Template C — UI Verification Before Commit
```text
Before any commit, perform a visual and functional verification pass.
Check desktop, mobile, RTL, LTR, spacing, interactions, routes, and major user flows.
Return:
- completed
- partial
- not done
- visual issues
- functional issues
- safe to commit or not
```

### Template D — Agent Logic Alignment
```text
Do not treat ConsultX as a generic AI chat product.
Advisory Mode must determine required systems and design obligations.
Analysis Mode must review the final design and verify code compliance.
Rework prompts, reasoning flow, and structured outputs accordingly.
Do not change frontend copy only; align reasoning behavior.
```

## 7) How to use @-mentions well
Use @-mentions when you want Verdent to focus on exact files or modules.
Examples:
- `@src/components/ChatInterface.tsx`
- `@src/pages/Account.tsx`
- `@src/lib/translations.ts`
- `@supabase/functions/...`

Good pattern:
```text
I need a surgical refinement of @src/components/ChatInterface.tsx and @src/components/ChatSidebar.tsx.
Preserve branding. Improve shell hierarchy. Verify mobile drawer and conversation flows.
```

## 8) Best practice for large files
For files above ~500 lines:
- ask Verdent to search before reading
- ask it to inspect only relevant ranges
- ask it to make targeted edits
- avoid broad full-file rewrites unless necessary

## 9) When to start a new task
Start a new task when:
- one atomic unit of work is complete
- verification is done
- you want a fresh context window
- you are switching from UI to backend or from backend to agent logic

Suggested atomic task boundaries:
- finish chat shell
- finish account/subscription polish
- finish backend access-state alignment
- finish advisory/analysis prompt redesign

## 10) Recommended operating rhythm for ConsultX
### Sprint rhythm inside Verdent
1. Plan Mode
2. Save plan as markdown
3. Approve
4. Agent Mode
5. Verify
6. Commit manually
7. Push manually
8. Start new task

## 11) What not to let Verdent do
- Do not let it restart the product from zero
- Do not let it flatten the visual identity
- Do not let it call everything “improved” just because build passes
- Do not let it touch unrelated backend areas during UI tasks
- Do not let it commit/push automatically without explicit approval

## 12) Recommended first rule for every serious task
Use this sentence at the top of your prompt:

```text
Continue from the current repository state without restarting the redesign.
```

## 13) Recommended first verification rule before any deploy
Use this sentence before release:

```text
Do not deploy yet. Perform a full visual and functional QA pass first, then tell me whether it is safe to deploy.
```

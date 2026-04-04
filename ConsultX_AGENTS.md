# ConsultX — Project Rules for Verdent

## Mission
ConsultX is an existing product. Improve it surgically from the current state. Do **not** rebuild from scratch unless a specific part is proven irreparable.

ConsultX is a decision-support platform for Saudi engineering consultancy offices responsible for code compliance, fire/life safety system design, post-design review, and final submission to Civil Defense / relevant authorities.

## Product Reality
ConsultX is **not** a generic AI chat app.
It is a professional engineering SaaS platform that supports a real consultancy workflow:
1. Analyze the project or plan
2. Determine required fire/life safety systems and code-driven design requirements
3. Design the systems
4. Review and verify the final design
5. Submit with higher confidence

## Core Workflow Modes
### Primary Mode
For fast, direct code lookups, short engineering questions, and quick clarification.

### Advisory Mode
Use this mode to determine **what must be designed**.
This is the engineer-facing mode used by consultancy engineers when reviewing plans, occupancy, building conditions, and code requirements to determine:
- which systems are required
- what design obligations apply
- what must be included in the fire/life safety design
- what constraints and assumptions affect the design scope

Advisory Mode output should favor:
- required systems
- code basis
- assumptions
- design considerations
- action items for the designer

### Analysis Mode
Use this mode to **review and verify what has already been designed**.
This is the manager / section-head / reviewer mode used to inspect final or near-final system layouts and verify compliance before submission.

Analysis Mode output should favor:
- review summary
- compliance findings
- missing systems / gaps
- conflicts or risks
- required corrections
- final review position before submission

## Non-Negotiable Product Principles
- Always preserve ConsultX visual identity, colors, typography character, and current branding language.
- Do not turn the product into a generic ChatGPT clone.
- Borrow global UX best practices only for organization, spacing, shell layout, and control hierarchy.
- Prefer surgical continuation over broad rewrites.
- Audit current state before changing code.
- Do not assume the repository is in the old state.
- Treat existing code as valuable unless proven broken or obsolete.
- Do not change working backend logic unless required for product alignment.
- Keep frontend, backend, and agent reasoning aligned with the real consultancy workflow.

## Execution Order Rules
For complex work, always use this sequence:
1. Audit current repository state
2. Classify files: completed / partial / not started
3. Continue only unfinished work
4. Verify changed behavior visually and functionally
5. Run type-check
6. Run production build
7. Summarize completed, fixed, remaining

## Frontend Rules
- Preserve branding and visual identity.
- Improve hierarchy, spacing, and readability without flattening the design language.
- Use sidebar-based shells where appropriate, but keep ConsultX looking like ConsultX.
- For large UI refactors, verify desktop, mobile, RTL, and LTR behavior before declaring completion.
- Do not leave dead CTA, broken routes, or duplicated sections.
- Keep Arabic UX premium: natural wording, good line breaks, no cramped blocks, no machine-like phrasing.

## Backend Rules
When backend changes are needed, keep the backend as the source of truth for:
- current plan
- trial state
- access state
- billing status
- usage state
- eligibility

Do not let frontend messaging drift away from actual backend state.

## Agent Reasoning Rules
When shaping prompts / orchestration / analysis logic for Gemini 2.5 Pro:
- Advisory Mode must determine required systems and obligations
- Analysis Mode must verify final design quality and compliance
- Make assumptions explicit
- Avoid generic long-form explanations when a structured engineering decision output is more useful
- Prefer structured outputs over loose essays
- Do not present unsupported certainty

## Chat Shell Rules
- Chat is the hero interaction surface
- Keep the shell calm, premium, and spacious
- Sidebar handles organization
- Header must stay light
- Message canvas should remain readable and central
- Input area should feel controlled and professional

## Account / Subscription Rules
- Make current plan, trial state, billing state, and upgrade path visually obvious
- Subscription UX should explain value in professional outcomes, not message counts only
- Team / office use cases must feel intentionally supported

## Commit / Push Safety
- Never auto-commit unless explicitly asked
- Never auto-push unless explicitly asked
- Before suggesting commit, verify:
  - no critical regressions
  - type-check passes
  - build passes
  - target flows work

## Large File Handling
For files over ~500 lines:
- search before reading
- inspect only relevant ranges first
- avoid loading the whole file if not necessary
- make minimal targeted edits

## Required Reporting Format
When completing a meaningful task, report using this structure:
1. Audit Summary
2. Files Modified
3. Functional Issues Fixed
4. UX / Visual Improvements
5. Remaining Risks or Follow-ups
6. Verification Results

## Hard Constraints
- Existing product first, not greenfield
- Surgical changes first, not broad rewrites
- Product workflow alignment is mandatory
- Visual identity preservation is mandatory
- Advisory / Analysis distinction is mandatory

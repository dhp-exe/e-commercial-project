---
name: startcycle
description: Start the Autonomous AI Developer Pipeline. Orchestrates the full development cycle from idea to deployment-ready code. Triggered when the user types "/startcycle <idea>".
---

# Workflow: Start Development Cycle

## Description

The **Autonomous AI Developer Pipeline** is a structured, multi-agent workflow that transforms a raw user idea into production-ready, audited, deployment-verified code. It enforces quality at every stage through approval gates and automated checks.

## Trigger

When the user types `/startcycle <idea>` in the chat.

**Example:**
```
/startcycle Add a wishlist feature where users can save products for later
```

## Execution Sequence

```
┌──────────────────────────────────────────────────────────┐
│                  AUTONOMOUS DEV PIPELINE                  │
│                                                          │
│  ┌─────────┐    ┌──────────┐    ┌─────┐    ┌─────────┐  │
│  │   @pm   │───▶│ @fe + @be│───▶│ @qa │───▶│ @devops │  │
│  │  SPECS  │    │   CODE   │    │AUDIT│    │ DEPLOY  │  │
│  └────┬────┘    └────┬─────┘    └──┬──┘    └────┬────┘  │
│       │              │             │             │        │
│   [APPROVAL]    [LINT GATE]   [QUALITY]    [BUILD OK]    │
│     GATE                       GATE                      │
└──────────────────────────────────────────────────────────┘
```

---

### Stage 1: Specification — @pm

**Agent:** @pm (Senior Product Manager)
**Skill:** `skills/write_specs.md`

**Actions:**
1. Read the user's `<idea>` input
2. Consult `architecture.md` for existing patterns and constraints
3. Scan relevant source files to understand the current state
4. Generate `Technical_Specification.md` in `.agents/production_artifacts/`
5. Present the spec to the user

**⏸️ HARD STOP — USER APPROVAL GATE**

> Ask the user: *"Do you approve of this architecture? You can add comments to the file if you want me to rework anything."*

- If the user provides feedback → rework and re-present
- If the user says **"Approved"** → proceed to Stage 2
- **Do NOT proceed without explicit approval**

---

### Stage 2: Implementation — @fe + @be

**Agents:** @fe (Senior Frontend Engineer) + @be (Senior Backend Engineer)
**Skill:** `skills/generate_code.md`

**Actions:**
1. Read the approved `Technical_Specification.md`
2. Generate `Implementation_Plan.md` with phased breakdown
3. Execute code generation in micro-batched phases:

   **Phase Order:**
   1. 🗄️ **Data Layer** — Database migrations, models, Redis cache keys
   2. 🔌 **Backend API** — Route handlers, middleware, validation (@be)
   3. 🖼️ **Frontend Foundation** — Pages, routing, basic UI (@fe)
   4. ✨ **Frontend Polish** — Styling, animations, responsive (@fe)
   5. 🔗 **Integration** — Connect frontend ↔ backend, end-to-end flow

4. Run lint verification after each phase:
   ```bash
   cd client && npm run lint
   cd server && npm run lint
   ```
5. Fix any lint errors before proceeding to the next phase
6. Generate `Walkthrough.md` documenting all changes

---

### Stage 3: Quality Assurance — @qa

**Agent:** @qa (QA Engineer & Security Auditor)
**Skill:** `skills/audit_code.md`

**Actions:**
1. Read the `Technical_Specification.md` (the contract)
2. Review all code changes made in Stage 2
3. Execute the full audit checklist:
   - Specification compliance
   - Architectural integrity
   - DRY & SRP adherence
   - TypeScript/JavaScript strictness (zero tolerance)
   - Security audit
   - Error handling completeness
   - Performance review
4. Produce a structured **Audit Report**

**🚦 QUALITY GATE**

| Audit Result | Action |
|---|---|
| 🔴 Any FATAL findings | **REJECT** — Return to Stage 2 for @fe/@be to fix issues |
| 🟡 Only WARNINGs | **CONDITIONAL PASS** — Flag issues, proceed with fixes noted |
| 🟢 All clear | **PASS** — Proceed to Stage 4 |

---

### Stage 4: Deployment Verification — @devops

**Agent:** @devops (DevOps Master)

**Actions:**
1. Verify Docker builds succeed:
   ```bash
   docker compose build --no-cache
   ```
2. Check for new environment variables and update documentation
3. Verify `docker-compose.yml` is correct if new services are added
4. Ensure Sentry source maps are configured for new frontend code
5. Verify health check endpoints respond correctly
6. Prepare release notes following conventional commit format
7. Tag the release using semantic versioning:
   - New feature → minor bump (e.g., `1.1.0` → `1.2.0`)
   - Bug fix → patch bump (e.g., `1.1.0` → `1.1.1`)
   - Breaking change → major bump (e.g., `1.1.0` → `2.0.0`)

---

## Artifacts Produced

| Artifact | Location | Stage |
|---|---|---|
| Technical Specification | `.agents/production_artifacts/Technical_Specification.md` | Stage 1 |
| Implementation Plan | `.agents/production_artifacts/Implementation_Plan.md` | Stage 2 |
| Walkthrough | `.agents/production_artifacts/Walkthrough.md` | Stage 2 |
| Audit Report | `.agents/production_artifacts/Audit_Report.md` | Stage 3 |

## Failure Recovery

- **Stage 1 rejection:** Loop within @pm until approved
- **Stage 2 lint failure:** Fix immediately within the same phase, do not defer
- **Stage 3 audit failure:** Return failing code to @fe/@be with specific fix instructions from @qa
- **Stage 4 build failure:** @devops investigates and patches Docker/CI configuration

## Rules

- ❌ Never skip a stage
- ❌ Never proceed past an approval gate without explicit user confirmation
- ❌ Never bypass lint or type-check failures
- ✅ Always produce all listed artifacts
- ✅ Always maintain a clear separation of agent responsibilities
- ✅ Always leave the codebase in a better state than you found it

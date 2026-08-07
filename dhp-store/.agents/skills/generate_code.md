---
name: generate_code
description: Safely generate production-grade application code in micro-batched phases. Invoked by @fe and @be after specification approval.
---

# Skill: Generate Code

## Objective

Produce **production-ready application code** that strictly adheres to the approved `Technical_Specification.md` and the project's architecture patterns documented in `.agents/architecture.md`.

This skill enforces extreme quality standards through guardrails that prevent common AI code generation pitfalls.

## Guardrails

### 🚫 Zero Bypassing Policy

The following patterns are **absolutely forbidden** in generated code:

| Forbidden Pattern | Why |
|---|---|
| `// @ts-ignore` | Hides type errors that will become runtime bugs |
| `// eslint-disable` | Suppresses lint rules that catch real issues |
| `any` type | Defeats the purpose of type safety |
| `as unknown as` | Type-system escape hatch that masks incorrect types |
| `console.log` in production code | Use proper logging (Morgan) or error tracking (Sentry) |
| `SELECT *` in SQL queries | Always specify columns for performance and safety |
| String concatenation in SQL | Always use parameterized queries (`?` placeholders) |
| Hardcoded secrets/URLs | Use environment variables |

### 📋 Proposal First — Implementation Plan

Before writing any application code, generate an `Implementation_Plan.md` artifact that documents:

```markdown
# Implementation Plan — [Feature Name]

## Phase Breakdown

### Phase 1: [Description]
- Files to create/modify: [list]
- Dependencies: [any new packages]
- Estimated complexity: [Low/Medium/High]

### Phase 2: [Description]
...

## Dependency Graph
Which phases depend on which. Identify the critical path.

## Risk Assessment
Known challenges and mitigation strategies.
```

### 🔄 Micro-Batching — Phased Execution

**Never attempt to build the entire feature in one shot.** Divide work into distinct, manageable phases:

1. **Phase 1 — Data Layer:** Database migrations, models, Redis cache keys
2. **Phase 2 — Backend API:** Route handlers, middleware, validation
3. **Phase 3 — Frontend Foundation:** Pages, routing, basic UI structure
4. **Phase 4 — Frontend Polish:** Styling, animations, responsive design, error states
5. **Phase 5 — Integration:** Connect frontend to backend, end-to-end flow

Each phase should:
- Be independently verifiable
- Not break existing functionality
- Include error handling from the start (not as an afterthought)

### ✅ Verification — Lint Before Finalize

After each phase, run verification:

**Frontend:**
```bash
cd client && npm run lint
```

**Backend:**
```bash
cd server && npm run lint
```

If either command produces errors, **fix them before proceeding** to the next phase. Do not defer lint fixes.

## Code Generation Standards

### Frontend (@fe)

- Follow existing directory conventions:
  - Pages → `client/src/pages/`
  - Components → `client/src/components/`
  - Hooks → `client/src/hooks/`
  - Context → `client/src/context/`
  - Styles → `client/src/styles/` or co-located `.css` files
- Use TanStack Query for all server state (no raw `useEffect` + `useState` for API calls)
- Use the centralized Axios instance from `client/src/api.js`
- Implement all three states for data-dependent UI: loading, error, and empty
- Use React Router for navigation — no `window.location` manipulation
- Add JSDoc comments for all custom hooks and complex components

### Backend (@be)

- Follow existing route file conventions in `server/src/routes/`
- Use `pool` from `server/src/db.js` for all database operations
- Use `redis` from `server/src/cache/redis.js` for caching — always with graceful degradation:
  ```javascript
  // ✅ Correct pattern
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error('Redis read error:', err.message);
    // Fall through to database
  }
  ```
- Validate all input using the `validator` library
- Use JWT middleware for protected routes
- Release database connections in `finally` blocks
- Use explicit column names in all SQL queries

## Output Artifacts

| Artifact | Location | When |
|---|---|---|
| Implementation Plan | `.agents/production_artifacts/Implementation_Plan.md` | Before coding starts |
| Walkthrough | `.agents/production_artifacts/Walkthrough.md` | After all phases complete |

### Walkthrough Format

```markdown
# Walkthrough — [Feature Name]

## Summary
Brief description of what was implemented.

## Files Modified

### New Files
- `path/to/file.js` — Purpose and key decisions

### Modified Files
- `path/to/file.js` — What changed and why

## Phase Completion Log

### Phase 1: [Name] ✅
- What was done
- Lint status: ✅ Clean

### Phase 2: [Name] ✅
...

## Verification Results
- Frontend lint: ✅ / ❌
- Backend lint: ✅ / ❌
- Manual testing notes

## Known Limitations
Any acknowledged trade-offs or future improvements.
```

## Rules

- ❌ Never skip the Implementation Plan step
- ❌ Never write all code in a single phase
- ❌ Never leave lint errors unresolved
- ❌ Never modify files outside the scope defined in the Technical Specification
- ✅ Always check `architecture.md` for existing patterns before inventing new ones
- ✅ Always include error handling in every function, not as a follow-up
- ✅ Always produce a Walkthrough artifact documenting all changes

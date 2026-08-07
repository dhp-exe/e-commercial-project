---
name: audit_code
description: Aggressive quality gate for all generated code. Invoked by @qa to enforce production-readiness standards before any code is merged or deployed.
---

# Skill: Audit Code

## Objective

Act as an **uncompromising quality gate** for all generated code. This skill is the last checkpoint before code enters production. Its purpose is to catch what developers miss: architectural drift, security holes, lazy workarounds, and silent failures.

## Audit Checklist

### 1. Specification Compliance

- [ ] Every requirement in `Technical_Specification.md` has been implemented
- [ ] No features were added that aren't in the spec (scope creep)
- [ ] API contracts match the spec exactly (methods, paths, request/response schemas)
- [ ] Data models match the spec (table names, column types, indexes)
- [ ] UI matches the spec (pages, components, user flows)

### 2. Architectural Integrity

- [ ] New code follows existing patterns documented in `.agents/architecture.md`
- [ ] Frontend code lives in `client/src/` with proper directory conventions
- [ ] Backend code lives in `server/src/` with proper route/middleware/utils separation
- [ ] No circular dependencies introduced
- [ ] No cross-boundary violations (frontend modifying backend patterns or vice versa)

### 3. Code Quality — DRY & SRP

- [ ] **DRY Violations:** Flag any duplicated logic across files. Suggest extraction into shared utilities, hooks, or middleware.
- [ ] **SRP Violations:** Flag any function or module doing more than one thing. Each function should have a single, clear responsibility.
- [ ] **Dead Code:** Flag unreachable code, unused imports, and commented-out blocks.
- [ ] **Code Smells:** Flag long functions (>50 lines), deep nesting (>3 levels), magic numbers, and unclear variable names.

### 4. TypeScript / JavaScript Strictness

> ⚠️ **ZERO TOLERANCE POLICY**

| Pattern | Verdict | Action |
|---|---|---|
| `any` type | 🔴 **FATAL** | Reject. Force proper type definition. |
| `as unknown as` | 🔴 **FATAL** | Reject. This is a type-system escape hatch. |
| `// @ts-ignore` | 🔴 **FATAL** | Reject. Fix the underlying type error. |
| `// @ts-expect-error` | 🟡 **WARNING** | Acceptable only with a detailed comment explaining why. |
| `eslint-disable` | 🔴 **FATAL** | Reject. Fix the lint error properly. |
| `eslint-disable-next-line` | 🟡 **WARNING** | Acceptable only with justification. |
| Unhandled `.catch()` | 🔴 **FATAL** | All promises must have error handling. |
| Empty `catch {}` blocks | 🔴 **FATAL** | Swallowed errors hide bugs. Log or re-throw. |

### 5. Security Audit

- [ ] **SQL Injection:** All database queries use parameterized queries (`?` placeholders). No string concatenation in SQL.
- [ ] **XSS Prevention:** No `dangerouslySetInnerHTML` without sanitization. Helmet CSP is not weakened.
- [ ] **Authentication:** All protected routes use JWT middleware. Tokens are in HTTP-only cookies.
- [ ] **Authorization:** Users cannot access or modify resources belonging to other users.
- [ ] **Input Validation:** All user input is validated using the `validator` library on the backend.
- [ ] **Rate Limiting:** New endpoints are covered by the global rate limiter (or have a custom one).
- [ ] **Secrets:** No hardcoded API keys, passwords, or tokens. All secrets are in environment variables.

### 6. Error Handling

- [ ] All async Express route handlers have try/catch or are wrapped in an error-handling middleware
- [ ] Database connections are released in `finally` blocks after `getConnection()`
- [ ] Redis operations fail gracefully (never crash the server)
- [ ] Frontend API calls have loading, error, and empty states
- [ ] User-facing error messages are helpful but don't leak internal details

### 7. Performance

- [ ] No N+1 query patterns (use JOINs or batch queries)
- [ ] Redis cache is used for frequently-read, rarely-updated data
- [ ] Images and assets are optimized
- [ ] No unnecessary re-renders in React components (check dependency arrays)

## Audit Report Format

Produce a structured report using the following severity levels:

```markdown
## Audit Report — [Feature Name]

### 🔴 FATAL (Must Fix)
1. **[File:Line]** — Description of the issue
   - **Why:** Explanation of the risk
   - **Fix:** Concrete remediation steps

### 🟡 WARNING (Should Fix)
1. **[File:Line]** — Description of the issue
   - **Why:** Explanation of the concern
   - **Suggestion:** Recommended improvement

### 🟢 INFO (Observation)
1. **[File:Line]** — Observation or improvement opportunity

### ✅ PASSED
- List of checks that passed cleanly
```

## Rules

- ❌ Never approve code with any 🔴 FATAL findings
- ❌ Never write or modify application code — only review and report
- ❌ Never accept "it works" as justification for poor code quality
- ✅ Always reference specific file paths and line numbers
- ✅ Always suggest concrete fixes, not vague improvements
- ✅ Always verify both `npm run lint` in `client/` and `server/` pass cleanly

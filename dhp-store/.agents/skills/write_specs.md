---
name: write_specs
description: Turn raw user ideas into rigorous technical specifications. Invoked by @pm during the planning phase of the development cycle.
---

# Skill: Write Technical Specification

## Objective

Transform a raw user idea into a production-grade `Technical_Specification.md` that serves as the **single source of truth** for all downstream agents (@fe, @be, @qa, @devops).

## Execution Steps

### 1. Understand the Idea

- Parse the user's raw input for intent, scope, and desired outcome.
- Cross-reference with `.agents/architecture.md` to understand existing patterns, tech stack constraints, and available infrastructure.
- Identify which API routes, database tables, UI pages, and services are affected.

### 2. Research Existing Code

- Scan relevant source files in `client/src/` and `server/src/` to understand current implementations.
- Check for existing patterns that should be reused (hooks, context providers, middleware, route conventions).
- Identify potential conflicts or breaking changes.

### 3. Draft the Specification

Create the specification at `.agents/production_artifacts/Technical_Specification.md` with the following mandatory sections:

```markdown
# Technical Specification: [Feature Name]

## 1. Overview
Brief description of the feature and its business value.

## 2. User Stories
- As a [role], I want [action] so that [benefit].

## 3. Technical Design

### 3.1 Frontend Changes
- New/modified pages, components, hooks
- State management approach
- UI/UX requirements (responsive, accessible, animations)

### 3.2 Backend Changes
- New/modified API endpoints (method, path, request/response schema)
- Database schema changes (new tables, columns, indexes)
- Redis caching strategy for new data paths
- Authentication/authorization requirements

### 3.3 AI Service Changes (if applicable)
- Changes to the Python recommendation engine

## 4. Data Models
Table schemas, relationships, and migration scripts.

## 5. API Contracts
Detailed request/response examples for every new endpoint.

## 6. Error Handling
Expected error states, HTTP status codes, and user-facing messages.

## 7. Security Considerations
Input validation, authorization checks, rate limiting, CSP impacts.

## 8. Testing Strategy
Manual verification steps, edge cases to cover.

## 9. Deployment Impact
Docker changes, environment variables, migration steps.

## 10. Acceptance Criteria
Checkboxes for every requirement that must pass before the feature is complete.
```

### 4. Present for Review

After generating the specification, **you MUST halt execution** and actively ask the user:

> **"Do you approve of this architecture? You can add comments to the file if you want me to rework anything."**

### 5. Iterate Until Approved

- If the user provides feedback or modifies the document, **read their changes** and rework the relevant sections.
- Re-present the updated specification for approval.
- **Loop this step until the user explicitly says "Approved."**
- Only after approval should downstream agents begin work.

## Output

| Artifact | Location |
|---|---|
| Technical Specification | `.agents/production_artifacts/Technical_Specification.md` |

## Rules

- ❌ Never write application code in this skill — specs only.
- ❌ Never skip the approval gate.
- ❌ Never make assumptions about implementation details without checking `architecture.md`.
- ✅ Always include concrete API contracts with example payloads.
- ✅ Always identify breaking changes and flag them prominently.
- ✅ Always consider Redis caching implications for new data paths.

---
trigger: always_on
---

# Rule: No Secrets in Documentation

> **Scope:** All files in `.agents/`, `production_artifacts/`, and any markdown documentation committed to the repository.

## Absolute Prohibitions

The following MUST NEVER appear in any `.agents/` file, `README.md`, or any other tracked documentation file:

1. **API keys, tokens, or secrets** — e.g., `sk_test_51...`, `whsec_...`, `AIzaSy...`, `pcsk_...`
2. **Database credentials** — hostnames, usernames, passwords, connection strings
3. **SSL/TLS certificates** — PEM-encoded `BEGIN CERTIFICATE` blocks
4. **OAuth client secrets** — e.g., `GOCSPX-...`
5. **Email passwords or app-specific passwords**
6. **Cloudflare account IDs, R2 access keys, or secret keys**
7. **Sentry DSNs containing real ingest URLs**
8. **JWT secrets or session keys**
9. **Any value from a `.env` file** — even "test" or "development" credentials are prohibited

## What IS Allowed

- **Placeholder formats** showing the expected structure: `sk_test_...`, `your_database_host`, `{account_id}`
- **Environment variable names** without values: `CDN_URL`, `R2_BUCKET_NAME`
- **Architecture descriptions** referencing services by name: "connects to TiDB Cloud", "proxied through Cloudflare AI Gateway"
- **URL formats** with template variables: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio`

## Enforcement

- **@pm:** Must not include real credentials in `Technical_Specification.md`. Use placeholder formats only.
- **@fe / @be:** Must not include real credentials in `Implementation_Plan.md` or `Walkthrough.md`.
- **@qa:** Must explicitly check for credential leakage as part of every audit. Add a "Security — Credential Leakage" section to every `Audit_Report.md`.
- **@devops:** Must verify `.env.example` files contain only placeholders before any release.



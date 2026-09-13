# Implementation Plan — Cloudflare AI Gateway Integration for Python AI Service

Based on the [Technical_Specification.md](file:///Users/dohuuphuoc/Dev/e-commercial-project/dhp-store/.agents/production_artifacts/Technical_Specification.md).

## Phase Breakdown

### Phase 1: Client Reconfiguration in `ai-service/recommender.py`
- Modify `Recommender.__init__` to check `CF_AI_GATEWAY_URL`.
- If set, instantiate `types.HttpOptions(base_url=cf_gateway_url.rstrip("/"))` and pass to `genai.Client`.
- If unset, instantiate `genai.Client(api_key=google_api_key)`.

### Phase 2: Environment Configuration Documentation
- Update `ai-service/.env` with `CF_AI_GATEWAY_URL`.
- Document configuration for Docker environment (`docker-compose.yml`).

### Phase 3: Verification & Quality Assurance
- Run standalone Python test verifying base URL and header propagation in both gateway-enabled and default modes.
- Run Python syntax and linting checks.
- Produce `Walkthrough.md` and `Audit_Report.md`.

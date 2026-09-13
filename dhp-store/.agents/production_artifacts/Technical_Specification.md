# Technical Specification: Cloudflare AI Gateway Integration for Python AI Service

> **Author:** @pm (Senior Product Manager)  
> **Date:** 2026-09-13  
> **Scope:** `ai-service/recommender.py`, `ai-service/.env`, `docker-compose.yml`  
> **Constraint:** Do not modify existing Pinecone vector search, RAG logic, prompt structure, or Pydantic schemas. Exclusively modify outbound network route of LLM requests.

---

## 1. Overview

The DHP Store AI microservice (`ai-service`) executes customer intent extraction, product recommendations, and conversational store assistant queries using Google Gemini via the `google-genai` Python SDK.

To gain edge response caching, unified observability/analytics, and rate limiting at Cloudflare's global edge without changing any application or RAG logic, we are routing outbound Gemini API requests through **Cloudflare AI Gateway**.

If the `CF_AI_GATEWAY_URL` environment variable is defined, the `genai.Client` will set its `http_options.base_url` to the Cloudflare AI Gateway endpoint for Google AI Studio. If omitted, it cleanly falls back to the default Google API endpoint (`https://generativelanguage.googleapis.com/`).

---

## 2. Audit Findings: Current Flow

### 2.1 SDK & Client Initialization
- **SDK:** `google-genai` (`v2.17.0`) via `from google import genai` and `from google.genai import types`.
- **Location:** `ai-service/recommender.py` inside `Recommender.__init__`.
- **Current Initialization:**
  ```python
  if os.getenv("GOOGLE_API_KEY"):
      self.model_name = os.getenv("MODEL_NAME", "gemini-2.5-flash")
      self.genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
  else:
      self.genai_client = None
  ```
- **Authentication Environment Variable:** `GOOGLE_API_KEY` (loaded from `ai-service/.env` via `load_dotenv()`).

### 2.2 Inference Execution Flow
1. **POST `/chat` (`main.py:60`):**
   Calls `rec_engine.chat(req.message)`.
2. **Intent & Structured Filter Extraction (`recommender.py:68`):**
   Invokes `self.genai_client.models.generate_content(...)` with `SearchFilters` Pydantic response schema.
3. **Store Info Response (`recommender.py:88`):**
   Invokes `self.genai_client.models.generate_content(...)` answering general store inquiries.
4. **Product Search (`recommender.py:109`):**
   Invokes `self.genai_client.models.embed_content(...)` using `gemini-embedding-2`, queries Pinecone, and invokes `self.genai_client.models.generate_content(...)` with product catalog context.
5. **General Chat (`recommender.py:175`):**
   Invokes `self.genai_client.models.generate_content(...)` for fallback conversational flow.

---

## 3. Technical Design

### 3.1 Client Configuration with Cloudflare AI Gateway
In `google-genai`, custom endpoints are configured via `types.HttpOptions(base_url=...)`:
```python
google_api_key = os.getenv("GOOGLE_API_KEY")
if google_api_key:
    self.model_name = os.getenv("MODEL_NAME", "gemini-2.5-flash")
    cf_gateway_url = os.getenv("CF_AI_GATEWAY_URL")
    if cf_gateway_url:
        http_options = types.HttpOptions(base_url=cf_gateway_url.rstrip("/"))
        self.genai_client = genai.Client(api_key=google_api_key, http_options=http_options)
    else:
        self.genai_client = genai.Client(api_key=google_api_key)
else:
    self.genai_client = None
```

- When `http_options.base_url` is provided, `genai.Client` routes REST calls (`/v1beta/models/...`) to Cloudflare.
- The `api_key` argument automatically sets the `x-goog-api-key` HTTP header, which Cloudflare AI Gateway preserves and forwards to Google AI Studio.
- Calling `.rstrip("/")` prevents double slash URL anomalies.

---

## 4. Cloudflare AI Gateway URL Specification

**Format:**
```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio
```

Given:
- Account ID: `9ae02ac45d236f8b893e839ebd26fd20`
- Gateway ID: `default`
- Provider: `google-ai-studio`

**Resolved Endpoint:**
```
https://gateway.ai.cloudflare.com/v1/9ae02ac45d236f8b893e839ebd26fd20/default/google-ai-studio
```

---

## 5. Acceptance Criteria

- [ ] `ai-service/recommender.py` inspects `CF_AI_GATEWAY_URL`.
- [ ] If present, passes `types.HttpOptions(base_url=cf_gateway_url.rstrip("/"))` to `genai.Client`.
- [ ] If absent, gracefully instantiates `genai.Client` with default Google endpoint.
- [ ] `GOOGLE_API_KEY` is preserved in both modes.
- [ ] Zero alterations to Pinecone search, RAG logic, prompt structure, or Pydantic schemas.
- [ ] Syntax and lint verification passes.

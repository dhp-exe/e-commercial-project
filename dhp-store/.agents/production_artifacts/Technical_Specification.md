# Technical Specification: Unified Vector Database & Hybrid RAG Pipeline
**Status:** APPROVED
**Date:** 2026-08-11

**Goal:** Overhaul the product search and recommendation engine by replacing TF-IDF and Regex with a unified Vector Database (Pinecone) and a Hybrid RAG pipeline using Google's Gemini models for embeddings.

## Decisions Made
1. **Pinecone Index:** Pre-created index named `dhp-store` with 768 dimensions (cosine metric).
2. **Model:** `text-embedding-005` via `google-genai`.
3. **Dependency:** `pinecone` python package.
4. **Metadata:** `name`, `description`, `price` (float), `category`, and `id` will be stored directly in Pinecone to eliminate MySQL queries from the AI search path.

## Proposed Changes

---
### Phase 1: Pinecone Vector DB Setup & Data Ingestion

#### `ai-service/requirements.txt`
- Add `pinecone` to the dependencies list.

#### `ai-service/app/vector_store.py`
- Create a new module to handle Pinecone connections and sync logic.
- Initialize `Pinecone(api_key=os.getenv("PINECONE_API_KEY"))`.
- Connect to index `dhp-store`.
- Implement `sync_products_to_pinecone()`:
  - Query MySQL for active products (id, name, description, price, category).
  - Construct a single textual document for each product (e.g., `"{name} {description} {category}"`).
  - Use `google-genai` to generate embeddings (using `models/text-embedding-005`).
  - Upsert vectors to Pinecone with metadata `{"name": ..., "description": ..., "price": float, "category": ..., "id": int}`.

#### `ai-service/main.py`
- Update the `/refresh` endpoint to trigger `sync_products_to_pinecone()` via BackgroundTasks instead of the old `rec_engine.refresh()`.

---
### Phase 2: Refactor the Recommender

#### `ai-service/recommender.py`
- **Remove:** `TfidfVectorizer`, `cosine_similarity`, `pandas`, and `soup` matrix logic entirely.
- **Update `get_similar(product_id, top_n=4)`:**
  - Retrieve the target product's vector from Pinecone (using `index.fetch(ids=[str(product_id)])`).
  - Query Pinecone with that vector to find `top_n` nearest neighbors.
  - Exclude the original `product_id`.
  - Return the list of IDs.

---
### Phase 3: The Hybrid RAG Chat Tool

#### `ai-service/recommender.py`
- **Update `search_products(user_message)` (or integrate directly into `chat()`):**
  - Generate an embedding for the `user_message` using `text-embedding-005`.
  - Apply Pinecone metadata filters if `max_price` (e.g., `{"price": {"$lte": max_price}}`) or `category` (e.g., `{"category": {"$eq": category}}`) are extracted by Gemini or simple regex.
  - Query the Pinecone index using the user's vector and the constructed filters.
  - Return the top 3-5 results.
  - Pass the results back to Gemini for the final natural language synthesis.

# Technical Specification: Hallucination Fixes, Structured Outputs, & Caching
**Status:** APPROVED
**Date:** 2026-08-13

## Goal
Fix product hallucination by adding strict guardrails, upgrade intent extraction to use LLM Structured Outputs (Pydantic), and add long-term caching (14-day TTL) to the recommendation engine.

## Decisions Made
1. **Intent Extraction:** Included `STORE_INFO` in the `SearchFilters` Pydantic schema along with `PRODUCT_SEARCH` and `GENERAL`.
2. **Cache Invalidation:** Calling `cache_clear()` inside `main.py`'s `/refresh` background task after `sync_products_to_pinecone` finishes is approved.

## Proposed Changes

### Phase 1: Strict Grounding Guardrails
- **recommender.py:** Update the `PRODUCT_SEARCH` prompt to include the strict grounding guardrail instructing the model to only recommend products from the provided context and never hallucinate.

### Phase 2: LLM Structured Output
- **recommender.py:** 
  - Add Pydantic dependency.
  - Remove `detect_intent()`, price patterns, and `product_keywords`.
  - Implement `SearchFilters(BaseModel)`.
  - Refactor `search_products()` to use structured output for constraint extraction (intent, max_price, category, search_query) and pass filters to Pinecone.
  - Refactor `chat()` to use `search_products` properly.

### Phase 3: 14-Day Recommendation Caching
- **requirements.txt:** Add `cachetools`.
- **recommender.py:** Apply `@cached(cache=TTLCache(maxsize=1024, ttl=1209600))` to `get_similar()`.
- **main.py:** Update `/refresh` to call `vector_store.sync_products_to_pinecone()` and then `rec_engine.get_similar.cache_clear()`.

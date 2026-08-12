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

import os
import json
from google import genai
from google.genai import types
from pinecone import Pinecone
from pydantic import BaseModel
from typing import Optional, Literal
from cachetools import cached, TTLCache

class SearchFilters(BaseModel):
    intent: Literal["PRODUCT_SEARCH", "GENERAL", "STORE_INFO"]
    category: Optional[Literal["Tees", "Hoodies/Jackets", "Jeans/Pants"]]
    max_price: Optional[float]
    search_query: str

class Recommender:
    def __init__(self, db_config):
        self.db_config = db_config
        
        pinecone_key = os.getenv("PINECONE_API_KEY")
        if pinecone_key:
            self.pc = Pinecone(api_key=pinecone_key)
            self.index = self.pc.Index("dhp-store")
        else:
            self.pc = None
            self.index = None
            print("WARNING: PINECONE_API_KEY not found.")

        if os.getenv("GOOGLE_API_KEY"):
            self.model_name = os.getenv("MODEL_NAME", "gemini-2.5-flash")
            self.genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        else:
            self.genai_client = None

        print("AI Model Ready (Pinecone integrated)!")

    @cached(cache=TTLCache(maxsize=1024, ttl=1209600))
    def get_similar(self, product_id, top_n=4):
        if not self.index:
            return []
            
        # Fetch target product vector from Pinecone
        response = self.index.fetch(ids=[str(product_id)])
        if str(product_id) not in response.vectors:
            return []
            
        target_vector = response.vectors[str(product_id)].values
        
        # Query for nearest neighbors
        query_response = self.index.query(
            vector=target_vector,
            top_k=top_n + 1,
            include_metadata=False
        )
        
        similar_ids = []
        for match in query_response.matches:
            if match.id != str(product_id):
                similar_ids.append(int(match.id))
                
        # Return exactly top_n (since we requested top_n + 1 to account for the product itself)
        return similar_ids[:top_n]
    
    def chat(self, user_message):
        if not self.genai_client:
            return "I'm sorry, AI isn't connected right now."

        # Extract structured intent and filters
        try:
            extraction_prompt = f"Analyze this user query and extract intent, category, max price, and a clean search query:\nQuery: {user_message}"
            structured_response = self.genai_client.models.generate_content(
                model=self.model_name,
                contents=extraction_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=SearchFilters
                )
            )
            # Parse the JSON string into the Pydantic model
            filters_data = json.loads(structured_response.text)
            filters = SearchFilters(**filters_data)
        except Exception as e:
            print(f"Error parsing structured output: {e}")
            # Fallback
            filters = SearchFilters(intent="GENERAL", search_query=user_message, category=None, max_price=None)

        # ===== STORE INFO =====
        if filters.intent == "STORE_INFO":
            prompt = f"""
            You are Naviah, a helpful store information assistant/manager.

            Rules:
            - Answer the user's question enthusiastically.
            - Do NOT mention products, inventory, or recommendations.
            - Answer with less than 30 words.

            Store facts:
            - Store location: HCM City and Hanoi, Vietnam
            - Store name: DHP Store
            - Store owner, ceo, creator: Do Huu Phuoc (DHP)
            - Store manager, admin: you, Naviah

            Question: "{user_message}"
            """
            response = self.genai_client.models.generate_content(model=self.model_name, contents=prompt)
            return response.text.strip()

        # ===== PRODUCT SEARCH =====
        elif filters.intent == "PRODUCT_SEARCH":
            found_products = []
            if self.index:
                # Embed the refined search query
                try:
                    embed_result = self.genai_client.models.embed_content(
                        model="gemini-embedding-2",
                        contents=filters.search_query,
                        config=types.EmbedContentConfig(output_dimensionality=768)
                    )
                    query_vector = embed_result.embeddings[0].values
                    
                    # Construct Pinecone metadata filter
                    pinecone_filter = {}
                    if filters.max_price is not None:
                        pinecone_filter["price"] = {"$lte": filters.max_price}
                    if filters.category is not None:
                        pinecone_filter["category"] = {"$eq": filters.category}
                        
                    query_args = {
                        "vector": query_vector,
                        "top_k": 4,
                        "include_metadata": True
                    }
                    if pinecone_filter:
                        query_args["filter"] = pinecone_filter

                    response = self.index.query(**query_args)
                    found_products = [match.metadata for match in response.matches]
                except Exception as e:
                    print(f"Error in product search: {e}")

            if found_products:
                context = "Available products:\n"
                for p in found_products:
                    context += f"- {p['name']} (${p['price']}): {p['description']}\n"
            else:
                context = "No matching products were found."

            prompt = f"""
            You are a helpful sales assistant for 'DHP Store', a trendy streetwear brand.

            Rules:
            - Answer the user's question enthusiastically.
            - If product is not found, say exactly:
            "We can't find any products matching that description."
            and suggest visiting the 'All products' page for information.
            - If products are found, recommend them specifically.
            - If the user asks for price range, answer correctly.
            - Keep answers short (under 40 words).
            
            CRITICAL GUARDRAIL: You must ONLY recommend products explicitly listed in the [Available products] context below. DO NOT invent, hallucinate, or guess any products. If the provided products do not perfectly match the user's aesthetic request, recommend the closest available matches from the context and politely inform them of our current stock.

            User question: "{user_message}"

            {context}
            """
            response = self.genai_client.models.generate_content(model=self.model_name, contents=prompt)
            return response.text.strip()
            
        # ===== GENERAL =====
        else:
            prompt = f"""
            You are a helpful sales assistant for 'DHP Store', a trendy streetwear brand.

            Rules:
            - Answer the user's question clearly and concisely.

            User question: "{user_message}"
            """
            response = self.genai_client.models.generate_content(model=self.model_name, contents=prompt)
            return response.text.strip()
import os
import re
from google import genai
from google.genai import types
from pinecone import Pinecone

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
    
    def search_products(self, user_message):
        if not self.index or not self.genai_client:
            return []
            
        text = user_message.lower()

        # ---------- price extraction ----------
        price_limit = None
        price_patterns = [
            r"(less than|under|below)\s*\$?\s*(\d+)",
            r"\$?\s*(\d+)\s*(bucks|dollars)"
        ]

        for pattern in price_patterns:
            match = re.search(pattern, text)
            if match:
                price_limit = float(match.group(match.lastindex))
                break

        # ---------- product type extraction ----------
        product_keywords = {
            "Tees": ["tee", "tees", "t-shirt", "tshirt", "shirt", "top", "tops"],
            "Jeans": ["jean", "jeans", "denim", "bottom", "bottoms"]
        }

        matched_types = []
        for category, keys in product_keywords.items():
            if any(k in text for k in keys):
                matched_types.append(category)

        # Generate embedding for user query
        try:
            embed_result = self.genai_client.models.embed_content(
                model="gemini-embedding-2",
                contents=text,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            query_vector = embed_result.embeddings[0].values
        except Exception as e:
            print(f"Error generating embedding for search: {e}")
            return []

        # Construct Pinecone metadata filter
        pinecone_filter = {}
        
        if price_limit is not None:
            pinecone_filter["price"] = {"$lte": price_limit}
            
        if matched_types:
            pinecone_filter["category"] = {"$in": matched_types}
             
        query_args = {
            "vector": query_vector,
            "top_k": 4,
            "include_metadata": True
        }
        if pinecone_filter:
            query_args["filter"] = pinecone_filter

        response = self.index.query(**query_args)
        
        results = []
        for match in response.matches:
            results.append(match.metadata)
            
        return results
    
    def detect_intent(self, text: str) -> str:
        t = text.lower()

        if any(k in t for k in ["owner", "store owner", "who", "manager", "ceo", "creator", "admin", "founder", "DHP", "Phuoc", "Naviah", 
                                "location", "where", "address", "open", "close", "hours", "time"]):
            return "STORE_INFO"

        if any(k in t for k in ["buy", "price", "product", "products", "recommend", "search", "best seller", "trending", "tee", "tees", "jeans", "shirt", "t-shirt"]):
            return "PRODUCT_SEARCH"

        return "GENERAL"
    
    def chat(self, user_message):
        if not self.genai_client:
            return "I'm sorry, AI isn't connected right now."

        intent = self.detect_intent(user_message)

        # ===== STORE INFO =====
        if intent == "STORE_INFO":
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
        if intent == "PRODUCT_SEARCH":
            found_products = self.search_products(user_message)

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

            User question: "{user_message}"

            {context}
            """

            response = self.genai_client.models.generate_content(model=self.model_name, contents=prompt)
            return response.text.strip()
            
        # ===== GENERAL =====
        prompt = f"""
        You are a helpful sales assistant for 'DHP Store', a trendy streetwear brand.

        Rules:
        - Answer the user's question clearly and concisely.

        User question: "{user_message}"
        """

        response = self.genai_client.models.generate_content(model=self.model_name, contents=prompt)
        return response.text.strip()
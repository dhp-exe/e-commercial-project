import mysql.connector
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import google.generativeai as genai
import os
import re

class Recommender:
    def __init__(self, db_config):
        self.db_config = db_config
        self.df = None
        self.products = []
        self.similarity_matrix = None
        self.vectorizer = None
        self.tfidf_matrix = None
        self.id_to_index = None
        
        # Load data immediately
        self.refresh()

        if os.getenv("GOOGLE_API_KEY"):
            genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None

    def refresh(self):
        print("Loading data from TiDB...")
        conn = mysql.connector.connect(**self.db_config)
        
        # Fetch Data (ID, Name, Description, Price, Category)
        query = """
            SELECT p.id, p.name, p.description, p.price, c.name as category 
            FROM products p 
            JOIN categories c ON p.category_id = c.id
        """
        self.df = pd.read_sql(query, conn)
        conn.close()

        self.products = self.df[["id", "name", "description", "price", "category"]].to_dict("records")

        # Combine all text features into one string
        self.df['soup'] = self.df['name'] + " " + self.df['description'] + " " + self.df['category']
        
        # Vectorize (Text -> numbers)
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.tfidf_matrix = self.vectorizer.fit_transform(self.df['soup'])
        
        # Calculate Cosine Similarity
        self.similarity_matrix = cosine_similarity(self.tfidf_matrix, self.tfidf_matrix)
        
        # Create a lookup map (Product ID -> Matrix Index)
        self.id_to_index = pd.Series(self.df.index, index=self.df['id'])
        print("AI Model Ready!")

    def get_similar(self, product_id, top_n=4):
        if product_id not in self.id_to_index:
            return []

        idx = self.id_to_index[product_id]

        scores = list(enumerate(self.similarity_matrix[idx]))

        # Sort by score (highest first)
        scores = sorted(scores, key=lambda x: x[1], reverse=True)

        # Get top N 
        top_indices = [i[0] for i in scores[1:top_n+1]]

        return self.df['id'].iloc[top_indices].tolist()
    
    def search_products(self, user_message):
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
            "tee": ["tee", "tees", "t-shirt", "tshirt", "shirt", "top", "tops"],
            "jeans": ["jean", "jeans", "denim", "bottom", "bottoms"]
        }

        matched_types = []
        for ptype, keys in product_keywords.items():
            if any(k in text for k in keys):
                matched_types.append(ptype)

        # ---------- filtering ----------
        results = []

        # If refresh() hasn't populated products yet, fail gracefully.
        for product in (self.products or []):
            name = product["name"].lower()
            price = float(product["price"])

            # type filter
            if matched_types and not any(t in name for t in matched_types):
                continue

            # price filter
            if price_limit is not None and price >= price_limit:
                continue

            results.append(product)

        return results
    
    def detect_intent(self, text: str) -> str:
        t = text.lower()

        if any(k in t for k in ["owner", "store owner", "who", "manager", "ceo", "creator", "admin", "founder", "DHP", "Phuoc", "Naviah"]):
            return "STORE_INFO"

        if any(k in t for k in ["buy", "price", "product", "products", "recommend", "search", "best seller", "trending", "tee", "tees", "jeans", "shirt", "t-shirt"]):
            return "PRODUCT_SEARCH"

        return "GENERAL"
    
    def chat(self, user_message):
        if not self.model:
            return "I'm sorry, AI isn't connected right now."

        intent = self.detect_intent(user_message)

        # ===== STORE INFO ONLY =====
        if intent == "STORE_INFO":
            prompt = f"""
            You are Naviah, a helpful store information assistant/manager.

            Rules:
            - Answer the user's question enthusiastically.
            - Do NOT mention products, inventory, or recommendations.
            - Answer with less than 30 words.

            Store facts:
            - Store name: DHP Store
            - Store owner, ceo, creator: Do Huu Phuoc (DHP)
            - Store manager, admin: you, Naviah

            Question: "{user_message}"
            """

            response = self.model.generate_content(prompt)
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

            response = self.model.generate_content(prompt)
            return response.text.strip()
        if intent == "GENERAL":
            prompt = f"""
            You are a helpful sales assistant for 'DHP Store', a trendy streetwear brand.

            Rules:
            - Answer the user's question clearly and concisely.

            User question: "{user_message}"
            """

            response = self.model.generate_content(prompt)
            return response.text.strip()
        # ===== FALLBACK =====
        return "Can you please clarify what you're looking for?"
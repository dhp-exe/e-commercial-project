import os
from google import genai
from google.genai import types
from pinecone import Pinecone
import mysql.connector

class VectorStore:
    def __init__(self, db_config):
        self.db_config = db_config
        pinecone_key = os.getenv("PINECONE_API_KEY")
        if not pinecone_key:
            print("WARNING: PINECONE_API_KEY not found.")
        else:
            self.pc = Pinecone(api_key=pinecone_key)
            self.index = self.pc.Index("dhp-store")
            
        google_key = os.getenv("GOOGLE_API_KEY")
        if google_key:
            self.genai_client = genai.Client(api_key=google_key)
        else:
            print("WARNING: GOOGLE_API_KEY not found.")
            self.genai_client = None
            
    def get_embedding(self, text: str):
        if not self.genai_client:
            return []
        try:
            result = self.genai_client.models.embed_content(
                model="gemini-embedding-2",
                contents=text,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            return result.embeddings[0].values
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return []

    def sync_products_to_pinecone(self):
        print("Syncing products to Pinecone...")
        conn = mysql.connector.connect(**self.db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT p.id, p.name, p.description, p.price, c.name as category 
            FROM products p 
            JOIN categories c ON p.category_id = c.id
        """
        cursor.execute(query)
        products = cursor.fetchall()
        conn.close()
        
        vectors = []
        for p in products:
            text_to_embed = f"{p['name']} {p['description']} {p['category']}"
            embedding = self.get_embedding(text_to_embed)
            if embedding:
                vectors.append({
                    "id": str(p['id']),
                    "values": embedding,
                    "metadata": {
                        "name": p['name'],
                        "description": p['description'] or "",
                        "price": float(p['price']),
                        "category": p['category'],
                        "id": p['id']
                    }
                })
        
        if vectors:
            batch_size = 50
            for i in range(0, len(vectors), batch_size):
                self.index.upsert(vectors=vectors[i:i + batch_size])
            print(f"Successfully synced {len(vectors)} products to Pinecone.")
        else:
            print("No vectors to sync.")

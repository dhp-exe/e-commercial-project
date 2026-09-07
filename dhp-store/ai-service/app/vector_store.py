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
            SELECT 
              p.id, p.name, p.description, p.base_price, c.name as category,
              GROUP_CONCAT(DISTINCT s.name ORDER BY s.sort_order SEPARATOR ', ') as available_sizes,
              GROUP_CONCAT(DISTINCT cl.name SEPARATOR ', ') as available_colors,
              MIN(COALESCE(pv.price_override, p.base_price)) as min_price,
              MAX(COALESCE(pv.price_override, p.base_price)) as max_price
            FROM products p 
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
            LEFT JOIN sizes s ON pv.size_id = s.id
            LEFT JOIN colors cl ON pv.color_id = cl.id
            WHERE p.is_active = TRUE
            GROUP BY p.id, p.name, p.description, p.base_price, c.name
        """
        cursor.execute(query)
        products = cursor.fetchall()
        conn.close()
        
        vectors = []
        for p in products:
            text_to_embed = (
                f"{p['name']} {p['description'] or ''} {p['category']} "
                f"Sizes: {p['available_sizes'] or 'N/A'} "
                f"Colors: {p['available_colors'] or 'N/A'}"
            )
            embedding = self.get_embedding(text_to_embed)
            if embedding:
                min_p = float(p['min_price'] if p['min_price'] is not None else p['base_price'])
                max_p = float(p['max_price'] if p['max_price'] is not None else p['base_price'])
                vectors.append({
                    "id": str(p['id']),
                    "values": embedding,
                    "metadata": {
                        "name": p['name'],
                        "description": p['description'] or "",
                        "price": min_p,
                        "min_price": min_p,
                        "max_price": max_p,
                        "category": p['category'],
                        "available_sizes": p['available_sizes'] or "",
                        "available_colors": p['available_colors'] or "",
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

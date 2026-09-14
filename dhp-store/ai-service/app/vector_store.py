import os
from google import genai
from google.genai import types
from pinecone import Pinecone
import mysql.connector
from mysql.connector import pooling

class VectorStore:
    def __init__(self, db_config):
        self.db_config = db_config

        # ── Initialize MySQL Connection Pool 
        pool_size = int(os.getenv("DB_POOL_SIZE", 5))
        try:
            self.pool = pooling.MySQLConnectionPool(
                pool_name="vector_store_pool",
                pool_size=pool_size,
                pool_reset_session=True,
                **self.db_config
            )
            print(f"MySQL connection pool initialized (size: {pool_size})")
        except Exception as e:
            print(f"WARNING: Failed to initialize MySQL pool: {e}. Falling back to direct connections.")
            self.pool = None

        pinecone_key = os.getenv("PINECONE_API_KEY")
        index_name = os.getenv("PINECONE_INDEX_NAME", "dhp-store")
        if not pinecone_key:
            print("WARNING: PINECONE_API_KEY not found.")
            self.pc = None
            self.index = None
        else:
            self.pc = Pinecone(api_key=pinecone_key)
            self.index = self.pc.Index(index_name)
            
        google_key = os.getenv("GOOGLE_API_KEY")
        if google_key:
            cf_gateway_url = os.getenv("CF_AI_GATEWAY_URL")
            if cf_gateway_url:
                headers = {}
                cf_aig_token = os.getenv("CF_AIG_TOKEN")
                if cf_aig_token:
                    headers["cf-aig-authorization"] = f"Bearer {cf_aig_token}"
                http_options = types.HttpOptions(
                    base_url=cf_gateway_url.rstrip("/"),
                    headers=headers if headers else None,
                )
                self.genai_client = genai.Client(
                    api_key=google_key,
                    http_options=http_options
                )
            else:
                self.genai_client = genai.Client(api_key=google_key)
        else:
            print("WARNING: GOOGLE_API_KEY not found.")
            self.genai_client = None

    def _get_connection(self):
        if self.pool:
            return self.pool.get_connection()
        return mysql.connector.connect(**self.db_config)

            
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
        conn = self._get_connection()
        try:
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
            cursor.close()
        finally:
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

    def sync_single_product(self, product_id: int):
        """
        Embed and upsert a single active product into Pinecone.
        If product does not exist or is inactive, it will be removed from Pinecone.
        """
        if not self.index or not self.genai_client:
            print("VectorStore not initialized properly.")
            return False

        try:
            conn = self._get_connection()
            try:
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
                    WHERE p.id = %s AND p.is_active = TRUE
                    GROUP BY p.id, p.name, p.description, p.base_price, c.name
                """
                cursor.execute(query, (product_id,))
                p = cursor.fetchone()
                cursor.close()
            finally:
                conn.close()

            if not p:
                print(f"Product {product_id} not found or inactive. Removing from Pinecone...")
                return self.delete_single_product(product_id)

            text_to_embed = (
                f"{p['name']} {p['description'] or ''} {p['category']} "
                f"Sizes: {p['available_sizes'] or 'N/A'} "
                f"Colors: {p['available_colors'] or 'N/A'}"
            )
            embedding = self.get_embedding(text_to_embed)
            if not embedding:
                print(f"Failed to generate embedding for product {product_id}")
                return False

            min_p = float(p['min_price'] if p['min_price'] is not None else p['base_price'])
            max_p = float(p['max_price'] if p['max_price'] is not None else p['base_price'])

            vector = {
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
            }
            self.index.upsert(vectors=[vector])
            print(f"Successfully synced single product {product_id} to Pinecone.")
            return True
        except Exception as e:
            print(f"Error syncing single product {product_id} to Pinecone: {e}")
            return False

    def delete_single_product(self, product_id: int):
        """
        Delete a product vector from Pinecone by ID.
        """
        if not self.index:
            print("VectorStore index not initialized.")
            return False
        try:
            self.index.delete(ids=[str(product_id)])
            print(f"Successfully deleted product {product_id} from Pinecone.")
            return True
        except Exception as e:
            print(f"Error deleting product {product_id} from Pinecone: {e}")
            return False


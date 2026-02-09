import mysql.connector
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class Recommender:
    def __init__(self, db_config):
        self.db_config = db_config
        self.df = None
        self.similarity_matrix = None
        self.id_to_index = None
        
        # Load data immediately
        self.refresh()

    def refresh(self):
        print("Loading data from TiDB...")
        # 1. Connect to Database
        conn = mysql.connector.connect(**self.db_config)
        
        # 2. Fetch Data (ID, Name, Description, Category)
        query = """
            SELECT p.id, p.name, p.description, c.name as category 
            FROM products p 
            JOIN categories c ON p.category_id = c.id
        """
        self.df = pd.read_sql(query, conn)
        conn.close()

        # 3. Create "Soup" (Combine all text features into one string)
        self.df['soup'] = self.df['name'] + " " + self.df['description'] + " " + self.df['category']
        
        # 4. Vectorize (Convert text to numbers)
        tfidf = TfidfVectorizer(stop_words='english')
        tfidf_matrix = tfidf.fit_transform(self.df['soup'])
        
        # 5. Calculate Cosine Similarity (The Core AI)
        self.similarity_matrix = cosine_similarity(tfidf_matrix, tfidf_matrix)
        
        # 6. Create a lookup map (Product ID -> Matrix Index)
        self.id_to_index = pd.Series(self.df.index, index=self.df['id'])
        print("AI Model Ready!")

    def get_similar(self, product_id, top_n=4):
        # If product is new or invalid, return empty list
        if product_id not in self.id_to_index:
            return []

        # Get the index of the product
        idx = self.id_to_index[product_id]

        # Get similarity scores for this product
        scores = list(enumerate(self.similarity_matrix[idx]))

        # Sort by score (highest first)
        scores = sorted(scores, key=lambda x: x[1], reverse=True)

        # Get top N (skip the first one because it is the product itself)
        top_indices = [i[0] for i in scores[1:top_n+1]]

        # Return the actual Product IDs
        return self.df['id'].iloc[top_indices].tolist()
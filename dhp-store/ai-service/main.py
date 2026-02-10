import os
from fastapi import FastAPI
from recommender import Recommender
import uvicorn
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

# Database Config (Use Environment Variables for Security)
db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASS"),
    "database": os.getenv("DB_NAME"),
}

# Initialize AI Engine
rec_engine = Recommender(db_config)

@app.get("/")
def home():
    return {"status": "AI Service Running"}

@app.get("/recommend/{product_id}")
def recommend(product_id: int):
    """
    Returns a list of Product IDs similar to the given product_id.
    Example: /recommend/17 -> [12, 9, 20]
    """
    similar_ids = rec_engine.get_similar(product_id)
    return {"product_id": product_id, "recommendations": similar_ids}

@app.post("/refresh")
def refresh_model():
    """Call this when you add new products to update the AI"""
    rec_engine.refresh()
    return {"status": "Refreshed"}

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    response_text = rec_engine.chat(req.message)
    return {"reply": response_text}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10000)
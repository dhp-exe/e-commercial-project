import os
from fastapi import FastAPI, BackgroundTasks, Header, HTTPException
from recommender import Recommender
import uvicorn
from dotenv import load_dotenv
from pydantic import BaseModel
from google import genai
from google.genai import types
from app.tools import get_tools_list, TOOL_REGISTRY

load_dotenv()

app = FastAPI()

# Initialize GenAI Client
# Ensure GEMINI_API_KEY is in your environment variables, or it falls back to GOOGLE_API_KEY
import os
api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY"))
genai_client = genai.Client(api_key=api_key) if api_key else None

# Database Config (Use Environment Variables for Security)
db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASS"),
    "database": os.getenv("DB_NAME"),
}

# Enable SSL for TiDB Serverless (production)
if os.getenv("DB_SSL", "").lower() == "true":
    db_config["ssl_verify_cert"] = True
    db_config["ssl_disabled"] = False

# Initialize AI Engine
rec_engine = Recommender(db_config)

@app.head("/")
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
def refresh_model(background_tasks: BackgroundTasks):
    """Call this when you add new products to update the AI (runs in background)"""
    background_tasks.add_task(rec_engine.refresh)
    return {"status": "Refresh started"}

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat_endpoint(req: ChatRequest, x_user_id: str = Header(default=None)):
    if not genai_client:
        raise HTTPException(status_code=500, detail="GenAI client not configured.")
    
    # Initialize a temporary chat session for this request to handle the multi-turn function call
    chat = genai_client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            tools=get_tools_list(),
            temperature=0.1
        )
    )
    
    # 1. Receive Prompt -> 2. Call Gemini
    response = chat.send_message(req.message)
    
    # 3. If FunctionCall returned, execute local Python function
    if response.function_calls:
        # Support multiple function calls in one turn
        function_responses = []
        for function_call in response.function_calls:
            name = function_call.name
            args = function_call.args or {}
            
            # Security Guardrail: Forcefully inject the secure user_id
            if name == "get_order_history":
                if not x_user_id:
                    raise HTTPException(status_code=401, detail="X-User-Id header missing")
                args['user_id'] = int(x_user_id)
            
            if name in TOOL_REGISTRY:
                func = TOOL_REGISTRY[name]
                try:
                    result = func(**args)
                except Exception as e:
                    result = {"error": str(e)}
            else:
                result = {"error": f"Tool {name} not found."}
                
            # Prepare FunctionResponse
            function_responses.append(
                types.Part.from_function_response(
                    name=name,
                    response={"result": result}
                )
            )
            
        # 4. Send FunctionResponse back to Gemini
        # We send the parts containing the function responses to the chat
        final_response = chat.send_message(function_responses)
        
        # 5. Return final synthesized text to Express
        return {"reply": final_response.text}
    
    # If no function call, just return the text
    return {"reply": response.text}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
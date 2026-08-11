from .registry import register_tool
from typing import Optional, List, Dict, Any

@register_tool("get_order_history")
def get_order_history(category: Optional[str] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Fetches the user's order history from the TiDB database.

    Args:
        user_id: The ID of the user requesting their orders (DO NOT PROVIDE THIS, IT WILL BE INJECTED SECURELY).
        category: Optional product category to filter the order history by (e.g., 'electronics', 'clothing').

    Returns:
        A list of orders with their details.
    """
    import json
    from app.db import get_db_connection
    from app.cache import get_redis_client

    if user_id is None:
        return []

    cache_category = category.lower() if category else "all"
    cache_key = f"user:{user_id}:orders:{cache_category}"
    
    redis_client = None
    try:
        redis_client = get_redis_client()
        if redis_client:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
    except Exception as e:
        print(f"Redis cache error: {e}")
        # Proceed to DB query on cache failure

    # Cache miss or Redis down, query DB
    orders = []
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            sql = """
                SELECT 
                    o.id AS order_id, 
                    p.name AS product_name, 
                    c.name AS category, 
                    oi.price, 
                    o.status,
                    o.created_at
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE o.user_id = %s
            """
            params = [user_id]
            if category:
                sql += " AND c.name = %s"
                params.append(category)
            
            sql += " ORDER BY o.created_at DESC LIMIT 10"
            
            cursor.execute(sql, tuple(params))
            
            for row in cursor.fetchall():
                # Format datetime to string if necessary, but returning dicts directly works if JSON serializable
                if 'created_at' in row and row['created_at']:
                    row['created_at'] = str(row['created_at'])
                
                # Convert decimal to float
                if 'price' in row and row['price']:
                    row['price'] = float(row['price'])
                    
                orders.append(row)
                
    except Exception as e:
        print(f"DB Error: {e}")
        return []
    finally:
        if conn:
            conn.close()

    # Save to Redis
    try:
        if redis_client:
            redis_client.set(cache_key, json.dumps(orders), ex=300)
    except Exception as e:
        print(f"Redis set error: {e}")

    return orders

from .registry import register_tool
from typing import Optional, List, Dict, Any

@register_tool("get_order_history")
def get_order_history(user_id: int, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetches the user's order history from the TiDB database.

    Args:
        user_id: The ID of the user requesting their orders (DO NOT PROVIDE THIS, IT WILL BE INJECTED SECURELY).
        category: Optional product category to filter the order history by (e.g., 'electronics', 'clothing').

    Returns:
        A list of orders with their details.
    """
    # Mocking a TiDB query for demonstration purposes.
    # In a real scenario, this would use a database connection (e.g., mysql-connector-python)
    # to query the TiDB tables.
    
    mock_orders = [
        {"order_id": 101, "user_id": user_id, "product_name": "Wireless Mouse", "category": "electronics", "price": 25.99, "status": "delivered"},
        {"order_id": 102, "user_id": user_id, "product_name": "Mechanical Keyboard", "category": "electronics", "price": 89.99, "status": "shipped"},
        {"order_id": 103, "user_id": user_id, "product_name": "Cotton T-Shirt", "category": "clothing", "price": 15.00, "status": "delivered"},
    ]
    
    if category:
        return [order for order in mock_orders if order["category"].lower() == category.lower()]
    
    return mock_orders

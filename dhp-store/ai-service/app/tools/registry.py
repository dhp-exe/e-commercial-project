from typing import Callable, Dict, Any

# Map of tool_name -> actual python function
TOOL_REGISTRY: Dict[str, Callable] = {}

def register_tool(name: str = None):
    """Decorator to register a function as a Gemini tool."""
    def decorator(func: Callable):
        tool_name = name or func.__name__
        TOOL_REGISTRY[tool_name] = func
        return func
    return decorator

def get_tools_list() -> list[Callable]:
    """Returns the list of registered functions to be passed to Gemini."""
    return list(TOOL_REGISTRY.values())
